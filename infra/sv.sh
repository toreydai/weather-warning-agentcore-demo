#!/bin/bash
# Single operational entrypoint for Weather Warning deploy tasks.
#
# Daily use (no CDK required):
#   ./infra/sv.sh deploy web       # fast code deploy: build image, update ECS, smoke
#   ./infra/sv.sh deploy job       # build job image and update EventBridge schedules
#   ./infra/sv.sh deploy all       # web fast deploy + job deploy
#   ./infra/sv.sh smoke
#   ./infra/sv.sh rollback
#
# IaC (requires AWS credentials + CDK bootstrap):
#   ./infra/sv.sh cdk synth        # preview CloudFormation template
#   ./infra/sv.sh cdk diff         # show what would change
#   ./infra/sv.sh cdk import       # adopt existing AWS resources into CDK state
#   ./infra/sv.sh cdk deploy [--context webImageTag=xxx --context jobImageTag=yyy]
#   ./infra/sv.sh cdk <anything>   # forwards directly to `cdk <anything>`
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

REGION="${REGION:-us-east-1}"
# Set ACCOUNT_ID environment variable before running
ACCOUNT_ID="${ACCOUNT_ID:-}"
CLUSTER_NAME="${CLUSTER_NAME:-weather-warning}"
SERVICE_NAME="${SERVICE_NAME:-weather-warning-web}"
TASK_FAMILY="${TASK_FAMILY:-weather-warning-web}"
CONTAINER_NAME="${CONTAINER_NAME:-web}"
ALB_NAME="${ALB_NAME:-weather-warning-agentcore-alb}"
WEB_ECR_REPO="${WEB_ECR_REPO:-$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/weather-warning-agentcore}"
JOB_ECR_REPO="${JOB_ECR_REPO:-$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/weather-warning-agentcore-job}"
JOB_TASK_FAMILY="${JOB_TASK_FAMILY:-weather-warning-job}"
SECRET_NAME="${SECRET_NAME:-weather-warning/agentcore/app}"
EXECUTION_ROLE_NAME="${EXECUTION_ROLE_NAME:-weather-warning-ecsTaskExecutionRole}"
TASK_ROLE_NAME="${TASK_ROLE_NAME:-weather-warning-ecsTaskRole}"
SMOKE_USERNAME="${SMOKE_USERNAME:-admin}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-}"
SKIP_SMOKE="${SKIP_SMOKE:-0}"

log() { echo "=== $* ===" >&2; }

usage() {
  cat >&2 <<'EOF'
Usage:
  infra/sv.sh deploy web               Fast web code deploy. Builds image, updates ECS, runs smoke.
  infra/sv.sh deploy job               Build job image and update EventBridge schedules.
  infra/sv.sh deploy agent [name|--all] Deploy AgentCore agents via agentcore CLI (default: --all).
  infra/sv.sh deploy all               Fast web deploy + job deploy.
  infra/sv.sh smoke                Run production smoke test.
  infra/sv.sh rollback [td]        Roll back web service to td, or previous active revision.
  infra/sv.sh cdk synth            Preview CloudFormation template (no AWS calls).
  infra/sv.sh cdk diff             Show what `cdk deploy` would change in AWS.
  infra/sv.sh cdk import           Adopt existing resources into CDK state (first-time setup).
  infra/sv.sh cdk deploy [args]    Deploy IaC changes; pass --context webImageTag=xxx as needed.
  infra/sv.sh cdk <cmd> [args]     Forward any cdk subcommand from the infra/cdk directory.
  infra/sv.sh secrets              Interactively update a single key in Secrets Manager.
  infra/sv.sh cleanup [keep=5]     Deregister old ECS task definitions and delete old S3 build-context files.

Useful env:
  IMAGE_TAG=manual-tag         Reuse or name a release tag.
  SKIP_SMOKE=1                Skip smoke after web deploy.
  RUN_MIGRATIONS=1            Run db:check + db:migrate before fast web deploy.
EOF
}

aws_text() {
  aws "$@" --region "$REGION" --output text
}

alb_dns_name() {
  aws_text elbv2 describe-load-balancers \
    --names "$ALB_NAME" \
    --query 'LoadBalancers[0].DNSName'
}

current_task_def_arn() {
  aws_text ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE_NAME" \
    --query 'services[0].taskDefinition'
}

run_db_migrations_if_requested() {
  if [ "${RUN_MIGRATIONS:-0}" != "1" ]; then
    return 0
  fi

  log "Checking Drizzle migrations"
  ( cd "$PROJECT_DIR" && npm run db:check )

  log "Running DB migrations"
  (
    cd "$PROJECT_DIR"
    set -a
    # shellcheck disable=SC1091
    . "$PROJECT_DIR/.env.local"
    set +a
    npm run db:migrate
  )
}

run_smoke() {
  local base="${1:-}"
  if [ -z "$base" ]; then
    base="http://$(alb_dns_name)"
  fi
  log "Running smoke test against $base"
  ( cd "$PROJECT_DIR" && npx tsx scripts/smoke-test.ts \
    --base "$base" \
    --username "$SMOKE_USERNAME" \
    --password "$SMOKE_PASSWORD" )
}

register_web_task_from_current() {
  local image_uri="$1"
  local current_td="$2"
  local in_file out_file new_td
  in_file=$(mktemp)
  out_file=$(mktemp)

  aws ecs describe-task-definition --region "$REGION" \
    --task-definition "$current_td" \
    --query 'taskDefinition' > "$in_file"

  jq \
    --arg container "$CONTAINER_NAME" \
    --arg image "$image_uri" \
    'del(
      .taskDefinitionArn,
      .revision,
      .status,
      .requiresAttributes,
      .compatibilities,
      .registeredAt,
      .registeredBy,
      .deregisteredAt
    )
    | .containerDefinitions |= map(if .name == $container then .image = $image else . end)' \
    "$in_file" > "$out_file"

  new_td=$(aws_text ecs register-task-definition \
    --cli-input-json "file://$out_file" \
    --query 'taskDefinition.taskDefinitionArn')

  rm -f "$in_file" "$out_file"
  echo "$new_td"
}

update_web_service() {
  local task_def="$1"
  aws ecs update-service --region "$REGION" \
    --cluster "$CLUSTER_NAME" \
    --service "$SERVICE_NAME" \
    --task-definition "$task_def" \
    --force-new-deployment >/dev/null
}

wait_web_stable() {
  log "Waiting for ECS service stability"
  aws ecs wait services-stable --region "$REGION" \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE_NAME"
}

rollback_web() {
  local target_td="${1:-}"
  if [ -z "$target_td" ]; then
    target_td=$(aws_text ecs list-task-definitions \
      --family-prefix "$TASK_FAMILY" \
      --status ACTIVE \
      --sort DESC \
      --max-items 2 \
      --query 'taskDefinitionArns[1]')
  fi

  if [ -z "$target_td" ] || [ "$target_td" = "None" ]; then
    echo "No rollback task definition found. Pass one explicitly: infra/sv.sh rollback <task-definition-arn>" >&2
    exit 1
  fi

  log "Rolling back $SERVICE_NAME to $target_td"
  update_web_service "$target_td"
  wait_web_stable
  echo "Rolled back to $target_td"
}

deploy_web_fast() {
  command -v jq >/dev/null || { echo "jq required" >&2; exit 1; }

  local image_tag image_uri prev_td new_td
  image_tag="${IMAGE_TAG:-web-$(date -u +%Y%m%d-%H%M%S)}"
  image_uri="$WEB_ECR_REPO:$image_tag"
  export IMAGE_TAG="$image_tag"
  export STOP_BUILDER="${STOP_BUILDER:-0}"

  run_db_migrations_if_requested

  "$SCRIPT_DIR/build-image.sh" web

  prev_td=$(current_task_def_arn)
  log "Registering web task definition from current service shape"
  new_td=$(register_web_task_from_current "$image_uri" "$prev_td")
  echo "Task def: $new_td"

  log "Updating $SERVICE_NAME to $image_uri"
  update_web_service "$new_td"
  wait_web_stable

  if [ "$SKIP_SMOKE" = "1" ]; then
    echo "Smoke test skipped (SKIP_SMOKE=1)."
  elif run_smoke; then
    log "Smoke test passed"
  else
    log "Smoke test FAILED; rolling back"
    update_web_service "$prev_td"
    wait_web_stable
    echo "Deployment rolled back to $prev_td." >&2
    exit 1
  fi

  echo "Web deploy finished: $image_uri"
  main cleanup 3
}

run_cdk() {
  local cdk_dir="$SCRIPT_DIR/cdk"
  [ -f "$cdk_dir/package.json" ] || { echo "CDK project not found at $cdk_dir" >&2; exit 1; }
  command -v npx >/dev/null || { echo "npx not found; install Node.js" >&2; exit 1; }
  ( cd "$cdk_dir" && npm run build >/dev/null && npx cdk "$@" )
}

register_job_task() {
  local image_uri="$1"
  local secret_arn exec_arn task_arn td_file new_td
  secret_arn=$(aws_text secretsmanager describe-secret --secret-id "$SECRET_NAME" --query ARN)
  exec_arn=$(aws_text iam get-role --role-name "$EXECUTION_ROLE_NAME" --query 'Role.Arn')
  task_arn=$(aws_text iam get-role --role-name "$TASK_ROLE_NAME" --query 'Role.Arn')
  td_file=$(mktemp)

  jq -n \
    --arg family "$JOB_TASK_FAMILY" \
    --arg execRole "$exec_arn" \
    --arg taskRole "$task_arn" \
    --arg image "$image_uri" \
    --arg region "$REGION" \
    --arg secret "$secret_arn" \
    '{
      family: $family,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      runtimePlatform: { cpuArchitecture: "X86_64", operatingSystemFamily: "LINUX" },
      cpu: "512", memory: "1024",
      executionRoleArn: $execRole,
      taskRoleArn: $taskRole,
      containerDefinitions: [{
        name: "job", image: $image, essential: true,
        environment: [
          { name: "NODE_ENV", value: "production" },
          { name: "AWS_REGION", value: $region }
        ],
        secrets: [
          "DATABASE_URL","AUTH_SECRET","AUTH_TRUST_HOST","PASSWORD_EXPIRE_DAYS",
          "KNOWLEDGE_BASE_ID","KNOWLEDGE_BASE_BUCKET","KNOWLEDGE_BASE_DATA_SOURCE_ID",
          "USE_AGENTCORE_FARMING",
          "FARMING_ADVISOR_FAST_ARN","FARMING_ADVISOR_DEEP_ARN",
          "WEATHER_ANALYST_ARN","ALERT_ANALYST_ARN",
          "CRON_ALERT_SNS_TOPIC_ARN",
          "FEATURE_DAILY_ALERT","FEATURE_FORECAST_45D","FEATURE_WECOM_PUSH",
          "FEATURE_KB_UPLOAD","LOG_LEVEL"
        ] | map({ name: ., valueFrom: ($secret + ":" + . + "::") }),
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": "/weather-warning/job",
            "awslogs-region": $region,
            "awslogs-stream-prefix": "job"
          }
        }
      }]
    }' > "$td_file"

  new_td=$(aws_text ecs register-task-definition \
    --cli-input-json "file://$td_file" \
    --query 'taskDefinition.taskDefinitionArn')
  rm -f "$td_file"
  echo "$new_td"
}

deploy_job() {
  command -v jq >/dev/null || { echo "jq required" >&2; exit 1; }

  local image_tag image_uri new_td
  image_tag="${IMAGE_TAG:-job-$(date -u +%Y%m%d-%H%M%S)}"
  image_uri="$JOB_ECR_REPO:$image_tag"
  export IMAGE_TAG="$image_tag"
  export STOP_BUILDER="${STOP_BUILDER:-0}"

  "$SCRIPT_DIR/build-image.sh" job

  log "Registering job task definition"
  new_td=$(register_job_task "$image_uri")
  echo "Job deploy finished: $image_uri ($new_td)"
  main cleanup 3
}

deploy_agent() {
  local agents_dir="$PROJECT_DIR/agents"
  [ -f "$agents_dir/deploy.sh" ] || { echo "agents/deploy.sh not found" >&2; exit 1; }
  command -v agentcore >/dev/null || { echo "agentcore CLI not found; install: pip install bedrock-agentcore-client" >&2; exit 1; }
  local target="${1:---all}"
  "$agents_dir/deploy.sh" "$target"
}

deploy_all() {
  if [ -n "${IMAGE_TAG:-}" ]; then
    deploy_web_fast
    deploy_job
    return
  fi

  local stamp
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  IMAGE_TAG="web-$stamp" deploy_web_fast
  IMAGE_TAG="job-$stamp" deploy_job
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    deploy)
      case "${2:-}" in
        web) deploy_web_fast ;;
        job) deploy_job ;;
        agent) deploy_agent "${3:-}" ;;
        all) deploy_all ;;
        *) usage; exit 2 ;;
      esac
      ;;
    smoke)
      run_smoke "${2:-}"
      ;;
    rollback)
      rollback_web "${2:-}"
      ;;
    cdk)
      shift
      run_cdk "$@"
      ;;
    secrets)
      # 交互式更新 Secrets Manager 中的单个 key
      local key val current
      read -rp "要更新的 key（如 FARMING_ADVISOR_DEEP_ARN）: " key
      read -rp "新的值: " val
      current=$(aws secretsmanager get-secret-value \
        --secret-id "$SECRET_NAME" --region "$REGION" \
        --query SecretString --output text)
      updated=$(echo "$current" | jq --arg k "$key" --arg v "$val" '.[$k] = $v')
      aws secretsmanager put-secret-value \
        --secret-id "$SECRET_NAME" --region "$REGION" \
        --secret-string "$updated"
      echo "已更新 $key，重新部署 Web 生效：./infra/sv.sh deploy web"
      ;;
    cleanup)
      # 清理过期资源：旧 ECS task definitions、S3 build-context 旧包
      local keep="${2:-5}"
      log "Cleanup: keeping latest $keep task definitions and build-context files"

      # ECS web task definitions
      local all_tds active_td
      active_td=$(current_task_def_arn)
      mapfile -t all_tds < <(aws_text ecs list-task-definitions \
        --family-prefix "$TASK_FAMILY" --status ACTIVE --sort DESC \
        --query 'taskDefinitionArns[]' | tr '\t' '\n')
      local count=0
      for td in "${all_tds[@]}"; do
        count=$((count + 1))
        if [ "$count" -le "$keep" ] || [ "$td" = "$active_td" ]; then
          echo "keep: $td"
        else
          aws ecs deregister-task-definition --region "$REGION" \
            --task-definition "$td" --query 'taskDefinition.taskDefinitionArn' --output text
          echo "deregistered: $td"
        fi
      done

      # ECS job task definitions
      mapfile -t all_tds < <(aws_text ecs list-task-definitions \
        --family-prefix "$JOB_TASK_FAMILY" --status ACTIVE --sort DESC \
        --query 'taskDefinitionArns[]' | tr '\t' '\n')
      count=0
      for td in "${all_tds[@]}"; do
        count=$((count + 1))
        if [ "$count" -le "$keep" ]; then
          echo "keep: $td"
        else
          aws ecs deregister-task-definition --region "$REGION" \
            --task-definition "$td" --query 'taskDefinition.taskDefinitionArn' --output text
          echo "deregistered: $td"
        fi
      done

      # S3 build-context（按时间排序，保留最新 keep 个）
      local s3_prefix="s3://${S3_BUCKET:-weather-warning-backups-$ACCOUNT_ID}/build-context/"
      mapfile -t all_files < <(aws s3 ls "$s3_prefix" --region "$REGION" \
        | sort | awk '{print $4}' | grep -v '^$')
      local total=${#all_files[@]}
      local to_delete=$(( total - keep ))
      if [ "$to_delete" -gt 0 ]; then
        for f in "${all_files[@]:0:$to_delete}"; do
          aws s3 rm "${s3_prefix}${f}" --region "$REGION"
          echo "deleted: build-context/$f"
        done
      fi

      log "Cleanup done"
      ;;
    help|-h|--help|"")
      usage
      ;;
    *)
      usage
      exit 2
      ;;
  esac
}

main "$@"

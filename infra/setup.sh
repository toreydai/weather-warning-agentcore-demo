#!/bin/bash
# 首次部署向导：引导填写配置 → CDK 建基础设施 → 初始化 DB → 上传 KB → 部署 Agent → 部署应用
# 用法：./infra/setup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REGION="${REGION:-us-east-1}"
SECRET_NAME="${SECRET_NAME:-weather-warning/agentcore/app}"

log()  { echo ""; echo "=== $* ===" >&2; }
ask()  { local var="$1" prompt="$2" default="${3:-}"; read -rp "$prompt${default:+ [$default]}: " val; printf -v "$var" '%s' "${val:-$default}"; }
askp() { local var="$1" prompt="$2"; read -rsp "$prompt: " val; echo ""; printf -v "$var" '%s' "$val"; }

# ── 1. 收集配置 ──────────────────────────────────────────────────────────────
log "Step 1/6  收集配置"

ask DB_URL      "DATABASE_URL (postgresql://user:pass@host:5432/db)"
askp AUTH_SECRET "AUTH_SECRET (随机字符串，至少16位)"
echo ""
echo "以下值在 CDK 部署完成后才能填写，现在可以先留空，之后用 ./infra/sv.sh secrets 更新。"
ask KB_ID       "KNOWLEDGE_BASE_ID" ""
ask KB_BUCKET   "KNOWLEDGE_BASE_BUCKET" ""
ask KB_DS_ID    "KNOWLEDGE_BASE_DATA_SOURCE_ID" ""
ask FAST_ARN    "FARMING_ADVISOR_FAST_ARN" ""
ask DEEP_ARN    "FARMING_ADVISOR_DEEP_ARN" ""

SECRET_JSON=$(jq -n \
  --arg db       "$DB_URL" \
  --arg auth     "$AUTH_SECRET" \
  --arg kb       "$KB_ID" \
  --arg kbb      "$KB_BUCKET" \
  --arg kbds     "$KB_DS_ID" \
  --arg fast     "$FAST_ARN" \
  --arg deep     "$DEEP_ARN" \
  '{
    DATABASE_URL: $db,
    AUTH_SECRET: $auth,
    KNOWLEDGE_BASE_ID: $kb,
    KNOWLEDGE_BASE_BUCKET: $kbb,
    KNOWLEDGE_BASE_DATA_SOURCE_ID: $kbds,
    USE_AGENTCORE_FARMING: "true",
    FARMING_ADVISOR_FAST_ARN: $fast,
    FARMING_ADVISOR_DEEP_ARN: $deep,
    FEATURE_DAILY_ALERT: "false",
    FEATURE_WECOM_PUSH: "false",
    FEATURE_FORECAST_45D: "false",
    FEATURE_KB_UPLOAD: "false",
    LOG_LEVEL: "info"
  }')

# ── 2. CDK 部署基础设施 ───────────────────────────────────────────────────────
log "Step 2/6  CDK 部署基础设施（约 15-30 分钟）"
"$SCRIPT_DIR/sv.sh" cdk deploy

# ── 3. 写入 Secrets Manager ───────────────────────────────────────────────────
log "Step 3/6  写入 Secrets Manager"
aws secretsmanager put-secret-value \
  --secret-id "$SECRET_NAME" \
  --region "$REGION" \
  --secret-string "$SECRET_JSON"
echo "Secret 已写入：$SECRET_NAME"

# ── 4. 初始化数据库 ───────────────────────────────────────────────────────────
log "Step 4/6  初始化数据库"
( cd "$PROJECT_DIR" && DATABASE_URL="$DB_URL" npm run db:migrate && DATABASE_URL="$DB_URL" npm run db:init )

# ── 5. 上传知识库文档 ─────────────────────────────────────────────────────────
if [ -n "$KB_BUCKET" ] && [ -n "$KB_ID" ] && [ -n "$KB_DS_ID" ]; then
  log "Step 5/6  上传知识库文档"
  aws s3 sync "$PROJECT_DIR/knowledge-base/" "s3://$KB_BUCKET/knowledge-base/" --region "$REGION"
  aws bedrock-agent start-ingestion-job \
    --knowledge-base-id "$KB_ID" \
    --data-source-id "$KB_DS_ID" \
    --region "$REGION"
  echo "KB ingestion 已触发（异步，约需数分钟）"
else
  log "Step 5/6  跳过知识库上传（KB 配置未填写）"
  echo "后续填写 KB 配置后，运行：./infra/setup.sh sync-kb"
fi

# ── 6. 部署应用镜像 ───────────────────────────────────────────────────────────
log "Step 6/6  部署应用镜像"
"$SCRIPT_DIR/sv.sh" deploy all

echo ""
echo "======================================================"
echo "  部署完成！"
echo ""
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names weather-warning-agentcore-alb \
  --region "$REGION" \
  --query 'LoadBalancers[0].DNSName' \
  --output text 2>/dev/null || echo "(查询失败，请手动查看 ALB)")
echo "  访问地址：http://$ALB_DNS"
echo "  默认账号：admin / admin123（首次登录需改密）"
echo ""
if [ -z "$FAST_ARN" ] || [ -z "$DEEP_ARN" ]; then
  echo "  ⚠️  AgentCore Runtime ARN 未填写，病虫害功能暂不可用。"
  echo "     部署 Agent 后运行：./infra/sv.sh deploy agent --all"
  echo "     然后更新 ARN：./infra/sv.sh secrets"
fi
echo "======================================================"

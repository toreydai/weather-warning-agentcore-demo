#!/bin/bash
# Build an image for target (web|job) and push it to ECR, then push to ECR.
#
# Usage:
#   IMAGE_TAG=web-20260428-010203 ./infra/build-image.sh web
#   IMAGE_TAG=job-20260428-010203 ./infra/build-image.sh job
set -euo pipefail

TARGET="${1:-}"
if [ "$TARGET" != "web" ] && [ "$TARGET" != "job" ]; then
  echo "Usage: $0 web|job" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

REGION="${REGION:-us-east-1}"
ACCOUNT_ID="${ACCOUNT_ID:-564535962140}"
IMAGE_TAG="${IMAGE_TAG:-$(date -u +%Y%m%d-%H%M%S)}"

if [ "$TARGET" = "web" ]; then
  ECR_REPO_NAME="${ECR_REPO_NAME:-weather-warning-agentcore}"
  DOCKERFILE="Dockerfile"
else
  ECR_REPO_NAME="${ECR_REPO_NAME:-weather-warning-agentcore-job}"
  DOCKERFILE="Dockerfile.job"
fi

ECR_REPO="${ECR_REPO:-$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO_NAME}"

log() { echo "=== $* ===" >&2; }

ensure_repo() {
  log "Ensuring ECR repo $ECR_REPO_NAME"
  aws ecr describe-repositories --repository-names "$ECR_REPO_NAME" --region "$REGION" >/dev/null 2>&1 \
    || aws ecr create-repository \
      --repository-name "$ECR_REPO_NAME" \
      --image-scanning-configuration scanOnPush=true \
      --region "$REGION" \
      --tags Key=Project,Value=weather-warning-agentcore-demo >/dev/null
}

build_and_push() {
  log "Building $TARGET and pushing to $ECR_REPO:$IMAGE_TAG"
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com" >/dev/null
  local image_uri="$ECR_REPO:$IMAGE_TAG"
  ( cd "$PROJECT_DIR" && DOCKER_BUILDKIT=1 docker build \
      --build-arg BUILDKIT_INLINE_CACHE=1 \
      --cache-from "$ECR_REPO:latest" \
      -f "$DOCKERFILE" -t "$image_uri" -t "$ECR_REPO:latest" . )
  docker push "$image_uri"
  docker push "$ECR_REPO:latest"
}

main() {
  ensure_repo
  build_and_push
  echo "OK $ECR_REPO:$IMAGE_TAG"
}

main "$@"

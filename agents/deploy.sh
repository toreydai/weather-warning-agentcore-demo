#!/bin/bash
# Agent deploy wrapper — reads DATABASE_URL / KNOWLEDGE_BASE_ID from project .env.local
# and injects them into `agentcore deploy` as --env flags, since
# .bedrock_agentcore.yaml does not persist env vars between deploys.
#
# Usage:
#   ./deploy.sh <agent-dir>                   # deploy one agent
#   ./deploy.sh --all                         # deploy every agent dir
#   ./deploy.sh <agent-dir> -- <extra flags>  # pass extra flags through
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found" >&2
  exit 1
fi

get_env() {
  grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

DATABASE_URL="$(get_env DATABASE_URL)"
KNOWLEDGE_BASE_ID="$(get_env KNOWLEDGE_BASE_ID)"

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL missing from $ENV_FILE" >&2
  exit 1
fi

ENV_ARGS=(--env "DATABASE_URL=$DATABASE_URL")
[ -n "$KNOWLEDGE_BASE_ID" ] && ENV_ARGS+=(--env "KNOWLEDGE_BASE_ID=$KNOWLEDGE_BASE_ID")

deploy_one() {
  local dir="$1"; shift || true
  if [ ! -f "$dir/.bedrock_agentcore.yaml" ]; then
    echo "Skip $dir (no .bedrock_agentcore.yaml)" >&2
    return 0
  fi
  echo "=== Deploying $(basename "$dir") ==="
  (cd "$dir" && agentcore deploy "${ENV_ARGS[@]}" "$@")
}

if [ "${1:-}" = "--all" ]; then
  shift
  for d in "$SCRIPT_DIR"/*/; do
    deploy_one "${d%/}" "$@"
  done
else
  [ $# -lt 1 ] && { echo "Usage: $0 <agent-dir> | --all" >&2; exit 1; }
  target="$1"; shift
  [ -d "$SCRIPT_DIR/$target" ] && target="$SCRIPT_DIR/$target"
  # strip leading "--" separator if present
  [ "${1:-}" = "--" ] && shift
  deploy_one "$target" "$@"
fi

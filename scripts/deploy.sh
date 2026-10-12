#!/usr/bin/env bash
# Docker-only production lifecycle. Run from any working directory.
set -euo pipefail
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"
export BLINDPASS_ENV_FILE="${BLINDPASS_ENV_FILE:-$PROJECT_ROOT/.env.production}"
export BLINDPASS_KEYS_FILE="${BLINDPASS_KEYS_FILE:-$PROJECT_ROOT/.secrets/production.env}"
TOOLS_IMAGE="${BLINDPASS_TOOLS_IMAGE:-blindpass-tools:local}"
compose() {
  docker compose --env-file "$BLINDPASS_ENV_FILE" -f "$PROJECT_ROOT/infra/compose.production.yml" "$@"
}
key_tool() {
  local key_directory
  key_directory="$(dirname -- "$BLINDPASS_KEYS_FILE")"
  docker run --rm --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=$key_directory,dst=/keys" \
    "$TOOLS_IMAGE" pnpm exec tsx "$@"
}
case "${1:-help}" in
  init)
    umask 077
    if [[ ! -f "$BLINDPASS_ENV_FILE" ]]; then
      cp .env.production.example "$BLINDPASS_ENV_FILE"
      chmod 600 "$BLINDPASS_ENV_FILE"
    fi
    mkdir -p -- "$(dirname -- "$BLINDPASS_KEYS_FILE")"
    if [[ -e "$BLINDPASS_KEYS_FILE" ]]; then
      echo 'Existing signing keys retained. Edit the deployment environment, then run check/build/up.'
      exit 0
    fi
    docker build -f infra/Dockerfile --target tools -t "$TOOLS_IMAGE" .
    key_tool scripts/generate-keys.ts "/keys/$(basename -- "$BLINDPASS_KEYS_FILE")"
    echo 'Set the printed PUBLIC fingerprint and remaining settings in the deployment environment file.'
    ;;
  check) compose config --quiet ;;
  build) compose build --pull api web ;;
  up) compose up -d --wait --wait-timeout 300 ;;
  pull) compose pull ;;
  status) compose ps ;;
  logs) compose logs --tail 100 "${2:-api}" ;;
  stop) compose stop ;;
  backup)
    umask 077
    mkdir -p backups
    backup_path="backups/blindpass-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
    # A failed dump never leaves a file that looks like a completed backup.
    trap 'rm -f -- "$backup_path.partial"' EXIT
    compose exec -T postgres pg_dump -U blindpass -Fc blindpass > "$backup_path.partial"
    mv -- "$backup_path.partial" "$backup_path"
    echo "Database backup saved to $backup_path. Back up the matching keys separately."
    ;;
  provision)
    [[ $# -eq 2 ]] || { echo 'Usage: ./scripts/deploy.sh provision YYYY-MM' >&2; exit 2; }
    docker build -f infra/Dockerfile --target tools -t "$TOOLS_IMAGE" .
    key_tool scripts/provision-epoch.ts "$2" "/keys/$(basename -- "$BLINDPASS_KEYS_FILE")"
    echo 'Back up the updated keys, then recreate the API to load them (see deployment guide).'
    ;;
  *)
    echo 'Usage: ./scripts/deploy.sh {init|check|build|up|pull|status|logs [service]|stop|backup|provision YYYY-MM}'
    echo 'See docs/docker-deployment.md. Set absolute BLINDPASS_ENV_FILE/BLINDPASS_KEYS_FILE paths for another deployment.'
    [[ "${1:-help}" == help ]]
    ;;
esac

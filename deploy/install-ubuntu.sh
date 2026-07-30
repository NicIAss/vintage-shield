#!/usr/bin/env bash

set -Eeuo pipefail

show_help() {
  printf '%s\n' \
    "Vintage Shield installer for Ubuntu" \
    "" \
    "Usage:" \
    "  sudo bash deploy/install-ubuntu.sh" \
    "  sudo bash deploy/install-ubuntu.sh --reconfigure" \
    "" \
    "The first run asks for:" \
    "  1. Public domain or subdomain" \
    "  2. Private Discord server ID" \
    "  3. Discord bot token" \
    "" \
    "Internal API and PostgreSQL passwords are generated automatically."
}

RECONFIGURE=false
case "${1:-}" in
  "")
    ;;
  --reconfigure)
    RECONFIGURE=true
    ;;
  --help|-h)
    show_help
    exit 0
    ;;
  *)
    printf 'Unknown option: %s\n\n' "$1" >&2
    show_help >&2
    exit 2
    ;;
esac

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Run this installer as root: sudo bash deploy/install-ubuntu.sh\n' >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  printf 'Cannot identify this operating system.\n' >&2
  exit 1
fi

# shellcheck disable=SC1091
. /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  printf 'This installer supports Ubuntu. Detected: %s\n' "${PRETTY_NAME:-unknown}" >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_DIR}/.env"
PROXY_SOURCE_DIR="${PROJECT_DIR}/deploy/proxy"
PROXY_DIR="/opt/vps-proxy"
PROXY_ENV_FILE="${PROXY_DIR}/.env"

read_env_value() {
  local file="$1"
  local key="$2"

  [[ -f "$file" ]] || return 0
  awk -F= -v wanted="$key" '
    $1 == wanted {
      sub(/^[^=]*=/, "")
      print
      exit
    }
  ' "$file"
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local temp_file

  temp_file="$(mktemp)"
  if [[ -f "$file" ]]; then
    awk -F= -v wanted="$key" -v replacement="$value" '
      BEGIN { found = 0 }
      $1 == wanted {
        print wanted "=" replacement
        found = 1
        next
      }
      { print }
      END {
        if (!found) {
          print wanted "=" replacement
        }
      }
    ' "$file" > "$temp_file"
  else
    printf '%s=%s\n' "$key" "$value" > "$temp_file"
  fi

  install -m 0600 "$temp_file" "$file"
  rm -f "$temp_file"
}

prompt_domain() {
  local value
  while true; do
    read -r -p "Public domain or subdomain, for example bans.example.com: " value
    value="${value,,}"
    if [[ "$value" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ && "$value" == *.* ]]; then
      printf '%s' "$value"
      return
    fi
    printf 'Enter a hostname with a dot and no http:// or path.\n' >&2
  done
}

prompt_guild_id() {
  local value
  while true; do
    read -r -p "Private Discord server ID: " value
    if [[ "$value" =~ ^[0-9]{15,22}$ ]]; then
      printf '%s' "$value"
      return
    fi
    printf 'The Discord server ID must contain 15 to 22 digits.\n' >&2
  done
}

prompt_discord_token() {
  local value
  while true; do
    read -r -s -p "Discord bot token: " value
    printf '\n' >&2
    if [[ -n "$value" && "$value" != "replace-with-the-discord-bot-token" ]]; then
      printf '%s' "$value"
      return
    fi
    printf 'The Discord bot token cannot be empty.\n' >&2
  done
}

printf 'Installing required Ubuntu packages...\n'
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl openssl

install_docker_repo() {
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  local codename
  codename="${UBUNTU_CODENAME:-${VERSION_CODENAME}}"
  printf '%s\n' \
    "Types: deb" \
    "URIs: https://download.docker.com/linux/ubuntu" \
    "Suites: ${codename}" \
    "Components: stable" \
    "Architectures: $(dpkg --print-architecture)" \
    "Signed-By: /etc/apt/keyrings/docker.asc" \
    > /etc/apt/sources.list.d/docker.sources
  apt-get update
}

if ! command -v docker >/dev/null 2>&1; then
  printf 'Installing Docker Engine and Docker Compose...\n'
  install_docker_repo
  apt-get install -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin
elif ! docker compose version >/dev/null 2>&1; then
  printf 'Installing the Docker Compose plugin...\n'
  install_docker_repo
  apt-get install -y docker-compose-plugin
else
  printf 'Docker Engine and Docker Compose are already installed.\n'
fi

systemctl enable --now docker

if [[ -f "$ENV_FILE" && "$RECONFIGURE" == false ]]; then
  read -r -p "Reuse the existing Vintage Shield configuration? [Y/n]: " reuse_config
  case "${reuse_config,,}" in
    n|no)
      RECONFIGURE=true
      ;;
  esac
fi

DOMAIN="$(read_env_value "$ENV_FILE" DOMAIN)"
ADMIN_GUILD_ID="$(read_env_value "$ENV_FILE" ADMIN_GUILD_ID)"
DISCORD_TOKEN="$(read_env_value "$ENV_FILE" DISCORD_TOKEN)"
POSTGRES_PASSWORD="$(read_env_value "$ENV_FILE" POSTGRES_PASSWORD)"
BOT_API_KEY="$(read_env_value "$ENV_FILE" BOT_API_KEY)"
ENV_NEEDS_BACKUP="$RECONFIGURE"

if [[ ! -f "$ENV_FILE" || "$RECONFIGURE" == true ]]; then
  DOMAIN="$(prompt_domain)"
  ADMIN_GUILD_ID="$(prompt_guild_id)"
  DISCORD_TOKEN="$(prompt_discord_token)"
fi

if [[ -z "$DOMAIN" || "$DOMAIN" != *.* ]]; then
  printf 'DOMAIN is missing or invalid. Run with --reconfigure.\n' >&2
  exit 1
fi
if [[ ! "$ADMIN_GUILD_ID" =~ ^[0-9]{15,22}$ ]]; then
  printf 'ADMIN_GUILD_ID is missing or invalid. Run with --reconfigure.\n' >&2
  exit 1
fi
if [[ -z "$DISCORD_TOKEN" || "$DISCORD_TOKEN" == "replace-with-the-discord-bot-token" ]]; then
  printf 'DISCORD_TOKEN is missing. Run with --reconfigure.\n' >&2
  exit 1
fi

if [[ -z "$POSTGRES_PASSWORD" || "$POSTGRES_PASSWORD" == "generated-by-the-installer" ]]; then
  POSTGRES_PASSWORD="$(openssl rand -hex 32)"
  ENV_NEEDS_BACKUP=true
fi
if [[ -z "$BOT_API_KEY" || "$BOT_API_KEY" == "generated-by-the-installer" ]]; then
  BOT_API_KEY="$(openssl rand -hex 32)"
  ENV_NEEDS_BACKUP=true
fi

if [[ -f "$ENV_FILE" && "$ENV_NEEDS_BACKUP" == true ]]; then
  backup_file="${ENV_FILE}.backup.$(date -u +%Y%m%d%H%M%S)"
  cp -p "$ENV_FILE" "$backup_file"
  chmod 600 "$backup_file"
  printf 'Saved the previous configuration to %s\n' "$backup_file"
fi

umask 077
{
  printf 'DOMAIN=%s\n' "$DOMAIN"
  printf 'POSTGRES_DB=vintage_shield\n'
  printf 'POSTGRES_USER=vintage_shield\n'
  printf 'POSTGRES_PASSWORD=%s\n' "$POSTGRES_PASSWORD"
  printf 'BOT_API_KEY=%s\n' "$BOT_API_KEY"
  printf 'DISCORD_TOKEN=%s\n' "$DISCORD_TOKEN"
  printf 'ADMIN_GUILD_ID=%s\n' "$ADMIN_GUILD_ID"
  printf 'LOG_LEVEL=INFO\n'
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"

install -d -m 0755 "$PROXY_DIR"
install -m 0644 "${PROXY_SOURCE_DIR}/docker-compose.yml" \
  "${PROXY_DIR}/docker-compose.yml"

if [[ ! -f "${PROXY_DIR}/Caddyfile" ]]; then
  install -m 0644 "${PROXY_SOURCE_DIR}/Caddyfile" "${PROXY_DIR}/Caddyfile"
else
  caddy_temp_file="$(mktemp)"
  sed '/^# BEGIN vintage-shield$/,/^# END vintage-shield$/d' \
    "${PROXY_DIR}/Caddyfile" > "$caddy_temp_file"
  printf '\n' >> "$caddy_temp_file"
  sed -n '1,$p' "${PROXY_SOURCE_DIR}/Caddyfile" >> "$caddy_temp_file"
  install -m 0644 "$caddy_temp_file" "${PROXY_DIR}/Caddyfile"
  rm -f "$caddy_temp_file"
fi

set_env_value "$PROXY_ENV_FILE" VINTAGE_SHIELD_DOMAIN "$DOMAIN"

if ! docker network inspect web-proxy >/dev/null 2>&1; then
  docker network create web-proxy >/dev/null
fi

printf 'Validating the Docker configuration...\n'
cd "$PROJECT_DIR"
docker compose --env-file "$ENV_FILE" config --quiet
docker compose \
  --env-file "$PROXY_ENV_FILE" \
  -f "${PROXY_DIR}/docker-compose.yml" \
  config --quiet

printf 'Building and starting Vintage Shield...\n'
docker compose --env-file "$ENV_FILE" up -d --build
docker compose \
  --env-file "$PROXY_ENV_FILE" \
  -f "${PROXY_DIR}/docker-compose.yml" \
  up -d
docker compose \
  --env-file "$PROXY_ENV_FILE" \
  -f "${PROXY_DIR}/docker-compose.yml" \
  exec -T caddy caddy validate --config /etc/caddy/Caddyfile
docker compose \
  --env-file "$PROXY_ENV_FILE" \
  -f "${PROXY_DIR}/docker-compose.yml" \
  exec -T caddy caddy reload --config /etc/caddy/Caddyfile

printf '\nVintage Shield is installed.\n'
printf 'Website: https://%s\n' "$DOMAIN"
printf 'Private settings: %s (mode 600)\n' "$ENV_FILE"
printf 'Database volume: vintage-shield-postgres-data\n'
printf 'Shared proxy configuration: %s\n' "$PROXY_DIR"
printf '\nDNS for %s must point to this VPS before HTTPS can succeed.\n' "$DOMAIN"
printf 'Check services with: cd %s && sudo docker compose ps\n' "$PROJECT_DIR"
printf 'View app logs with: cd %s && sudo docker compose logs -f web bot postgres\n' "$PROJECT_DIR"
printf 'View proxy logs with: sudo docker compose --env-file %s -f %s logs -f caddy\n' \
  "$PROXY_ENV_FILE" "${PROXY_DIR}/docker-compose.yml"

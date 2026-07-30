# Vintage Shield

Vintage Shield is an English public ban register and private Discord review bot
for Vintage Story server administrators.

The Discord bot is the only input surface. It accepts commands only from one
configured private admin Discord server. Approved bans appear on the public
website, where admins can copy individual commands or download the complete
native JSON ban list.

## Quick Ubuntu installation

You need:

- A supported 64-bit Ubuntu VPS
- A domain or subdomain pointing to the VPS
- Ports 80 and 443 available
- A Discord bot token
- The numeric ID of the private admin Discord server

Upload or clone this project onto the VPS, open its directory, and run:

```bash
sudo bash deploy/install-ubuntu.sh
```

The installer asks for only three values:

1. The public domain or subdomain, such as `bans.example.com`
2. The private Discord server ID
3. The Discord bot token

It installs Docker when needed, generates all internal credentials, creates the
database volume, builds the website and bot, starts the shared HTTPS proxy, and
validates the configuration.

Rerun the installer later with the existing settings:

```bash
sudo bash deploy/install-ubuntu.sh
```

Change the domain, Discord server ID, or bot token:

```bash
sudo bash deploy/install-ubuntu.sh --reconfigure
```

Reconfiguration keeps the existing PostgreSQL password and private API key so
the database connection does not break.

## Why there is an API key

`BOT_API_KEY` is not an external service key. It is a random internal password
shared by the Discord bot and the website API.

The bot sends reports, votes, imports, and configuration changes to the website
API. The key proves that those requests came from this bot. The configured
Discord server ID is checked as well, and the public proxy rejects
`/api/internal/*` requests. The installer creates the key and gives the same
value to both containers automatically. You never need to enter it.

## Why PostgreSQL has a password

The website needs credentials to connect to PostgreSQL. The installer generates
a separate random password and builds the database connection automatically.
PostgreSQL is not published on a public VPS port, so only containers on the
private Docker network can reach it.

The password and API key add basic protection at no maintenance cost. You do not
need to manage them manually.

## Where data and secrets are stored

- Project settings and generated secrets: `.env`
- `.env` permissions: owner read and write only, mode `600`
- PostgreSQL data: Docker volume `vintage-shield-postgres-data`
- HTTPS certificates: Docker volumes `vps-caddy-data` and `vps-caddy-config`
- Shared proxy files: `/opt/vps-proxy`

The database remains on the VPS across container rebuilds and normal restarts.
Do not run `docker compose down -v`, because `-v` intentionally deletes named
volumes.

## DNS

Create an `A` record for the selected subdomain and point it to the VPS IPv4
address. Create an `AAAA` record only if the VPS has working public IPv6.

Example:

```text
bans.example.com -> 203.0.113.10
```

Caddy obtains and renews the HTTPS certificate after DNS points to the VPS and
ports 80 and 443 are reachable.

The installer does not change your firewall. If UFW is enabled, allow SSH,
HTTP, and HTTPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

## Hosting more websites on the same VPS

This setup is ready for multiple domains. One central Caddy container owns
ports 80 and 443. Vintage Shield and future websites join the external
`web-proxy` Docker network.

For another Docker website:

1. Attach its web service to the external `web-proxy` network.
2. Give the service a unique network alias, such as `portfolio-web`.
3. Add its domain to `/opt/vps-proxy/Caddyfile`.
4. Validate and reload Caddy.

Example network section for another Compose project:

```yaml
services:
  web:
    networks:
      proxy:
        aliases:
          - portfolio-web

networks:
  proxy:
    external: true
    name: web-proxy
```

Example additional Caddy site:

```caddyfile
portfolio.example.com {
	reverse_proxy portfolio-web:3000
}
```

Validate and reload the shared proxy:

```bash
sudo docker compose \
  --env-file /opt/vps-proxy/.env \
  -f /opt/vps-proxy/docker-compose.yml \
  exec -T caddy caddy validate --config /etc/caddy/Caddyfile

sudo docker compose \
  --env-file /opt/vps-proxy/.env \
  -f /opt/vps-proxy/docker-compose.yml \
  exec -T caddy caddy reload --config /etc/caddy/Caddyfile
```

Your two existing root domains and any subdomains can all point to the same VPS
IP. Caddy chooses the correct website from the requested hostname.

## Discord setup

1. Open the Discord Developer Portal.
2. Create an application and add a bot.
3. Reset or reveal the bot token and use it during installation.
4. In the OAuth2 URL Generator, select `bot` and `applications.commands`.
5. Grant View Channels, Send Messages, Embed Links, Attach Files, Read Message
   History, and Use Application Commands.
6. Invite the bot only to the private admin Discord server.

The bot does not need the Message Content or Server Members privileged intents.

To copy the server ID, enable Discord Developer Mode, right-click the server
icon, and select Copy Server ID.

The `ADMIN_GUILD_ID` value limits command registration, button interactions, and
private API writes to this one Discord server.

## Configure the admin workflow

Create these items in the private admin Discord:

- A private review channel
- A reviewer role
- A notification role for interested admins
- An optional private log channel

Run `/shield-config` in the configured Discord server. Select the channels and
roles, then set the approval and denial thresholds. Two independent reviewers
is a sensible starting point.

## Discord commands

- `/player-report`: submit a suspicious player for review
- `/ban-record`: record a ban that was already applied
- `/case`: inspect private case details and vote totals
- `/case-vote`: confirm or deny a pending case
- `/ban-find`: search approved public bans
- `/ban-export`: download `public-banlist.json`
- `/ban-import`: import a native Vintage Story ban list
- `/ban-revoke`: remove an approved case from public output
- `/shield-config`: configure channels, roles, thresholds, and server name

The bot removes global commands during startup. Commands from any other Discord
server are rejected.

## Vintage Story ban commands

The in-game syntax is:

```text
/ban <player name> <duration> <reason>
```

Vintage Shield generates commands such as:

```text
/ban ExamplePlayer 30 day Confirmed griefing after multiple warnings
```

Supported time units include `minute`, `hour`, `day`, `week`, and `year`.
Vintage Story expects a singular time unit token, even when the number is
greater than one.

For multiple command lines, Vintage Story provides:

```text
.pastemode multi
```

Return to `.pastemode single` afterward. A bulk list can ban many players
immediately, so the website requires a confirmation before copying all
commands. Review every entry before pasting it into a live server.

## Import and export

The website and `/ban-export` provide Vintage Story's native JSON shape:

```json
[
  {
    "PlayerUID": "the-player-uid",
    "PlayerName": "ExactPlayerName",
    "UntilDate": "2036-07-24T18:20:00.000Z",
    "Reason": "Confirmed public reason",
    "IssuedByPlayerName": "Vintage Shield Community Review"
  }
]
```

`/ban-import` accepts the same array format. A single import is limited to 500
rows. Invalid rows are skipped. An imported active UID replaces an older
approved entry.

## Routine commands

Check application services:

```bash
sudo docker compose ps
```

View application logs:

```bash
sudo docker compose logs -f web bot postgres
```

View proxy logs:

```bash
sudo docker compose \
  --env-file /opt/vps-proxy/.env \
  -f /opt/vps-proxy/docker-compose.yml \
  logs -f caddy
```

Restart the bot:

```bash
sudo docker compose restart bot
```

Rebuild after updating project files:

```bash
sudo docker compose up -d --build
```

Check the public health endpoint:

```bash
curl -fsS https://bans.example.com/api/health
```

## Optional database backup

Create a compressed backup:

```bash
mkdir -p backups
sudo docker compose exec -T postgres \
  pg_dump -U vintage_shield vintage_shield \
  | gzip > backups/vintage-shield.sql.gz
```

A database backup on the same VPS helps with accidental changes, but does not
protect against total VPS loss.

Restore into an empty database:

```bash
gzip -dc backups/vintage-shield.sql.gz \
  | sudo docker compose exec -T postgres \
    psql -U vintage_shield vintage_shield
```

## Security notes

- Never commit `.env`, Discord tokens, database passwords, or `BOT_API_KEY`.
- PostgreSQL is not exposed on port 5432.
- Private API writes require the API key and configured Discord server ID.
- Reviewer permissions are checked before votes are accepted.
- Private evidence is never returned by public API routes.
- Import, revoke, and configuration commands require Manage Server permission.
- Keep public reasons factual and concise.
- Do not publish IP addresses, private messages, personal information, or raw
  private logs.

## Troubleshooting

If HTTPS does not start, confirm that DNS points to the VPS, ports 80 and 443
are reachable, and no other host process owns those ports. Then check:

```bash
sudo docker compose \
  --env-file /opt/vps-proxy/.env \
  -f /opt/vps-proxy/docker-compose.yml \
  logs caddy
```

If the bot shows no commands:

```bash
sudo docker compose logs bot
```

Verify the `ADMIN_GUILD_ID`, then reconfigure if needed:

```bash
sudo bash deploy/install-ubuntu.sh --reconfigure
```

If the website cannot reach PostgreSQL:

```bash
sudo docker compose ps
sudo docker compose logs postgres web
```

Changing only the PostgreSQL password in `.env` does not change an existing
database role password. The installer avoids this issue by preserving the
generated password during reconfiguration.

## Project layout

- `app/`: public dashboard and API routes
- `lib/`: public data mapping and database adapters
- `bot/`: Discord bot and API client
- `deploy/install-ubuntu.sh`: automated Ubuntu installer
- `deploy/proxy/`: reusable central Caddy proxy templates
- `deploy/postgres-init.sql`: PostgreSQL schema
- `Dockerfile`: production website image
- `docker-compose.yml`: website, bot, and database services
- `tests/`: rendering, export, and health checks

Vintage Shield is a community project and is not affiliated with Anego Studios.

# Vintage Shield

Vintage Shield is an English public ban register and private Discord review bot
for Vintage Story server administrators.

The complete production stack runs on one Ubuntu VPS:

- Caddy provides HTTPS and sends website traffic to the web container.
- The Next.js website provides the public register, JSON export, and private
  bot API.
- PostgreSQL stores guild settings, cases, votes, and the audit log.
- The Discord bot is the only input surface for reports and decisions.

Only one Discord server can use the bot. The required `ADMIN_GUILD_ID` setting
controls command registration, interaction checks, and private API access.

## Main features

- Compact admin panel with latest reports and copy-ready commands
- Native `public-banlist.json` download
- Single-command copying
- Deliberate bulk-copy confirmation with `.pastemode multi` instructions
- Reports for suspicious players and already issued bans
- Confirm and Deny review buttons
- Configurable reviewer and notification roles
- Configurable approval and denial thresholds
- Private evidence separated from the public reason
- Import, export, search, revoke, expiry, and audit history
- One Ubuntu VPS deployment with Docker Compose, PostgreSQL, and automatic HTTPS

## Correct Vintage Story commands

The in-game handbook defines the ban command as:

```text
/ban <player name> <duration> <reason>
```

Vintage Shield generates commands such as:

```text
/ban ExamplePlayer 30 days Confirmed griefing after multiple warnings
```

The handbook accepts a number plus a time unit. Supported units include
`minute`, `hour`, `day`, `week`, and `year`. The bot currently collects the
duration in days, so generated commands use the `days` unit.

Vintage Story also provides:

```text
.pastemode <single/multi>
```

Use `.pastemode multi` before pasting a multiline command list. Return to
`.pastemode single` afterward.

Important: a bulk list can ban many players immediately. The website does not
copy bulk commands until an admin acknowledges the warning. Review every entry
before pasting it into a live server.

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

The commands are registered only in the Discord server identified by
`ADMIN_GUILD_ID`. The bot removes global commands during startup. Button
interactions and API calls from any other guild are rejected.

## Ubuntu VPS requirements

Use a supported 64-bit Ubuntu release. Ubuntu 24.04 LTS is a good default.

You need:

- A VPS with at least 2 GB RAM
- A domain or subdomain
- DNS access for that domain
- Ports 22, 80, and 443 available
- A Discord application and bot token
- The numeric ID of the private admin Discord server

Docker maintains the current Ubuntu installation steps at:

https://docs.docker.com/engine/install/ubuntu/

Caddy needs the domain to point at the VPS and ports 80 and 443 to be reachable.
Its HTTPS requirements are documented at:

https://caddyserver.com/docs/quick-starts/https

## 1. Prepare DNS

Create an `A` record for your chosen hostname and point it to the VPS IPv4
address. Create an `AAAA` record only if the VPS has working public IPv6.

Example:

```text
bans.example.com -> 203.0.113.10
```

Wait until the record resolves before starting Caddy.

## 2. Connect and prepare Ubuntu

Connect over SSH:

```bash
ssh your-user@your-vps-address
```

Update the server and install basic tools:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw
```

Allow SSH, HTTP, and HTTPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Docker warns that published container ports interact directly with its firewall
rules. This project publishes only Caddy on ports 80 and 443. PostgreSQL and the
web container stay on the private Compose network.

## 3. Install Docker Engine and Compose

Remove conflicting packages if they are installed:

```bash
sudo apt remove -y docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc
```

Add Docker's official signing key and repository:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc" | sudo tee /etc/apt/sources.list.d/docker.sources
sudo apt update
```

Install Docker Engine and the Compose plugin:

```bash
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
```

Optional: allow your user to run Docker without `sudo`:

```bash
sudo usermod -aG docker "$USER"
```

Sign out and reconnect after changing group membership.

## 4. Copy the project to the VPS

Clone your repository or upload this folder:

```bash
git clone YOUR_REPOSITORY_URL vintage-shield
cd vintage-shield
```

Create the private environment file:

```bash
cp .env.example .env
chmod 600 .env
```

Generate two different random secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Edit `.env`:

```bash
nano .env
```

Required values:

```text
DOMAIN=bans.example.com
POSTGRES_DB=vintage_shield
POSTGRES_USER=vintage_shield
POSTGRES_PASSWORD=<first random secret>
BOT_API_KEY=<second random secret>
DISCORD_TOKEN=<Discord bot token>
ADMIN_GUILD_ID=<private admin Discord server ID>
LOG_LEVEL=INFO
```

Do not reuse the PostgreSQL password as the API key.

## 5. Create and invite the Discord bot

1. Open the Discord Developer Portal.
2. Create an application and add a bot.
3. Copy the token into `DISCORD_TOKEN`.
4. In OAuth2 URL Generator, select `bot` and `applications.commands`.
5. Grant View Channels, Send Messages, Embed Links, Attach Files, Read Message
   History, and Use Application Commands.
6. Invite the bot only to the private admin Discord server.

The bot does not need Message Content or Server Members privileged intents.

To get the server ID, enable Discord Developer Mode, right-click the server
icon, and select Copy ID. Discord documents this process at:

https://support-dev.discord.com/hc/en-us/articles/360028717192-Where-can-I-find-my-Application-Team-Server-ID

## 6. Start the complete stack

Build and start every service:

```bash
docker compose up -d --build
```

Check service state:

```bash
docker compose ps
```

Follow startup logs:

```bash
docker compose logs -f caddy web bot
```

The first start creates the PostgreSQL schema automatically. Caddy requests and
renews the HTTPS certificate after DNS and ports are correct.

Open:

```text
https://your-domain.example
```

## 7. Configure the Discord workflow

Create these items in the private admin Discord:

- A private review channel
- A reviewer role
- A notification role for interested admins
- An optional private log channel

Run `/shield-config` in the configured admin server. Select the channels and
roles, then set the approval and denial thresholds. Two independent reviewers
is a sensible starting point.

The public server name is shown as the source on the website and in case
details.

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

## Routine operation

View logs:

```bash
docker compose logs -f bot
docker compose logs -f web
docker compose logs -f caddy
docker compose logs -f postgres
```

Restart one service:

```bash
docker compose restart bot
```

Update the application:

```bash
git pull
docker compose up -d --build
docker image prune -f
```

Check the public health endpoint:

```bash
curl -fsS https://your-domain.example/api/health
```

## Backups

Create a database backup:

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U vintage_shield vintage_shield | gzip > backups/vintage-shield.sql.gz
```

Copy backups to a different machine or storage provider. A backup stored only
on the same VPS does not protect against VPS loss.

Restore into an empty database:

```bash
gzip -dc backups/vintage-shield.sql.gz | docker compose exec -T postgres psql -U vintage_shield vintage_shield
```

Stop the stack without deleting data:

```bash
docker compose down
```

Do not add `-v` unless you intentionally want to delete the PostgreSQL and Caddy
volumes.

## Security notes

- Never commit `.env`, Discord tokens, database passwords, or `BOT_API_KEY`.
- Keep PostgreSQL private. This Compose file does not publish port 5432.
- Use one dedicated Discord guild ID in `ADMIN_GUILD_ID`.
- Private API routes require both the API key and the configured guild ID.
- Reviewer permissions are checked before votes are accepted.
- Import, revoke, and configuration commands require Manage Server permission.
- Private evidence is never returned by public API routes.
- Keep public reasons factual and concise.
- Do not publish IP addresses, private messages, personal information, or raw
  private logs.
- Rotate any token that was present in an older prototype.

## Troubleshooting

If HTTPS does not start:

```bash
docker compose logs caddy
```

Confirm the domain points to the VPS and that ports 80 and 443 are reachable.

If the bot shows no commands, verify `ADMIN_GUILD_ID`, restart the bot, and
check:

```bash
docker compose logs bot
```

If the website cannot reach PostgreSQL:

```bash
docker compose ps
docker compose logs postgres web
```

If you change the PostgreSQL password after the volume was created, update the
database role too or recreate the database intentionally. Changing only `.env`
does not change an existing PostgreSQL role password.

## Project layout

- `app/`: public dashboard and API routes
- `lib/`: public data mapping and database adapters
- `bot/`: Discord bot and API client
- `deploy/`: Caddy and PostgreSQL production configuration
- `Dockerfile`: production website image
- `docker-compose.yml`: complete Ubuntu VPS stack
- `tests/`: rendering, export, and health checks

Vintage Shield is a community project and is not affiliated with Anego Studios.

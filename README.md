# Vintage Shield

Vintage Shield is an English-first, community-reviewed public ban register for
Vintage Story server administrators.

The public website makes confirmed bans easy to search, copy as server commands,
and download in Vintage Story's native JSON format. The private Discord bot is
the only moderation input surface: it collects reports and evidence, notifies
reviewers, records confirm/deny votes, and publishes a case only after the
configured threshold is reached.

## What is included

- Responsive public dashboard with search and source-server filtering
- One-click `/ban [playername] [reason]` commands
- Bulk command copying
- Native `public-banlist.json` download
- Public case details without private evidence or reviewer identities
- Discord reports for suspicious players
- Discord records for bans already issued on a server
- Persistent Confirm and Deny buttons
- Configurable reviewer and notification roles
- Configurable approval and denial thresholds
- Case lookup, public-ban search, import, export, and revoke commands
- Duplicate active-case protection
- Private evidence and public-reason separation
- Revocation, expiry, and audit history
- Durable D1 database migrations
- Docker-based VPS bot deployment

## Moderation lifecycle

1. An admin uses `/player-report` or `/ban-record` in the private Discord.
2. The bot posts a review card and mentions the configured notification role.
3. Members with the reviewer role confirm or deny the case.
4. The decision threshold is evaluated after every distinct reviewer's vote.
5. Approved, unexpired cases appear on the public website and in the JSON
   export.
6. Denied cases remain private. Revoked or expired cases disappear publicly but
   remain in the audit history.

The public register is a shared signal. Each server owner still decides whether
to apply a community ban.

## Project layout

| Path | Purpose |
| --- | --- |
| `app/` | Public dashboard and website/API routes |
| `lib/ban-service.ts` | Public data mapping, JSON export, and API security |
| `db/` and `drizzle/` | Durable database schema and migrations |
| `bot/` | Discord bot, API client, and bot container |
| `tests/` | Render, export, and health checks |
| `.openai/hosting.json` | Sites database declaration |

## Discord commands

| Command | Who can use it | Purpose |
| --- | --- | --- |
| `/player-report` | Admin community | Submit a suspicious player for review |
| `/ban-record` | Admin community | Record a ban already issued by a server |
| `/case` | Admin community | Inspect private case details and vote totals |
| `/case-vote` | Reviewer role | Confirm or deny a pending case |
| `/ban-find` | Admin community | Search the approved public register |
| `/ban-export` | Admin community | Download `public-banlist.json` |
| `/ban-import` | Manage Server | Import a native Vintage Story ban-list file |
| `/ban-revoke` | Manage Server | Remove an approved case from public output |
| `/shield-config` | Manage Server | Configure channels, roles, names, and thresholds |

The review buttons survive bot restarts through Discord's dynamic component
handling. A reviewer can also use `/case-vote` as a fallback.

## Local website development

Requirements:

- Node.js 22.13 or newer
- pnpm 11

```bash
pnpm install
pnpm run db:generate
pnpm run dev
```

Open `http://localhost:3000`.

The local preview uses clearly labelled fictional records when D1 is not
available. No sample player is inserted into the live database.

Verification:

```bash
pnpm run build
pnpm test
pnpm exec tsc --noEmit
python -m py_compile bot/api.py bot/app.py
```

## Recommended production setup

The recommended topology is:

- Website, API, and D1 database on OpenAI Sites
- Discord bot on your VPS

This keeps the public service close to its managed database while the private
Discord token stays on your own server. The bot communicates with the API using
one long random shared secret.

### 1. Configure the website/API

Create a long random API key. For example:

```bash
openssl rand -hex 32
```

Set these hosted runtime variables:

```text
BOT_API_KEY=<the generated secret>
DEMO_MODE=false
```

Deploy the saved site version. The deployment applies the SQL migrations in
`drizzle/`.

### 2. Create the Discord application

In the Discord Developer Portal:

1. Create an application and add a bot.
2. Reset/copy its token once and store it only in your VPS environment file.
3. Under OAuth2 URL Generator, select `bot` and `applications.commands`.
4. Grant View Channels, Send Messages, Embed Links, Attach Files, Read Message
   History, and Use Application Commands.
5. Invite the bot to the private admin server.

The bot does not require Message Content or Server Members privileged intents.

### 3. Start the bot on the VPS

Install Docker Engine and the Docker Compose plugin. Clone/copy this project to
the VPS, then create a `.env` file from `.env.example`:

```text
DISCORD_TOKEN=<new Discord bot token>
BOT_API_KEY=<same secret configured on the website>
SHIELD_API_URL=https://your-published-site.example
WEBSITE_URL=https://your-published-site.example
DEV_GUILD_ID=
LOG_LEVEL=INFO
```

Start the service:

```bash
docker compose up -d --build
docker compose logs -f vintage-shield-bot
```

`DEV_GUILD_ID` is optional. Setting it to the private Discord server ID makes
slash-command changes appear immediately during testing. Leave it empty for
global production commands.

### 4. Configure the Discord workflow

Create the private review channel, reviewer role, and interested-admin
notification role. Then run:

```text
/shield-config
```

Select the channel and roles, then choose the approval and denial thresholds.
Two independent reviewers is a sensible starting point.

## Import and export format

The public download deliberately preserves Vintage Story's field names:

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

`/ban-import` accepts this same array format. Invalid rows are skipped, the
import is capped at 500 rows, and an imported active UID replaces an older
approved entry.

## Security and privacy

- Never commit `.env` files, Discord tokens, or `BOT_API_KEY`.
- Use a different secret for the website API and the Discord bot token.
- Private evidence is never returned by public endpoints.
- Public write operations require `x-api-key`.
- Reviewer permissions are checked in Discord before a vote reaches the API.
- Import and revoke operations require Discord's Manage Server permission.
- Rotate any token that was ever hard-coded in an older prototype before using
  this project.
- Keep public reasons factual and concise. Avoid publishing personal
  information, private messages, IP addresses, or raw logs.

## Operating notes

- `DEMO_MODE=true` always shows fictional preview data and should not be used for
  the live community register.
- Expired and revoked entries are automatically excluded from the website and
  export.
- Vote changes are allowed while a case is pending; each reviewer has one
  current vote.
- After approval or denial, the Discord review buttons are disabled.
- Case IDs use a short `VS-XXXXXXXX` format for easy Discord discussion.

## Hosting everything on one VPS

The current data layer is intentionally D1-backed. For a single-machine
deployment of both the website and bot, the safe production path is to add a
PostgreSQL adapter and run the web service, bot, database, and reverse proxy
together. Do not expose a Wrangler/Miniflare development database as a
production service.

If you choose that topology later, migrate the existing route contracts rather
than changing the bot: the bot already talks to the website through stable HTTP
endpoints.

## Legal note

Vintage Shield is a community project and is not affiliated with Anego Studios.

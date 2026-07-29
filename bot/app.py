from __future__ import annotations

import io
import json
import logging
import os
import re
from typing import Any, Literal, cast

import discord
from discord import app_commands
from discord.ext import commands

from api import ShieldAPI, ShieldAPIError


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("vintage-shield")

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN", "")
SHIELD_API_URL = os.getenv("SHIELD_API_URL", "http://localhost:3000")
BOT_API_KEY = os.getenv("BOT_API_KEY", "")
WEBSITE_URL = os.getenv("WEBSITE_URL", SHIELD_API_URL)
ADMIN_GUILD_ID = int(os.getenv("ADMIN_GUILD_ID", "0") or 0)

REVIEW_PATTERN = re.compile(
    r"shield:(?P<action>confirm|deny):(?P<case_id>VS-[A-Z0-9]+)"
)


def require_environment() -> None:
    missing = [
        name
        for name, value in {
            "DISCORD_TOKEN": DISCORD_TOKEN,
            "BOT_API_KEY": BOT_API_KEY,
            "SHIELD_API_URL": SHIELD_API_URL,
            "ADMIN_GUILD_ID": ADMIN_GUILD_ID,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")


def safe_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def status_colour(status: str) -> discord.Colour:
    return {
        "pending": discord.Colour.from_rgb(217, 155, 61),
        "approved": discord.Colour.from_rgb(13, 103, 92),
        "denied": discord.Colour.from_rgb(168, 75, 55),
        "revoked": discord.Colour.dark_grey(),
    }.get(status, discord.Colour.blurple())


def review_embed(case: dict[str, Any], *, status: str = "pending") -> discord.Embed:
    case_id = str(case["id"])
    player_name = str(case["player_name"])
    player_uid = str(case["player_uid"])
    reason = str(case["public_reason"])
    evidence = str(case.get("evidence", "") or "No private evidence note supplied.")
    source = str(case.get("source_server", "Community report"))
    reporter = str(case.get("reporter_name", "Unknown"))
    action_taken = bool(case.get("action_taken"))
    duration = int(case.get("duration_days", 3650))

    title_prefix = {
        "pending": "Review requested",
        "approved": "Case approved",
        "denied": "Case denied",
        "revoked": "Ban revoked",
    }.get(status, "Review requested")

    embed = discord.Embed(
        title=f"{title_prefix}: {player_name}",
        description=reason,
        colour=status_colour(status),
    )
    embed.add_field(name="Player UID", value=f"`{player_uid}`", inline=False)
    embed.add_field(name="Source server", value=source, inline=True)
    embed.add_field(
        name="Server action",
        value="Already banned" if action_taken else "Not yet reported as banned",
        inline=True,
    )
    embed.add_field(name="Requested duration", value=f"{duration:,} days", inline=True)
    embed.add_field(name="Private evidence", value=evidence[:1024], inline=False)
    embed.add_field(name="Submitted by", value=reporter, inline=True)
    embed.add_field(name="Case", value=f"`{case_id}`", inline=True)
    embed.set_footer(
        text="Only the public reason is published. Reviewer votes remain private."
    )
    return embed


class ReviewButton(
    discord.ui.DynamicItem[discord.ui.Button],
    template=REVIEW_PATTERN,
):
    def __init__(
        self,
        action: Literal["confirm", "deny"],
        case_id: str,
        *,
        disabled: bool = False,
    ) -> None:
        self.action = action
        self.case_id = case_id
        super().__init__(
            discord.ui.Button(
                label="Confirm ban" if action == "confirm" else "Deny case",
                style=(
                    discord.ButtonStyle.success
                    if action == "confirm"
                    else discord.ButtonStyle.danger
                ),
                custom_id=f"shield:{action}:{case_id}",
                disabled=disabled,
            )
        )

    @classmethod
    async def from_custom_id(
        cls,
        interaction: discord.Interaction,
        item: discord.ui.Button,
        match: re.Match[str],
        /,
    ) -> "ReviewButton":
        return cls(
            cast(Literal["confirm", "deny"], match["action"]),
            match["case_id"],
        )

    async def callback(self, interaction: discord.Interaction) -> None:
        if interaction.guild_id != ADMIN_GUILD_ID:
            await interaction.response.send_message(
                "This bot only accepts actions in its configured admin server.",
                ephemeral=True,
            )
            return
        bot = cast("VintageShieldBot", interaction.client)
        await bot.handle_vote(interaction, self.case_id, self.action)


class ReviewView(discord.ui.View):
    def __init__(self, case_id: str, *, disabled: bool = False) -> None:
        super().__init__(timeout=None)
        self.add_item(ReviewButton("confirm", case_id, disabled=disabled))
        self.add_item(ReviewButton("deny", case_id, disabled=disabled))
        self.add_item(
            discord.ui.Button(
                label="Open public register",
                style=discord.ButtonStyle.link,
                url=WEBSITE_URL,
            )
        )


class AdminGuildTree(app_commands.CommandTree):
    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.guild_id == ADMIN_GUILD_ID:
            return True
        message = "This bot only works in its configured private admin server."
        if interaction.response.is_done():
            await interaction.followup.send(message, ephemeral=True)
        else:
            await interaction.response.send_message(message, ephemeral=True)
        return False


class VintageShieldBot(commands.Bot):
    def __init__(self) -> None:
        intents = discord.Intents.default()
        super().__init__(
            command_prefix=commands.when_mentioned,
            intents=intents,
            tree_cls=AdminGuildTree,
        )
        self.api = ShieldAPI(SHIELD_API_URL, BOT_API_KEY, ADMIN_GUILD_ID)

    async def setup_hook(self) -> None:
        await self.api.start()
        self.add_dynamic_items(ReviewButton)
        guild = discord.Object(id=ADMIN_GUILD_ID)
        self.tree.copy_global_to(guild=guild)
        await self.tree.sync(guild=guild)
        self.tree.clear_commands(guild=None)
        await self.tree.sync()
        log.info("Synced commands only to admin guild %s", ADMIN_GUILD_ID)

    async def close(self) -> None:
        await self.api.close()
        await super().close()

    async def on_ready(self) -> None:
        log.info("Ready as %s (%s)", self.user, self.user.id if self.user else "unknown")

    async def user_can_review(
        self,
        interaction: discord.Interaction,
        settings: dict[str, Any] | None = None,
    ) -> bool:
        member = interaction.user
        if not isinstance(member, discord.Member):
            return False
        if member.guild_permissions.administrator or member.guild_permissions.manage_guild:
            return True
        settings = settings or await self.api.settings(interaction.guild_id or 0)
        reviewer_role_id = safe_int(settings.get("reviewer_role_id"))
        return bool(
            reviewer_role_id
            and any(role.id == reviewer_role_id for role in member.roles)
        )

    async def handle_vote(
        self,
        interaction: discord.Interaction,
        case_id: str,
        action: Literal["confirm", "deny"],
        note: str = "",
    ) -> None:
        if interaction.guild_id != ADMIN_GUILD_ID:
            await interaction.response.send_message(
                "Voting is only available inside the configured admin server.",
                ephemeral=True,
            )
            return
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            settings = await self.api.settings(interaction.guild_id)
            if not await self.user_can_review(interaction, settings):
                await interaction.followup.send(
                    "You need the configured reviewer role to vote on this case.",
                    ephemeral=True,
                )
                return
            result = await self.api.vote(
                case_id,
                voter_id=interaction.user.id,
                voter_name=str(interaction.user),
                vote=action,
                note=note,
            )
            status = str(result["status"])
            await interaction.followup.send(
                (
                    f"Your **{action}** vote was recorded for `{case_id}`. "
                    f"Current count: {result['confirms']} confirm / "
                    f"{result['denials']} deny. Status: **{status}**."
                ),
                ephemeral=True,
            )

            if status != "pending" and interaction.message:
                case_data = (await self.api.case(case_id))["case"]
                await interaction.message.edit(
                    content=None,
                    embed=review_embed(case_data, status=status),
                    view=ReviewView(case_id, disabled=True),
                )
        except ShieldAPIError as error:
            await interaction.followup.send(str(error), ephemeral=True)


bot = VintageShieldBot()


async def submit_report(
    interaction: discord.Interaction,
    *,
    player_name: str,
    player_uid: str,
    public_reason: str,
    evidence: str,
    source_server: str | None,
    duration_days: int,
    action_taken: bool,
) -> None:
    if not interaction.guild or interaction.guild.id != ADMIN_GUILD_ID:
        await interaction.response.send_message(
            "Use this command inside the configured private admin server.",
            ephemeral=True,
        )
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    try:
        settings = await bot.api.settings(interaction.guild.id)
        payload = {
            "guild_id": str(interaction.guild.id),
            "player_name": player_name,
            "player_uid": player_uid,
            "public_reason": public_reason,
            "evidence": evidence,
            "source_server": source_server
            or settings.get("public_server_name")
            or interaction.guild.name,
            "reporter_name": str(interaction.user),
            "reporter_discord_id": str(interaction.user.id),
            "duration_days": duration_days,
            "action_taken": action_taken,
        }
        case = (await bot.api.create_report(payload))["case"]
        review_channel_id = safe_int(settings.get("review_channel_id"))
        channel = interaction.guild.get_channel(review_channel_id) if review_channel_id else None
        if not isinstance(channel, discord.TextChannel):
            channel = interaction.channel if isinstance(interaction.channel, discord.TextChannel) else None
        if not channel:
            await interaction.followup.send(
                "The report was saved, but no usable review channel is configured.",
                ephemeral=True,
            )
            return

        notification_role_id = safe_int(settings.get("notification_role_id"))
        role = interaction.guild.get_role(notification_role_id) if notification_role_id else None
        content = role.mention if role else None
        message = await channel.send(
            content=content,
            embed=review_embed(case),
            view=ReviewView(str(case["id"])),
            allowed_mentions=discord.AllowedMentions(roles=True),
        )
        await bot.api.attach_message(str(case["id"]), message.id)
        await interaction.followup.send(
            f"Case `{case['id']}` was created and sent to {channel.mention}.",
            ephemeral=True,
        )
    except ShieldAPIError as error:
        duplicate = error.payload.get("existing_case_id")
        suffix = f" Existing case: `{duplicate}`." if duplicate else ""
        await interaction.followup.send(f"{error}{suffix}", ephemeral=True)


@bot.tree.command(
    name="player-report",
    description="Submit a suspicious player for private community review.",
)
@app_commands.describe(
    player_name="Exact in-game player name",
    player_uid="Player UID from the Vintage Story server files",
    public_reason="Short reason that may be published after approval",
    evidence="Private evidence, links, logs, or context for reviewers",
    source_server="Public server name shown after approval",
    duration_days="Requested ban duration in days",
)
async def player_report(
    interaction: discord.Interaction,
    player_name: str,
    player_uid: str,
    public_reason: str,
    evidence: str,
    source_server: str | None = None,
    duration_days: app_commands.Range[int, 1, 36500] = 3650,
) -> None:
    await submit_report(
        interaction,
        player_name=player_name,
        player_uid=player_uid,
        public_reason=public_reason,
        evidence=evidence,
        source_server=source_server,
        duration_days=int(duration_days),
        action_taken=False,
    )


@bot.tree.command(
    name="ban-record",
    description="Record a ban already issued on your Vintage Story server.",
)
@app_commands.describe(
    player_name="Exact in-game player name",
    player_uid="Player UID from the Vintage Story server files",
    public_reason="Short reason that may be published after approval",
    evidence="Private evidence, links, logs, or context for reviewers",
    source_server="Public server name shown after approval",
    duration_days="Ban duration in days",
)
async def ban_record(
    interaction: discord.Interaction,
    player_name: str,
    player_uid: str,
    public_reason: str,
    evidence: str,
    source_server: str | None = None,
    duration_days: app_commands.Range[int, 1, 36500] = 3650,
) -> None:
    await submit_report(
        interaction,
        player_name=player_name,
        player_uid=player_uid,
        public_reason=public_reason,
        evidence=evidence,
        source_server=source_server,
        duration_days=int(duration_days),
        action_taken=True,
    )


@bot.tree.command(name="case", description="Show the private details and vote count for a case.")
async def case_lookup(interaction: discord.Interaction, case_id: str) -> None:
    await interaction.response.defer(ephemeral=True, thinking=True)
    try:
        data = await bot.api.case(case_id.upper())
        case_data = data["case"]
        votes = data.get("votes", [])
        embed = review_embed(case_data, status=str(case_data["status"]))
        confirms = sum(vote["vote"] == "confirm" for vote in votes)
        denials = sum(vote["vote"] == "deny" for vote in votes)
        embed.add_field(
            name="Current vote count",
            value=f"{confirms} confirm / {denials} deny",
            inline=False,
        )
        await interaction.followup.send(embed=embed, ephemeral=True)
    except ShieldAPIError as error:
        await interaction.followup.send(str(error), ephemeral=True)


@bot.tree.command(name="case-vote", description="Confirm or deny a pending case.")
@app_commands.choices(
    decision=[
        app_commands.Choice(name="Confirm ban", value="confirm"),
        app_commands.Choice(name="Deny case", value="deny"),
    ]
)
async def case_vote(
    interaction: discord.Interaction,
    case_id: str,
    decision: app_commands.Choice[str],
    note: str = "",
) -> None:
    await bot.handle_vote(
        interaction,
        case_id.upper(),
        cast(Literal["confirm", "deny"], decision.value),
        note,
    )


@bot.tree.command(name="ban-find", description="Search approved public bans.")
async def ban_find(interaction: discord.Interaction, query: str) -> None:
    await interaction.response.defer(ephemeral=True, thinking=True)
    try:
        needle = query.casefold()
        matches = [
            ban
            for ban in await bot.api.public_bans()
            if needle
            in " ".join(
                [
                    str(ban.get("playerName", "")),
                    str(ban.get("playerUid", "")),
                    str(ban.get("reason", "")),
                    str(ban.get("sourceServer", "")),
                ]
            ).casefold()
        ][:10]
        if not matches:
            await interaction.followup.send("No approved public ban matched that search.", ephemeral=True)
            return
        lines = [
            f"**{ban['playerName']}** (`{ban['id']}`)\n{ban['reason']}\n`{ban['command']}`"
            for ban in matches
        ]
        embed = discord.Embed(
            title=f"Public ban search: {len(matches)} result(s)",
            description="\n\n".join(lines),
            colour=status_colour("approved"),
            url=WEBSITE_URL,
        )
        await interaction.followup.send(embed=embed, ephemeral=True)
    except ShieldAPIError as error:
        await interaction.followup.send(str(error), ephemeral=True)


@bot.tree.command(name="ban-export", description="Download the current native Vintage Story ban list.")
async def ban_export(interaction: discord.Interaction) -> None:
    await interaction.response.defer(ephemeral=True, thinking=True)
    try:
        payload = await bot.api.export_bytes()
        await interaction.followup.send(
            "Current approved and unexpired public bans:",
            file=discord.File(io.BytesIO(payload), filename="public-banlist.json"),
            ephemeral=True,
        )
    except ShieldAPIError as error:
        await interaction.followup.send(str(error), ephemeral=True)


@bot.tree.command(name="ban-import", description="Import a native Vintage Story ban-list JSON file.")
@app_commands.checks.has_permissions(manage_guild=True)
async def ban_import(
    interaction: discord.Interaction,
    file: discord.Attachment,
    source_server: str | None = None,
) -> None:
    if interaction.guild_id != ADMIN_GUILD_ID:
        await interaction.response.send_message(
            "Use this in the configured admin server.",
            ephemeral=True,
        )
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    if not file.filename.lower().endswith(".json") or file.size > 2_000_000:
        await interaction.followup.send(
            "Upload a JSON file smaller than 2 MB.",
            ephemeral=True,
        )
        return
    try:
        entries = json.loads((await file.read()).decode("utf-8"))
        if not isinstance(entries, list):
            raise ValueError("The JSON root must be an array.")
        result = await bot.api.import_bans(
            {
                "guild_id": str(interaction.guild_id),
                "actor_discord_id": str(interaction.user.id),
                "actor_name": str(interaction.user),
                "source_server": source_server or interaction.guild.name,
                "entries": entries,
            }
        )
        await interaction.followup.send(
            f"Import complete: **{result['accepted']} accepted**, "
            f"**{result['skipped']} skipped**.",
            ephemeral=True,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        await interaction.followup.send(f"Invalid ban-list file: {error}", ephemeral=True)
    except ShieldAPIError as error:
        await interaction.followup.send(str(error), ephemeral=True)


@bot.tree.command(name="ban-revoke", description="Remove an approved case from the public register.")
@app_commands.checks.has_permissions(manage_guild=True)
async def ban_revoke(
    interaction: discord.Interaction,
    case_id: str,
    reason: str,
) -> None:
    await interaction.response.defer(ephemeral=True, thinking=True)
    try:
        await bot.api.revoke(
            case_id.upper(),
            actor_id=interaction.user.id,
            actor_name=str(interaction.user),
            reason=reason,
        )
        await interaction.followup.send(
            f"`{case_id.upper()}` was revoked and removed from the public export.",
            ephemeral=True,
        )
    except ShieldAPIError as error:
        await interaction.followup.send(str(error), ephemeral=True)


@bot.tree.command(
    name="shield-config",
    description="Configure review channels, roles, thresholds, and public server name.",
)
@app_commands.checks.has_permissions(manage_guild=True)
async def shield_config(
    interaction: discord.Interaction,
    review_channel: discord.TextChannel,
    reviewer_role: discord.Role,
    notification_role: discord.Role,
    approval_threshold: app_commands.Range[int, 1, 10] = 2,
    denial_threshold: app_commands.Range[int, 1, 10] = 2,
    log_channel: discord.TextChannel | None = None,
    public_server_name: str | None = None,
) -> None:
    if not interaction.guild or interaction.guild.id != ADMIN_GUILD_ID:
        await interaction.response.send_message(
            "Use this in the configured admin server.",
            ephemeral=True,
        )
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    try:
        await bot.api.update_settings(
            interaction.guild.id,
            {
                "guild_name": interaction.guild.name,
                "review_channel_id": str(review_channel.id),
                "log_channel_id": str(log_channel.id) if log_channel else "",
                "notification_role_id": str(notification_role.id),
                "reviewer_role_id": str(reviewer_role.id),
                "approval_threshold": int(approval_threshold),
                "denial_threshold": int(denial_threshold),
                "public_server_name": public_server_name or interaction.guild.name,
            },
        )
        await interaction.followup.send(
            (
                "Vintage Shield configured.\n"
                f"Review channel: {review_channel.mention}\n"
                f"Reviewer role: {reviewer_role.mention}\n"
                f"Notification role: {notification_role.mention}\n"
                f"Thresholds: {approval_threshold} confirm / {denial_threshold} deny"
            ),
            ephemeral=True,
        )
    except ShieldAPIError as error:
        await interaction.followup.send(str(error), ephemeral=True)


@bot.tree.error
async def on_app_command_error(
    interaction: discord.Interaction,
    error: app_commands.AppCommandError,
) -> None:
    if isinstance(error, app_commands.MissingPermissions):
        message = "You need the Manage Server permission to use this command."
    else:
        log.exception("Unhandled app command error", exc_info=error)
        message = "Something went wrong while running that command."
    if interaction.response.is_done():
        await interaction.followup.send(message, ephemeral=True)
    else:
        await interaction.response.send_message(message, ephemeral=True)


if __name__ == "__main__":
    require_environment()
    bot.run(DISCORD_TOKEN, log_handler=None)

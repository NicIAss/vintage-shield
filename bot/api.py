from __future__ import annotations

from typing import Any

import aiohttp


class ShieldAPIError(RuntimeError):
    def __init__(self, message: str, status: int = 500, payload: dict[str, Any] | None = None):
        super().__init__(message)
        self.status = status
        self.payload = payload or {}


class ShieldAPI:
    def __init__(self, base_url: str, api_key: str, admin_guild_id: int) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.admin_guild_id = admin_guild_id
        self.session: aiohttp.ClientSession | None = None

    async def start(self) -> None:
        timeout = aiohttp.ClientTimeout(total=20)
        self.session = aiohttp.ClientSession(
            timeout=timeout,
            headers={
                "x-api-key": self.api_key,
                "x-admin-guild-id": str(self.admin_guild_id),
            },
        )

    async def close(self) -> None:
        if self.session and not self.session.closed:
            await self.session.close()

    async def _json(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.session:
            raise ShieldAPIError("API client has not started")
        async with self.session.request(
            method,
            f"{self.base_url}{path}",
            json=payload,
        ) as response:
            try:
                data = await response.json()
            except (aiohttp.ContentTypeError, ValueError):
                data = {"error": await response.text()}
            if response.status >= 400:
                raise ShieldAPIError(
                    str(data.get("error", "Vintage Shield API request failed")),
                    response.status,
                    data,
                )
            return data

    async def create_report(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._json("POST", "/api/internal/reports", payload=payload)

    async def case(self, case_id: str) -> dict[str, Any]:
        return await self._json("GET", f"/api/internal/cases/{case_id}")

    async def pending_cases(self, guild_id: int) -> list[dict[str, Any]]:
        data = await self._json(
            "GET",
            f"/api/internal/cases?status=pending&guild_id={guild_id}",
        )
        return list(data.get("cases", []))

    async def vote(
        self,
        case_id: str,
        *,
        voter_id: int,
        voter_name: str,
        vote: str,
        note: str = "",
    ) -> dict[str, Any]:
        return await self._json(
            "POST",
            f"/api/internal/cases/{case_id}/votes",
            payload={
                "voter_discord_id": str(voter_id),
                "voter_name": voter_name,
                "vote": vote,
                "note": note,
            },
        )

    async def attach_message(self, case_id: str, message_id: int) -> None:
        await self._json(
            "PATCH",
            f"/api/internal/cases/{case_id}",
            payload={"discord_message_id": str(message_id)},
        )

    async def revoke(
        self,
        case_id: str,
        *,
        actor_id: int,
        actor_name: str,
        reason: str,
    ) -> dict[str, Any]:
        return await self._json(
            "PATCH",
            f"/api/internal/cases/{case_id}",
            payload={
                "revoke": True,
                "actor_discord_id": str(actor_id),
                "actor_name": actor_name,
                "reason": reason,
            },
        )

    async def settings(self, guild_id: int) -> dict[str, Any]:
        data = await self._json("GET", f"/api/internal/guilds/{guild_id}")
        return dict(data.get("settings", {}))

    async def update_settings(
        self,
        guild_id: int,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._json(
            "PUT",
            f"/api/internal/guilds/{guild_id}",
            payload=payload,
        )

    async def import_bans(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._json("POST", "/api/internal/import", payload=payload)

    async def public_bans(self) -> list[dict[str, Any]]:
        if not self.session:
            raise ShieldAPIError("API client has not started")
        async with self.session.get(f"{self.base_url}/api/bans") as response:
            data = await response.json()
            if response.status >= 400:
                raise ShieldAPIError(str(data.get("error", "Unable to load bans")), response.status)
            return list(data.get("bans", []))

    async def export_bytes(self) -> bytes:
        if not self.session:
            raise ShieldAPIError("API client has not started")
        async with self.session.get(f"{self.base_url}/api/export") as response:
            if response.status >= 400:
                raise ShieldAPIError("Unable to export the ban list", response.status)
            return await response.read()

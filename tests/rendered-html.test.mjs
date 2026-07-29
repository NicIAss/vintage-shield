import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

function runtimeEnv() {
  return {
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
  };
}

function context() {
  return {
    waitUntil() {},
    passThroughOnException() {},
  };
}

test("server-renders the complete Vintage Shield dashboard", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    runtimeEnv(),
    context(),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Vintage Shield/);
  assert.match(html, /PUBLIC BAN REGISTER/);
  assert.match(html, /Ban register/);
  assert.match(html, /Download complete list/);
  assert.match(html, /Latest approved reports/);
  assert.match(html, /\.pastemode multi/);
  assert.match(html, /DEMO DATA/);
  assert.match(html, /\/ban AshenRook 3650 day/);
  assert.doesNotMatch(html, /\/ban [^<\n]+ \d+ days /);
  assert.doesNotMatch(html, /player-avatar|profile picture/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|taking shape/i);
});

test("exports approved entries in Vintage Story's native JSON shape", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/export"),
    runtimeEnv(),
    context(),
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-disposition") ?? "",
    /public-banlist\.json/,
  );
  const rows = await response.json();
  assert.ok(Array.isArray(rows));
  assert.ok(rows.length > 0);
  assert.deepEqual(
    Object.keys(rows[0]).sort(),
    [
      "IssuedByPlayerName",
      "PlayerName",
      "PlayerUID",
      "Reason",
      "UntilDate",
    ].sort(),
  );
});

test("publishes a lightweight health endpoint", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/health"),
    runtimeEnv(),
    context(),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "vintage-shield");
});

test("rejects private API calls from any other Discord guild", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/internal/reports", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test-secret",
        "x-admin-guild-id": "999",
      },
      body: "{}",
    }),
    {
      ...runtimeEnv(),
      BOT_API_KEY: "test-secret",
      ADMIN_GUILD_ID: "123",
    },
    context(),
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.match(body.error, /configured admin Discord server/i);
});

"use client";

import { useMemo, useState } from "react";
import type { PublicBan } from "@/lib/ban-service";

type Props = {
  initialBans: PublicBan[];
  demo: boolean;
};

type BulkCopyRequest = {
  label: string;
  commands: string[];
} | null;

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function ageLabel(value: string) {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86400000),
  );
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function BanDashboard({ initialBans, demo }: Props) {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState("");
  const [bulkCopy, setBulkCopy] = useState<BulkCopyRequest>(null);

  const latest = useMemo(
    () =>
      [...initialBans]
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
        )
        .slice(0, 5),
    [initialBans],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return initialBans;
    return initialBans.filter((ban) =>
      [
        ban.playerName,
        ban.playerUid,
        ban.reason,
        ban.sourceServer,
        ban.id,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [initialBans, query]);

  const addedThisWeek = initialBans.filter(
    (ban) => Date.now() - new Date(ban.createdAt).getTime() < 7 * 86400000,
  ).length;
  const actioned = initialBans.filter((ban) => ban.actionTaken).length;

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  }

  async function confirmBulkCopy() {
    if (!bulkCopy) return;
    await copy(bulkCopy.commands.join("\n"), bulkCopy.label);
    setBulkCopy(null);
  }

  return (
    <main className="panel-shell">
      <header className="panel-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            VS
          </span>
          <div>
            <strong>VINTAGE SHIELD</strong>
            <small>PUBLIC BAN REGISTER</small>
          </div>
        </div>
        <div className="system-state">
          <span aria-hidden="true" />
          REGISTER ONLINE
        </div>
        <a className="export-link" href="/api/export">
          DOWNLOAD JSON
        </a>
      </header>

      <div className="panel-content">
        <section className="summary" aria-labelledby="summary-title">
          <div className="summary-copy">
            <p className="prompt">admin@vintage-shield:~$ status</p>
            <h1 id="summary-title">Ban register</h1>
            <p>
              Approved cases from the private admin Discord. Copy a single
              server command or download the complete native ban list.
            </p>
          </div>

          <div className="summary-actions">
            <a className="primary-action" href="/api/export">
              <span>public-banlist.json</span>
              <strong>Download complete list</strong>
            </a>
            <button
              type="button"
              onClick={() =>
                setBulkCopy({
                  label: `${initialBans.length} commands`,
                  commands: initialBans.map((ban) => ban.command),
                })
              }
              disabled={!initialBans.length}
            >
              <span>.pastemode multi</span>
              <strong>Copy all ban commands</strong>
            </button>
          </div>
        </section>

        <section className="stats" aria-label="Register status">
          <article>
            <span>ACTIVE</span>
            <strong>{initialBans.length.toString().padStart(2, "0")}</strong>
          </article>
          <article>
            <span>ADDED IN 7D</span>
            <strong>{addedThisWeek.toString().padStart(2, "0")}</strong>
          </article>
          <article>
            <span>ALREADY BANNED</span>
            <strong>{actioned.toString().padStart(2, "0")}</strong>
          </article>
          <article>
            <span>COMMAND FORMAT</span>
            <code>/ban name duration reason</code>
          </article>
        </section>

        {demo && (
          <div className="demo-notice" role="note">
            DEMO DATA: all names, identifiers, and case details are fictional.
          </div>
        )}

        <section className="data-panel" aria-labelledby="latest-title">
          <div className="panel-title">
            <div>
              <span>RECENT ACTIVITY</span>
              <h2 id="latest-title">Latest approved reports</h2>
            </div>
            <a href="#register">OPEN FULL REGISTER</a>
          </div>

          <div className="report-list">
            {latest.map((ban) => (
              <article className="report-row" key={ban.id}>
                <div className="report-identity">
                  <span>{ban.id}</span>
                  <strong>{ban.playerName}</strong>
                  <small>{ban.playerUid}</small>
                </div>
                <div className="report-reason">
                  <span>REASON</span>
                  <p>{ban.reason}</p>
                  <small>
                    {ban.sourceServer} / {ageLabel(ban.createdAt)}
                  </small>
                </div>
                <code>{ban.command}</code>
                <button
                  type="button"
                  onClick={() => copy(ban.command, ban.playerName)}
                >
                  COPY
                </button>
              </article>
            ))}
          </div>
        </section>

        <section
          className="data-panel register"
          id="register"
          aria-labelledby="register-title"
        >
          <div className="panel-title register-title">
            <div>
              <span>ALL ACTIVE CASES</span>
              <h2 id="register-title">Full register</h2>
            </div>
            <div className="register-tools">
              <label>
                <span className="sr-only">Search the ban register</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search player, UID, reason, or case"
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  setBulkCopy({
                    label: `${filtered.length} visible commands`,
                    commands: filtered.map((ban) => ban.command),
                  })
                }
                disabled={!filtered.length}
              >
                COPY {filtered.length} COMMANDS
              </button>
            </div>
          </div>

          <div className="register-table" role="table" aria-label="Active bans">
            <div className="register-row register-head" role="row">
              <span role="columnheader">PLAYER / UID</span>
              <span role="columnheader">REASON</span>
              <span role="columnheader">EXPIRES</span>
              <span role="columnheader">COMMAND</span>
              <span role="columnheader">ACTION</span>
            </div>

            {filtered.map((ban) => (
              <div className="register-row" role="row" key={ban.id}>
                <div className="register-player" role="cell">
                  <strong>{ban.playerName}</strong>
                  <small>{ban.playerUid}</small>
                  <span>{ban.id}</span>
                </div>
                <div className="register-reason" role="cell">
                  <p>{ban.reason}</p>
                  <small>{ban.sourceServer}</small>
                </div>
                <time role="cell" dateTime={ban.expiresAt}>
                  {shortDate(ban.expiresAt)}
                </time>
                <code role="cell">{ban.command}</code>
                <button
                  type="button"
                  onClick={() => copy(ban.command, ban.playerName)}
                  aria-label={`Copy ban command for ${ban.playerName}`}
                >
                  COPY
                </button>
              </div>
            ))}

            {!filtered.length && (
              <div className="empty-state">
                <strong>NO MATCHING CASES</strong>
                <button type="button" onClick={() => setQuery("")}>
                  CLEAR SEARCH
                </button>
              </div>
            )}
          </div>
        </section>

        <footer>
          <span>VINTAGE SHIELD</span>
          <p>
            Evidence and reviewer identities remain inside the private admin
            Discord.
          </p>
        </footer>
      </div>

      {copied && (
        <div className="toast" role="status">
          COPIED: {copied}
        </div>
      )}

      {bulkCopy && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="bulk-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-title"
          >
            <p className="danger-label">BULK ACTION WARNING</p>
            <h2 id="bulk-title">
              This will copy {bulkCopy.commands.length} ban commands.
            </h2>
            <p>
              Pasting this list can ban many players in one action. Check the
              register first and only continue if you intend to apply every
              command.
            </p>
            <ol>
              <li>
                Enter <code>.pastemode multi</code> in Vintage Story chat.
              </li>
              <li>Paste the copied command list.</li>
              <li>
                Enter <code>.pastemode single</code> when finished.
              </li>
            </ol>
            <div className="bulk-actions">
              <button type="button" onClick={() => setBulkCopy(null)}>
                CANCEL
              </button>
              <button type="button" onClick={confirmBulkCopy}>
                I UNDERSTAND, COPY COMMANDS
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

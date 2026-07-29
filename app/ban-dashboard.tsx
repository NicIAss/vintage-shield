"use client";

import { useMemo, useState } from "react";
import type { PublicBan } from "@/lib/ban-service";

type Props = {
  initialBans: PublicBan[];
  demo: boolean;
};

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

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export function BanDashboard({ initialBans, demo }: Props) {
  const [query, setQuery] = useState("");
  const [server, setServer] = useState("all");
  const [selected, setSelected] = useState<PublicBan | null>(null);
  const [copied, setCopied] = useState("");

  const servers = useMemo(
    () => [...new Set(initialBans.map((ban) => ban.sourceServer))].sort(),
    [initialBans],
  );
  const latest = useMemo(
    () =>
      [...initialBans]
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
        )
        .slice(0, 4),
    [initialBans],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return initialBans.filter((ban) => {
      const matchesServer = server === "all" || ban.sourceServer === server;
      const matchesSearch =
        !needle ||
        [
          ban.playerName,
          ban.playerUid,
          ban.reason,
          ban.sourceServer,
          ban.id,
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return matchesServer && matchesSearch;
    });
  }, [initialBans, query, server]);

  const addedThisWeek = initialBans.filter(
    (ban) => Date.now() - new Date(ban.createdAt).getTime() < 7 * 86400000,
  ).length;
  const actioned = initialBans.filter((ban) => ban.actionTaken).length;

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  }

  async function copyAll() {
    await copy(
      filtered.map((ban) => ban.command).join("\n"),
      `${filtered.length} commands`,
    );
  }

  return (
    <div className="app-shell">
      <main>
        <header className="dashboard-header">
          <div className="dashboard-nav">
            <a className="brand" href="#" aria-label="Vintage Shield home">
              <span className="brand-mark" aria-hidden="true">
                VS
              </span>
              <span>
                <strong>Vintage Shield</strong>
                <small>Public ban intelligence</small>
              </span>
            </a>
            <nav aria-label="Page navigation">
              <a href="#latest">Latest reports</a>
              <a href="#register">Full register</a>
              <a className="nav-download" href="/api/export">
                Download complete JSON
              </a>
            </nav>
          </div>

          <div className="dashboard-overview">
            <div className="dashboard-title">
              <p className="dashboard-kicker">
                <span className="status-dot" aria-hidden="true" />
                PUBLIC REGISTER ONLINE
              </p>
              <h1>Community ban dashboard</h1>
              <p>
                The latest approved reports, ready-to-run commands, and the
                complete Vintage Story ban list in one place.
              </p>
            </div>

            <aside className="export-panel" aria-label="Complete ban list">
              <span>COMPLETE BAN LIST</span>
              <strong>{initialBans.length} active entries</strong>
              <p>
                Download a server-ready <code>public-banlist.json</code> file or
                copy every active ban command.
              </p>
              <div>
                <a className="button button-lime" href="/api/export">
                  Download complete JSON
                </a>
                <button
                  className="button button-outline-light"
                  type="button"
                  onClick={() =>
                    copy(
                      initialBans.map((ban) => ban.command).join("\n"),
                      `${initialBans.length} commands`,
                    )
                  }
                  disabled={!initialBans.length}
                >
                  Copy all commands
                </button>
              </div>
            </aside>
          </div>

          <section className="dashboard-metrics" aria-label="Register summary">
            <article>
              <span>Active bans</span>
              <strong>{initialBans.length.toString().padStart(2, "0")}</strong>
              <small>Approved and unexpired</small>
            </article>
            <article>
              <span>Contributing servers</span>
              <strong>{servers.length.toString().padStart(2, "0")}</strong>
              <small>Across the shared network</small>
            </article>
            <article>
              <span>Added this week</span>
              <strong>{addedThisWeek.toString().padStart(2, "0")}</strong>
              <small>After community review</small>
            </article>
            <article>
              <span>Already actioned</span>
              <strong>{actioned.toString().padStart(2, "0")}</strong>
              <small>Reported as server-banned</small>
            </article>
          </section>
        </header>

        <div className="content">
          {demo && (
            <div className="demo-notice" role="note">
              <strong>Preview dataset</strong>
              <span>
                The names and case details shown in this demo are fictional.
                Your live register starts empty.
              </span>
            </div>
          )}

          <section
            className="latest"
            id="latest"
            aria-labelledby="latest-title"
          >
            <div className="section-heading latest-heading">
              <div>
                <p className="eyebrow">READY TO COPY</p>
                <h2 id="latest-title">Latest approved reports</h2>
              </div>
              <a href="#register">
                Search all {initialBans.length} entries ↓
              </a>
            </div>

            <div className="latest-grid">
              {latest.map((ban) => (
                <article className="report-card" key={ban.id}>
                  <div className="report-card-top">
                    <span>{ban.id}</span>
                    <time dateTime={ban.createdAt}>
                      {ageLabel(ban.createdAt)}
                    </time>
                  </div>
                  <div className="report-player">
                    <span className="player-avatar" aria-hidden="true">
                      {initials(ban.playerName)}
                    </span>
                    <div>
                      <h3>{ban.playerName}</h3>
                      <p>{ban.sourceServer}</p>
                    </div>
                  </div>
                  <p className="report-reason">{ban.reason}</p>
                  <code>{ban.command}</code>
                  <div className="report-actions">
                    <button
                      type="button"
                      onClick={() => copy(ban.command, ban.playerName)}
                    >
                      Copy ban command
                    </button>
                    <button type="button" onClick={() => setSelected(ban)}>
                      Details
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section
            className="register"
            id="register"
            aria-labelledby="register-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">CONFIRMED CASES</p>
                <h2 id="register-title">Public ban register</h2>
              </div>
              <div className="register-actions">
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={copyAll}
                  disabled={!filtered.length}
                >
                  Copy visible commands
                </button>
                <a
                  href="/api/export"
                  className="button button-dark button-small"
                >
                  Download JSON
                </a>
              </div>
            </div>

            <div className="filters">
              <label className="search-field">
                <span>Search</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Player, UID, reason, server or case…"
                />
              </label>
              <label>
                <span>Source server</span>
                <select
                  value={server}
                  onChange={(event) => setServer(event.target.value)}
                >
                  <option value="all">All servers</option>
                  {servers.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <div className="filter-result">
                <span>Showing</span>
                <strong>
                  {filtered.length} of {initialBans.length}
                </strong>
              </div>
            </div>

            <div className="ban-table" role="table" aria-label="Approved bans">
              <div className="ban-row ban-header" role="row">
                <span role="columnheader">Player</span>
                <span role="columnheader">Reason</span>
                <span role="columnheader">Source</span>
                <span role="columnheader">Approved</span>
                <span role="columnheader">Action</span>
              </div>

              {filtered.map((ban) => (
                <div className="ban-row" role="row" key={ban.id}>
                  <div className="player-cell" role="cell">
                    <span className="player-avatar" aria-hidden="true">
                      {initials(ban.playerName)}
                    </span>
                    <span>
                      <strong>{ban.playerName}</strong>
                      <small>{ban.id}</small>
                    </span>
                  </div>
                  <div className="reason-cell" role="cell">
                    <strong>{ban.reason}</strong>
                    <button type="button" onClick={() => setSelected(ban)}>
                      View case details
                    </button>
                  </div>
                  <div className="source-cell" role="cell">
                    <strong>{ban.sourceServer}</strong>
                    <small>
                      {ban.actionTaken ? "Ban reported" : "Review confirmed"}
                    </small>
                  </div>
                  <div className="date-cell" role="cell">
                    <strong>{shortDate(ban.createdAt)}</strong>
                    <small>{ageLabel(ban.createdAt)}</small>
                  </div>
                  <div className="action-cell" role="cell">
                    <button
                      type="button"
                      className="copy-button"
                      onClick={() => copy(ban.command, ban.playerName)}
                      aria-label={`Copy ban command for ${ban.playerName}`}
                    >
                      <span aria-hidden="true">COPY</span>
                      Command
                    </button>
                  </div>
                </div>
              ))}

              {!filtered.length && (
                <div className="empty-state">
                  <strong>No matching cases</strong>
                  <p>Try a different player name, UID, reason, or server.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setServer("all");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </section>

          <section
            className="workflow"
            id="workflow"
            aria-labelledby="workflow-title"
          >
            <div className="workflow-intro">
              <p className="eyebrow">BUILT-IN DUE PROCESS</p>
              <h2 id="workflow-title">From report to public record.</h2>
              <p>
                The website only exposes decisions. Discord holds the private
                evidence, reviewer identities, and full audit trail.
              </p>
            </div>
            <ol>
              <li>
                <span>01</span>
                <strong>Submit in Discord</strong>
                <p>
                  An admin files a suspicious-player report or records a ban
                  already issued on their server.
                </p>
              </li>
              <li>
                <span>02</span>
                <strong>Confirm or deny</strong>
                <p>
                  Trusted reviewers vote. Configurable thresholds prevent a
                  single person from publishing a case.
                </p>
              </li>
              <li>
                <span>03</span>
                <strong>Publish everywhere</strong>
                <p>
                  Approved cases appear here, in the JSON export, and in
                  server-ready command lists.
                </p>
              </li>
            </ol>
          </section>

          <section className="about" id="about">
            <div>
              <p className="eyebrow">ABOUT THE DATA</p>
              <h2>A signal, not a substitute for judgment.</h2>
            </div>
            <div className="about-copy">
              <p>
                Each server remains responsible for its own rules and decisions.
                Public reasons are intentionally concise; private evidence stays
                inside the admin community.
              </p>
              <p>
                Revoked and expired cases disappear from the public export while
                remaining in the private audit history.
              </p>
            </div>
          </section>

          <footer>
            <div className="brand footer-brand">
              <span className="brand-mark" aria-hidden="true">
                VS
              </span>
              <span>
                <strong>Vintage Shield</strong>
                <small>Community-run server safety</small>
              </span>
            </div>
            <p>
              Not affiliated with Anego Studios. Built for the admin community.
            </p>
          </footer>
        </div>
      </main>

      {copied && (
        <div className="toast" role="status">
          Copied {copied}
        </div>
      )}

      {selected && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSelected(null);
          }}
        >
          <section
            className="case-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="case-title"
          >
            <div className="modal-top">
              <span className="case-label">{selected.id}</span>
              <button
                type="button"
                className="modal-close"
                aria-label="Close case details"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <div className="modal-player">
              <span
                className="player-avatar player-avatar-large"
                aria-hidden="true"
              >
                {initials(selected.playerName)}
              </span>
              <div>
                <p className="eyebrow">APPROVED COMMUNITY BAN</p>
                <h2 id="case-title">{selected.playerName}</h2>
              </div>
            </div>
            <dl className="case-facts">
              <div>
                <dt>Player UID</dt>
                <dd>{selected.playerUid}</dd>
              </div>
              <div>
                <dt>Source server</dt>
                <dd>{selected.sourceServer}</dd>
              </div>
              <div>
                <dt>Approved</dt>
                <dd>{shortDate(selected.createdAt)}</dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>{shortDate(selected.expiresAt)}</dd>
              </div>
            </dl>
            <div className="case-reason">
              <span>Public reason</span>
              <p>{selected.reason}</p>
            </div>
            <div className="command-block">
              <code>{selected.command}</code>
              <button
                type="button"
                onClick={() => copy(selected.command, selected.playerName)}
              >
                Copy command
              </button>
            </div>
            <p className="privacy-note">
              Evidence and reviewer details are intentionally restricted to the
              private admin Discord.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

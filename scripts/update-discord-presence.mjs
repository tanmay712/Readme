#!/usr/bin/env node
/**
 * Generates assets/discord-presence.svg from the Lanyard API.
 *
 * Dependency-free by design: it talks to Lanyard directly, inlines small
 * images as data URIs (GitHub's camo proxy does not fetch external references
 * from inside an SVG), and writes a deterministic file so the workflow only
 * commits when the presence actually changes.
 *
 * Docs: https://github.com/Phineas/lanyard
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const USER_ID = process.env.LANYARD_USER_ID || "337964487241891840";
const API_URL = `https://api.lanyard.rest/v1/users/${USER_ID}`;
const OUT_FILE = path.join(process.cwd(), "assets", "discord-presence.svg");

const C = {
  bg: "#0d1117",
  panel: "#11161f",
  border: "#30363d",
  text: "#e6edf3",
  muted: "#8b949e",
  faint: "#6e7681",
  accent: "#8b5cf6",
  cyan: "#22d3ee",
  spotify: "#1db954",
};

const STATUS = {
  online: { label: "Online", color: "#3ba55c" },
  idle: { label: "Idle", color: "#faa61a" },
  dnd: { label: "Do not disturb", color: "#ed4245" },
  offline: { label: "Offline", color: "#747f8d" },
};

const FONT =
  "'JetBrains Mono','SFMono-Regular',Consolas,'Liberation Mono','Courier New',monospace";

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const truncate = (value, max = 64) => {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
};

const initials = (name) => {
  const parts = String(name || "void")
    .replace(/[^\p{L}\p{N} _.-]/gu, "")
    .split(/[\s_.-]+/)
    .filter(Boolean);
  if (!parts.length) return "v";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
};

const clock = (ms) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const duration = (ms) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
};

async function fetchJson(url, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "tanmay712-readme-presence" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDataUri(url, timeout = 8000) {
  if (!url || typeof url !== "string") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") || "").split(";")[0].trim();
    if (!type.startsWith("image/")) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 450_000) return null;
    return `data:${type};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function statusPill(status, rightX, y) {
  const meta = STATUS[status] || STATUS.offline;
  const width = 30 + meta.label.length * 7.2;
  const x = rightX - width;
  return `
    <g>
      <rect x="${x.toFixed(1)}" y="${y}" width="${width.toFixed(1)}" height="26" rx="13" fill="${meta.color}" fill-opacity="0.12" stroke="${meta.color}" stroke-opacity="0.45"/>
      <circle cx="${(x + 14).toFixed(1)}" cy="${y + 13}" r="4" fill="${meta.color}"/>
      <text x="${(x + 24).toFixed(1)}" y="${y + 17.5}" font-family="${FONT}" font-size="11.5" fill="${meta.color}" letter-spacing="0.3">${esc(meta.label)}</text>
    </g>`;
}

function progressBar(x, y, width, ratio, color) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const fill = clamped > 0 ? Math.max(4, width * clamped) : 0;
  return `
    <rect x="${x}" y="${y}" width="${width}" height="6" rx="3" fill="${C.border}"/>
    <rect x="${x}" y="${y}" width="${fill.toFixed(1)}" height="6" rx="3" fill="${color}"/>`;
}

function artBlock(href, x, y, size, radius, glyph, glyphColor) {
  const clipId = `clip-${Math.round(x)}-${Math.round(y)}`;
  if (!href) {
    return `
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="${C.panel}" stroke="${C.border}"/>
      <text x="${x + size / 2}" y="${y + size / 2 + 7}" text-anchor="middle" font-family="${FONT}" font-size="22" fill="${glyphColor}">${esc(glyph)}</text>`;
  }
  return `
    <defs><clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}"/></clipPath></defs>
    <image href="${href}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`;
}

function fallbackSvg(reason) {
  const width = 880;
  const height = 356;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Discord presence standby card">
  <defs>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.accent}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${C.cyan}" stop-opacity="0.05"/>
    </linearGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="${C.border}" stroke-opacity="0.26" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" rx="20" fill="${C.bg}"/>
  <rect width="${width}" height="${height}" rx="20" fill="url(#grid)"/>
  <rect width="${width}" height="${height}" rx="20" fill="url(#glow)"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="19.5" fill="none" stroke="${C.border}"/>

  <text x="36" y="42" font-family="${FONT}" font-size="11.5" fill="${C.muted}" letter-spacing="2.4">DISCORD PRESENCE</text>
  <text x="${width - 36}" y="42" text-anchor="end" font-family="${FONT}" font-size="11" fill="${C.faint}" letter-spacing="1.2">LANYARD · STANDBY</text>
  <line x1="36" y1="64" x2="${width - 36}" y2="64" stroke="${C.border}"/>

  <rect x="36" y="92" width="64" height="64" rx="32" fill="${C.panel}" stroke="${C.border}"/>
  <text x="68" y="133" text-anchor="middle" font-family="${FONT}" font-size="24" fill="${C.accent}">${esc(initials("void"))}</text>
  <text x="118" y="116" font-family="${FONT}" font-size="21" font-weight="700" fill="${C.text}">void</text>
  <text x="118" y="140" font-family="${FONT}" font-size="13" fill="${C.muted}">@definescloud · ${esc(USER_ID)}</text>
  <text x="${width - 36}" y="116" text-anchor="end" font-family="${FONT}" font-size="11" fill="${C.faint}" letter-spacing="1.4">NOT MONITORED</text>
  <text x="${width - 36}" y="140" text-anchor="end" font-family="${FONT}" font-size="11" fill="${C.faint}" letter-spacing="1.4">AUTO-SYNC ON</text>

  <line x1="36" y1="180" x2="${width - 36}" y2="180" stroke="${C.border}"/>

  <text x="36" y="218" font-family="${FONT}" font-size="15" fill="${C.text}">Presence is standing by.</text>
  <text x="36" y="244" font-family="${FONT}" font-size="12.5" fill="${C.muted}">Join the Lanyard Discord server and enable activity sharing to appear here.</text>
  <text x="36" y="266" font-family="${FONT}" font-size="12.5" fill="${C.muted}">The card refreshes automatically every 5 minutes via GitHub Actions.</text>
  <text x="36" y="306" font-family="${FONT}" font-size="10.5" fill="${C.faint}">${esc(truncate(reason || "waiting for the first presence sync", 100))}</text>
  <rect x="${width - 196}" y="292" width="160" height="26" rx="13" fill="${C.accent}" fill-opacity="0.12" stroke="${C.accent}" stroke-opacity="0.45"/>
  <circle cx="${width - 180}" cy="305" r="4" fill="${C.accent}"/>
  <text x="${width - 170}" y="309.5" font-family="${FONT}" font-size="11" fill="${C.accent}">auto-sync on</text>
</svg>`;
}

function renderCard(data, images) {
  const user = data.discord_user || {};
  const status = data.discord_status || "offline";
  const activities = Array.isArray(data.activities) ? data.activities : [];
  const spotify = data.spotify && data.spotify.song ? data.spotify : null;
  const other = activities.find((a) => a && a.type !== 2 && a.name);
  const listening = activities.find((a) => a && a.type === 2 && a.name);

  const width = 880;
  const pad = 36;
  const innerW = width - pad * 2;
  const now = Date.now();

  const displayName = user.display_name || user.global_name || user.username || "void";
  const username = user.username || "definescloud";
  const userId = user.id || USER_ID;
  const platform = data.active_on_discord_desktop
    ? "DESKTOP"
    : data.active_on_discord_mobile
      ? "MOBILE"
      : data.active_on_discord_web
        ? "WEB"
        : "DISCORD";

  const spotifyStart = Number(spotify?.timestamps?.start || 0);
  const spotifyEnd = Number(spotify?.timestamps?.end || 0);
  const spotifyRatio = spotifyEnd > spotifyStart ? (now - spotifyStart) / (spotifyEnd - spotifyStart) : 0;

  const otherStart = Number(other?.timestamps?.start || 0);
  const otherEnd = Number(other?.timestamps?.end || 0);
  const otherRatio = otherEnd > otherStart ? (now - otherStart) / (otherEnd - otherStart) : 0;

  const headerH = 76;
  const profileH = 100;
  const spotifyH = spotify ? 174 : 0;
  const otherH = other ? (otherEnd > otherStart ? 174 : 164) : 0;
  const emptyH = !spotify && !other ? 110 : 0;
  const listeningH = listening ? 46 : 0;
  const footerH = 52;
  const height = headerH + profileH + spotifyH + otherH + emptyH + listeningH + footerH;

  let y = headerH + 34;
  const avatarY = headerH + 18;

  const profile = `
    <g>
      <text x="${pad + 82}" y="${y - 4}" font-family="${FONT}" font-size="21" font-weight="700" fill="${C.text}">${esc(truncate(displayName, 30))}</text>
      <text x="${pad + 82}" y="${y + 20}" font-family="${FONT}" font-size="13" fill="${C.muted}">@${esc(username)} · ${esc(userId)}</text>
      <text x="${width - pad}" y="${y - 4}" text-anchor="end" font-family="${FONT}" font-size="11" fill="${C.faint}" letter-spacing="1.4">${esc(platform)}</text>
      <text x="${width - pad}" y="${y + 20}" text-anchor="end" font-family="${FONT}" font-size="11" fill="${C.faint}" letter-spacing="1.4">ID ${esc(userId)}</text>
    </g>`;

  let spotifyBlock = "";
  if (spotify) {
    y += 30;
    spotifyBlock = `
      <text x="${pad}" y="${y - 12}" font-family="${FONT}" font-size="11" fill="${C.faint}" letter-spacing="2.2">NOW PLAYING</text>
      <text x="${width - pad}" y="${y - 12}" text-anchor="end" font-family="${FONT}" font-size="12" fill="${C.spotify}">● Spotify</text>
      <line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="${C.border}"/>
      ${artBlock(images.spotifyArt, pad, y + 14, 76, 10, "♫", C.spotify)}
      <text x="${pad + 94}" y="${y + 32}" font-family="${FONT}" font-size="10.5" fill="${C.spotify}" letter-spacing="1.8">SPOTIFY</text>
      <text x="${pad + 94}" y="${y + 56}" font-family="${FONT}" font-size="18" font-weight="700" fill="${C.text}">${esc(truncate(spotify.song, 52))}</text>
      <text x="${pad + 94}" y="${y + 78}" font-family="${FONT}" font-size="13" fill="${C.muted}">${esc(truncate(spotify.artist, 58))}</text>
      <text x="${pad + 94}" y="${y + 98}" font-family="${FONT}" font-size="11.5" fill="${C.faint}">${esc(truncate(spotify.album, 62))}</text>
      ${progressBar(pad, y + 112, innerW, spotifyRatio, C.spotify)}
      <text x="${pad}" y="${y + 136}" font-family="${FONT}" font-size="11" fill="${C.muted}">${clock(now - spotifyStart)}</text>
      <text x="${width - pad}" y="${y + 136}" text-anchor="end" font-family="${FONT}" font-size="11" fill="${C.muted}">${clock(spotifyEnd - now)} remaining</text>`;
    y += 174;
  }

  let otherBlock = "";
  if (other) {
    y += 30;
    const label =
      other.type === 1 ? "STREAMING" : other.type === 3 ? "WATCHING" : other.type === 5 ? "COMPETING" : "PLAYING";
    otherBlock = `
      <text x="${pad}" y="${y - 12}" font-family="${FONT}" font-size="11" fill="${C.faint}" letter-spacing="2.2">ACTIVITY</text>
      <line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="${C.border}"/>
      ${artBlock(images.activityArt, pad, y + 14, 76, 10, "▶", C.accent)}
      <text x="${pad + 94}" y="${y + 32}" font-family="${FONT}" font-size="10.5" fill="${C.accent}" letter-spacing="1.8">${esc(label)}</text>
      <text x="${pad + 94}" y="${y + 56}" font-family="${FONT}" font-size="18" font-weight="700" fill="${C.text}">${esc(truncate(other.name, 52))}</text>
      <text x="${pad + 94}" y="${y + 78}" font-family="${FONT}" font-size="13" fill="${C.muted}">${esc(truncate(other.details || other.state, 64))}</text>
      <text x="${pad + 94}" y="${y + 98}" font-family="${FONT}" font-size="11.5" fill="${C.faint}">${esc(truncate(other.state || other.details, 64))}</text>`;
    if (otherEnd > otherStart) {
      otherBlock += `
        ${progressBar(pad, y + 112, innerW, otherRatio, C.accent)}
        <text x="${pad}" y="${y + 136}" font-family="${FONT}" font-size="11" fill="${C.muted}">${clock(now - otherStart)} elapsed</text>
        <text x="${width - pad}" y="${y + 136}" text-anchor="end" font-family="${FONT}" font-size="11" fill="${C.muted}">${clock(otherEnd - now)} left</text>`;
      y += 174;
    } else {
      otherBlock += `
        <text x="${pad}" y="${y + 126}" font-family="${FONT}" font-size="11" fill="${C.muted}">${otherStart ? `${duration(now - otherStart)} elapsed` : "No timer reported"}</text>`;
      y += 164;
    }
  }

  let emptyBlock = "";
  if (!spotify && !other) {
    emptyBlock = `
      <text x="${pad}" y="${y + 4}" font-family="${FONT}" font-size="11" fill="${C.faint}" letter-spacing="2.2">ACTIVITY</text>
      <line x1="${pad}" y1="${y + 18}" x2="${width - pad}" y2="${y + 18}" stroke="${C.border}"/>
      <text x="${pad}" y="${y + 50}" font-family="${FONT}" font-size="14" fill="${C.muted}">Nothing on the turntable right now.</text>
      <text x="${pad}" y="${y + 72}" font-family="${FONT}" font-size="12" fill="${C.faint}">When a game, app, or Spotify track starts, it lands here.</text>`;
    y += 110;
  }

  const listeningBlock = listening
    ? `
      <text x="${pad}" y="${y + 4}" font-family="${FONT}" font-size="11" fill="${C.faint}" letter-spacing="2.2">ALSO LISTENING</text>
      <text x="${pad}" y="${y + 28}" font-family="${FONT}" font-size="13" fill="${C.muted}">${esc(truncate(listening.name, 64))}${listening.state ? ` — ${esc(truncate(listening.state, 40))}` : ""}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Live Discord presence for ${esc(displayName)}">
  <defs>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.accent}" stop-opacity="0.20"/>
      <stop offset="0.55" stop-color="${C.cyan}" stop-opacity="0.05"/>
      <stop offset="1" stop-color="${C.accent}" stop-opacity="0.12"/>
    </linearGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="${C.border}" stroke-opacity="0.24" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" rx="20" fill="${C.bg}"/>
  <rect width="${width}" height="${height}" rx="20" fill="url(#grid)"/>
  <rect width="${width}" height="${height}" rx="20" fill="url(#glow)"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="19.5" fill="none" stroke="${C.border}"/>

  <text x="${pad}" y="42" font-family="${FONT}" font-size="11.5" fill="${C.muted}" letter-spacing="2.4">DISCORD PRESENCE</text>
  <text x="${width - pad}" y="42" text-anchor="end" font-family="${FONT}" font-size="11" fill="${C.faint}" letter-spacing="1.2">VIA LANYARD</text>
  ${statusPill(status, width - pad, 50)}
  <line x1="${pad}" y1="${headerH}" x2="${width - pad}" y2="${headerH}" stroke="${C.border}"/>

  ${artBlock(images.avatar, pad, avatarY, 64, 32, initials(displayName), C.accent)}
  ${profile}
  <line x1="${pad}" y1="${headerH + profileH}" x2="${width - pad}" y2="${headerH + profileH}" stroke="${C.border}"/>

  ${spotifyBlock}
  ${otherBlock}
  ${emptyBlock}
  ${listeningBlock}

  <line x1="${pad}" y1="${height - footerH + 8}" x2="${width - pad}" y2="${height - footerH + 8}" stroke="${C.border}"/>
  <text x="${pad}" y="${height - 20}" font-family="${FONT}" font-size="10.5" fill="${C.faint}" letter-spacing="0.8">status: ${esc(status)} · refreshed by GitHub Actions</text>
  <text x="${width - pad}" y="${height - 20}" text-anchor="end" font-family="${FONT}" font-size="10.5" fill="${C.faint}" letter-spacing="0.8">discord.com/users/${esc(userId)}</text>
</svg>`;
}

async function main() {
  let svg;
  try {
    const fixture = process.env.PRESENCE_FIXTURE;
    const payload = fixture
      ? JSON.parse(await readFile(fixture, "utf8"))
      : await fetchJson(API_URL);
    if (!payload || payload.success !== true || !payload.data) {
      const reason = "Lanyard has no presence for this account yet.";
      console.warn(`[presence] ${reason}`);
      svg = fallbackSvg(reason);
    } else {
      const data = payload.data;
      const user = data.discord_user || {};
      const spotify = data.spotify && data.spotify.song ? data.spotify : null;
      const other = (data.activities || []).find((a) => a && a.type !== 2 && a.name);

      const [avatar, spotifyArt, activityArt] = await Promise.all([
        user.avatar
          ? fetchDataUri(`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`)
          : Promise.resolve(null),
        spotify?.album_art_url ? fetchDataUri(spotify.album_art_url) : Promise.resolve(null),
        other?.assets?.large_image
          ? fetchDataUri(
              `https://cdn.discordapp.com/app-assets/${other.application_id}/${other.assets.large_image}.png`,
            )
          : Promise.resolve(null),
      ]);

      svg = renderCard(data, { avatar, spotifyArt, activityArt });
      console.log(`[presence] rendered @${user.username || "unknown"} (${data.discord_status})`);
    }
  } catch (error) {
    const reason = `Lanyard request failed: ${error instanceof Error ? error.message : "unknown error"}`;
    console.warn(`[presence] ${reason}`);
    svg = fallbackSvg(reason);
  }

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, svg, "utf8");
  console.log(`[presence] wrote ${OUT_FILE} (${Buffer.byteLength(svg)} bytes)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

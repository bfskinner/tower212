// Pulls the USF football schedule, results, and last-game leaders from ESPN's
// public JSON (no key needed) and writes src/data/schedule.json.
// Only rewrites the file when something changed.

import { readFile, writeFile } from 'node:fs/promises';

const TEAM = 58; // USF on ESPN
const OUT = new URL('../src/data/schedule.json', import.meta.url);
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
// ESPN sometimes refuses requests from cloud servers. Try its second host too.
const HOSTS = [BASE, BASE.replace('site.api.espn.com', 'site.web.api.espn.com')];
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  accept: 'application/json,text/plain,*/*',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://www.espn.com/',
  origin: 'https://www.espn.com',
};

async function get(path) {
  let last;
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + path, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
      if (res.ok) return res.json();
      last = new Error(`${res.status} ${host + path}`);
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

let sched;
try {
  sched = await get(`/teams/${TEAM}/schedule`);
} catch (err) {
  // Keep the last good schedule. The matchday strip also refreshes from ESPN in the visitor's browser.
  console.log(`ESPN unavailable (${err.message}). schedule.json left as is.`);
  process.exit(0);
}

const games = (sched.events ?? []).map((ev) => {
  const comp = ev.competitions?.[0] ?? {};
  const us = comp.competitors?.find((c) => String(c.id) === String(TEAM)) ?? {};
  const them = comp.competitors?.find((c) => String(c.id) !== String(TEAM)) ?? {};
  const state = comp.status?.type?.state ?? 'pre'; // pre | in | post
  const score = (c) => (c.score == null ? null : Number(c.score.value ?? c.score.displayValue ?? c.score));
  const t = them.team ?? {};
  return {
    id: ev.id,
    date: ev.date,
    timeTBD: Boolean(comp.timeValid === false || ev.timeValid === false),
    home: us.homeAway === 'home',
    neutral: Boolean(comp.neutralSite),
    conference: Boolean(comp.conferenceCompetition),
    opponent: t.shortDisplayName || t.displayName || t.location || 'TBA',
    opponentFull: t.displayName || t.shortDisplayName || 'TBA',
    opponentAbbr: t.abbreviation || '',
    opponentLogo: t.logos?.[0]?.href || t.logo || null,
    venue: comp.venue?.fullName || '',
    city: [comp.venue?.address?.city, comp.venue?.address?.state].filter(Boolean).join(', '),
    tv: (comp.broadcasts ?? []).map((b) => b.media?.shortName || b.names?.[0]).filter(Boolean).join(' · ') || '',
    state,
    detail: comp.status?.type?.shortDetail || '',
    usScore: state === 'pre' ? null : score(us),
    themScore: state === 'pre' ? null : score(them),
    result: state === 'post' ? (us.winner ? 'W' : them.winner ? 'L' : 'T') : null,
  };
});

// Leaders for the most recent final game.
let leaders = [];
const lastFinal = [...games].reverse().find((g) => g.state === 'post');
if (lastFinal) {
  try {
    const sum = await get(`/summary?event=${lastFinal.id}`);
    const ours = sum.leaders?.find((l) => String(l.team?.id) === String(TEAM));
    const pick = { passingYards: 'Passing', rushingYards: 'Rushing', receivingYards: 'Receiving' };
    leaders = (ours?.leaders ?? [])
      .filter((c) => pick[c.name])
      .map((c) => ({
        label: pick[c.name],
        name: c.leaders?.[0]?.athlete?.shortName || c.leaders?.[0]?.athlete?.displayName || '',
        value: c.leaders?.[0]?.displayValue || '',
      }));
  } catch (err) {
    console.log('Leaders unavailable:', err.message);
  }
}

const team = sched.team ?? {};
const next = {
  season: sched.season?.year ?? new Date().getFullYear(),
  record: team.recordSummary || '',
  standing: team.standingSummary || '',
  games,
  leaders,
  leadersGameId: lastFinal?.id ?? null,
};

let prev = null;
try {
  prev = JSON.parse(await readFile(OUT, 'utf8'));
} catch {}
const strip = (o) => JSON.stringify({ ...o, updatedAt: undefined });
if (prev && strip(prev) === strip(next)) {
  console.log('Schedule unchanged.');
} else if (!games.length) {
  console.log('ESPN returned no games. Leaving schedule.json alone.');
} else {
  await writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), ...next }, null, 2) + '\n');
  console.log(`schedule.json updated: ${games.length} games, record ${next.record}.`);
}

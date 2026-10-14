// Pulls the USF football schedule, results, and last-game leaders from ESPN's
// public JSON (no key needed) and writes src/data/schedule.json.
// Only rewrites the file when something changed.

import { readFile, writeFile } from 'node:fs/promises';

const TEAM = 58; // USF on ESPN
const OUT = new URL('../src/data/schedule.json', import.meta.url);
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Tower212Bot/1.0' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const sched = await get(`${BASE}/teams/${TEAM}/schedule`);

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
    const sum = await get(`${BASE}/summary?event=${lastFinal.id}`);
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

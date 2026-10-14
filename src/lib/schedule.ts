import data from '../data/schedule.json';

export type Game = (typeof data.games)[number];
export const schedule = data;
export const games: Game[] = [...data.games].sort((a, b) => (a.date < b.date ? -1 : 1));

const now = Date.now();
export const lastFinal =
  [...games].reverse().find((g) => g.state === 'post' && g.usScore != null) ??
  [...games].reverse().find((g) => g.state === 'post');
export const live = games.find((g) => g.state === 'in');
export const upcoming = games.filter((g) => g.state === 'pre' && new Date(g.date).getTime() > now - 6 * 3600e3);
export const nextGame = live ?? upcoming[0];

export const vs = (g: Game) => (g.home ? `vs ${g.opponent}` : g.neutral ? `vs ${g.opponent}` : `at ${g.opponent}`);
export const record = () => {
  if (data.record) return data.record;
  const w = games.filter((g) => g.result === 'W').length;
  const l = games.filter((g) => g.result === 'L').length;
  return w + l ? `${w}–${l}` : '';
};

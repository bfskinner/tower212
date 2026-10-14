import data from '../data/feeds.json';
import * as yaml from 'js-yaml';
import sourcesRaw from '../data/sources.yml?raw';

export type Episode = (typeof data.podcasts)[number];
export type Headline = (typeof data.news)[number];
export const feeds = data;
export const podcasts: Episode[] = data.podcasts ?? [];
export const news: Headline[] = data.news ?? [];

type Dir = { kind: string; name: string; note: string; url: string };
export const sources = yaml.load(sourcesRaw) as { podcasts: any[]; news: any[]; directory: Dir[] };

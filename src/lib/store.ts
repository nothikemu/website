import type { DiscordProfile, RecentTrack, ReposResponse, SpotifyResponse, SteamResponse } from '../../shared/types';
import type { LanyardPresence, LanyardState } from './lanyard';

export type Load<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error' };

/** Whatever is playing right now, normalised from Lanyard or the Spotify API. */
export interface NowTrack {
  key: string;
  id: string | null;
  title: string;
  artist: string;
  album: string;
  art: string | null;
  url: string | null;
  /** epoch ms at which the track (virtually) started */
  start: number;
  durationMs: number;
  paused: boolean;
  /** frozen progress while paused */
  pausedAt: number;
  source: 'discord' | 'spotify';
}

export interface State {
  presence: LanyardPresence | null;
  lanyard: LanyardState;
  spotify: Load<SpotifyResponse>;
  repos: Load<ReposResponse>;
  discordProfile: DiscordProfile | null;
  steam: Load<SteamResponse>;
  now: NowTrack | null;
  /** listening history, newest first, persisted in localStorage */
  history: RecentTrack[];
}

type Key = keyof State;
type Sub = { keys: Key[]; fn: (s: State) => void };

/** Minimal keyed pub/sub: a view only re-renders when a slice it cares about changes. */
const state: State = {
  presence: null,
  lanyard: 'connecting',
  spotify: { status: 'loading' },
  repos: { status: 'loading' },
  discordProfile: null,
  steam: { status: 'loading' },
  now: null,
  history: [],
};
const subs: Sub[] = [];

export const getState = () => state;

export function set<K extends Key>(key: K, value: State[K]) {
  state[key] = value;
  for (const s of subs) if (s.keys.includes(key)) s.fn(state);
}

export function watch(keys: Key[], fn: (s: State) => void) {
  subs.push({ keys, fn });
  fn(state);
}

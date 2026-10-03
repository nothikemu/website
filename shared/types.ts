/** Shapes returned by the /api routes (and produced client-side when falling back). */

export interface Repo {
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  homepage: string | null;
  language: string | null;
  stars: number;
  forks: number;
  fork: boolean;
  archived: boolean;
  topics: string[];
  pushedAt: string;
  createdAt: string;
}

export interface ReposResponse {
  user: string;
  repos: Repo[];
}

export interface Track {
  id: string;
  title: string;
  artists: string[];
  album: string;
  art: string | null;
  /** Small artwork for list rows (~64px). */
  artSmall: string | null;
  url: string;
  durationMs: number;
}

export interface RecentTrack extends Track {
  playedAt: string;
}

export interface NowPlaying extends Track {
  isPlaying: boolean;
  progressMs: number;
  /** Server time (ms) at which progressMs was sampled. */
  sampledAt: number;
}

export interface SpotifyResponse {
  configured: boolean;
  error?: 'reauth' | 'upstream' | 'rate_limited';
  now: NowPlaying | null;
  recent: RecentTrack[];
}

export interface DiscordProfile {
  banner: string | null;
  accentColor: string | null;
  bio: string | null;
}

export interface SteamResponse {
  configured: boolean;
  error?: 'upstream';
  profile?: {
    name: string;
    avatar: string;
    url: string;
    /** 0 offline, 1 online, 2 busy, 3 away, 4 snooze, 5 looking to trade, 6 looking to play */
    state: number;
    game: string | null;
  };
  recent?: { appId: number; name: string; minutes2w: number; minutesTotal: number; icon: string | null }[];
}

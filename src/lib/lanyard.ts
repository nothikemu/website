/**
 * Realtime Discord presence via Lanyard (https://github.com/Phineas/lanyard).
 * One WebSocket, heartbeat as instructed by the server, exponential reconnect.
 * Falls back to a single REST read if the socket can't deliver an initial state.
 */

export type DiscordStatus = 'online' | 'idle' | 'dnd' | 'offline';

export interface LanyardActivity {
  id: string;
  name: string;
  type: number; // 0 playing, 1 streaming, 2 listening, 3 watching, 4 custom, 5 competing
  state?: string;
  details?: string;
  application_id?: string;
  created_at?: number;
  url?: string;
  emoji?: { name: string; id?: string; animated?: boolean };
  timestamps?: { start?: number; end?: number };
  assets?: { large_image?: string; large_text?: string; small_image?: string; small_text?: string };
}

export interface LanyardSpotify {
  track_id: string | null;
  timestamps: { start: number; end: number };
  song: string;
  artist: string;
  album: string;
  album_art_url: string | null;
}

export interface LanyardPresence {
  discord_user: {
    id: string;
    username: string;
    global_name?: string | null;
    display_name?: string | null;
    avatar: string | null;
    avatar_decoration_data?: { asset: string } | null;
  };
  discord_status: DiscordStatus;
  activities: LanyardActivity[];
  listening_to_spotify: boolean;
  spotify: LanyardSpotify | null;
  active_on_discord_desktop: boolean;
  active_on_discord_mobile: boolean;
  active_on_discord_web: boolean;
  active_on_discord_embedded?: boolean;
}

export type LanyardState = 'connecting' | 'live' | 'polling' | 'unavailable';
type Listener = (presence: LanyardPresence | null, state: LanyardState) => void;

const SOCKET = 'wss://api.lanyard.rest/socket';
const REST = 'https://api.lanyard.rest/v1/users/';

const valid = (d: unknown): d is LanyardPresence => !!d && typeof d === 'object' && 'discord_user' in d;

export function connectLanyard(id: string, listener: Listener): () => void {
  let ws: WebSocket | null = null;
  let heartbeat: number | undefined;
  let reconnect: number | undefined;
  let attempt = 0;
  let latest: LanyardPresence | null = null;
  let state: LanyardState = 'connecting';
  let stopped = false;
  let restInFlight = false;

  const emit = (next: LanyardState) => {
    state = next;
    listener(latest, state);
  };

  const rest = async () => {
    if (restInFlight) return;
    restInFlight = true;
    try {
      const res = await fetch(REST + id, { signal: AbortSignal.timeout(8000) });
      const body = await res.json();
      if (body?.success && valid(body.data)) {
        latest = body.data;
        if (state !== 'live') emit('polling');
      } else if (!latest) emit('unavailable');
    } catch {
      if (!latest) emit('unavailable');
    } finally {
      restInFlight = false;
    }
  };

  const open = () => {
    if (stopped) return;
    let gotState = false;
    try {
      ws = new WebSocket(SOCKET);
    } catch {
      void rest();
      return schedule();
    }
    // If the socket is slow to hand us a state, paint from REST meanwhile.
    const slow = window.setTimeout(() => !gotState && void rest(), 3000);

    ws.onmessage = (event) => {
      let msg: { op: number; t?: string; d?: any };
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.op === 1) {
        ws?.send(JSON.stringify({ op: 2, d: { subscribe_to_id: id } }));
        window.clearInterval(heartbeat);
        heartbeat = window.setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('{"op":3}'), msg.d?.heartbeat_interval ?? 30000);
      } else if (msg.op === 0 && (msg.t === 'INIT_STATE' || msg.t === 'PRESENCE_UPDATE')) {
        gotState = true;
        attempt = 0;
        window.clearTimeout(slow);
        if (valid(msg.d)) latest = msg.d;
        emit(latest ? 'live' : 'unavailable');
      }
    };

    ws.onclose = () => {
      window.clearTimeout(slow);
      window.clearInterval(heartbeat);
      if (stopped) return;
      if (!gotState) void rest();
      else if (latest) emit('polling');
      schedule();
    };
    ws.onerror = () => ws?.close();
  };

  const schedule = () => {
    window.clearTimeout(reconnect);
    const delay = Math.min(30000, 1000 * 2 ** attempt++) + Math.random() * 500;
    reconnect = window.setTimeout(open, delay);
  };

  // Come back quickly after a laptop sleeps / the tab is restored.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && (!ws || ws.readyState === WebSocket.CLOSED)) {
      attempt = 0;
      window.clearTimeout(reconnect);
      open();
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  emit('connecting');
  open();

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    window.clearTimeout(reconnect);
    window.clearInterval(heartbeat);
    ws?.close();
  };
}

/* ---------- helpers for turning presence into pixels ---------- */

export function avatarUrl(p: LanyardPresence, size = 256): string {
  const u = p.discord_user;
  if (!u.avatar) return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;
  const ext = u.avatar.startsWith('a_') ? 'gif' : 'webp';
  return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${ext}?size=${size}`;
}

export function decorationUrl(p: LanyardPresence): string | null {
  const asset = p.discord_user.avatar_decoration_data?.asset;
  return asset ? `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png?size=160&passthrough=true` : null;
}

export function assetUrl(activity: LanyardActivity, key: 'large_image' | 'small_image'): string | null {
  const asset = activity.assets?.[key];
  if (!asset) return null;
  if (asset.startsWith('mp:external/')) return `https://media.discordapp.net/external/${asset.slice('mp:external/'.length)}`;
  if (asset.startsWith('mp:')) return `https://media.discordapp.net/${asset.slice(3)}`;
  if (asset.startsWith('spotify:')) return `https://i.scdn.co/image/${asset.slice(8)}`;
  if (activity.application_id) return `https://cdn.discordapp.com/app-assets/${activity.application_id}/${asset}.png?size=160`;
  return null;
}

export function emojiUrl(emoji: NonNullable<LanyardActivity['emoji']>): string | null {
  return emoji.id ? `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'webp'}?size=48` : null;
}

export const STATUS_LABEL: Record<DiscordStatus, string> = {
  online: 'online',
  idle: 'idle',
  dnd: 'do not disturb',
  offline: 'offline',
};

export const VERB: Record<number, string> = { 0: 'playing', 1: 'streaming', 2: 'listening to', 3: 'watching', 5: 'competing in' };

/** Activities worth showing as "what i'm doing" (not the custom status, not Spotify which has its own card). */
export const mainActivities = (p: LanyardPresence) =>
  p.activities.filter((a) => a.type !== 4 && !(a.type === 2 && a.name === 'Spotify'));

export const customStatus = (p: LanyardPresence) => p.activities.find((a) => a.type === 4) ?? null;

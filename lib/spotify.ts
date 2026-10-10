import { clearState, getState, lastSeenSong, setState, upsertSong } from './db';
import type { Now, Track } from './types';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const PLAYER_URL = 'https://api.spotify.com/v1/me/player?additional_types=track,episode';
/** Both people poll every ~4s; Spotify is asked at most once per this window. */
const CACHE_MS = 3500;

export const SCOPES = 'user-read-currently-playing user-read-playback-state';

type SpotifyAuth = {
  refresh_token: string;
  access_token?: string;
  expires_at?: number;
  connected_at?: string;
};

function basicAuth() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET');
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

export function redirectUri(req: Request) {
  return process.env.SPOTIFY_REDIRECT_URI || new URL('/callback', req.url).toString();
}

export async function exchangeCode(code: string, redirect: string) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect }),
    cache: 'no-store',
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error_description || j.error || `Token exchange failed (${res.status})`);
  const auth: SpotifyAuth = {
    refresh_token: j.refresh_token,
    access_token: j.access_token,
    expires_at: Date.now() + j.expires_in * 1000,
    connected_at: new Date().toISOString(),
  };
  await setState('spotify', auth);
  await clearState('now');
}

async function accessToken(): Promise<string | null> {
  const auth = await getState<SpotifyAuth>('spotify');
  if (!auth?.refresh_token) return null;
  if (auth.access_token && auth.expires_at && auth.expires_at - Date.now() > 60_000) {
    return auth.access_token;
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refresh_token }),
    cache: 'no-store',
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Spotify login expired (${j.error_description || j.error || res.status}). Reconnect Spotify.`);
  }
  const next: SpotifyAuth = {
    ...auth,
    access_token: j.access_token,
    expires_at: Date.now() + j.expires_in * 1000,
    refresh_token: j.refresh_token || auth.refresh_token,
  };
  await setState('spotify', next);
  return next.access_token!;
}

/** Raw Spotify response, for the Jam spike test. */
export async function rawPlayer() {
  const token = await accessToken();
  if (!token) return { connected: false };
  const res = await fetch(PLAYER_URL, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { connected: true, http_status: res.status, body };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toTrack(item: any): Track | null {
  if (!item) return null;
  const isEpisode = item.type === 'episode';
  const id: string | null = item.id || (item.uri ? `local:${item.uri}` : null);
  if (!id) return null;
  const images: { url: string }[] =
    (isEpisode ? item.images?.length ? item.images : item.show?.images : item.album?.images) || [];
  const artist = isEpisode
    ? item.show?.name || 'Podcast'
    : (item.artists || []).map((a: any) => a.name).join(', ') || 'Unknown artist';
  return {
    id,
    title: item.name || 'Unknown',
    artist,
    album: (isEpisode ? item.show?.name : item.album?.name) ?? null,
    art_url: images[0]?.url ?? null,
    duration_ms: item.duration_ms || 0,
    spotify_url: item.external_urls?.spotify ?? null,
  };
}

function keepLast(prev: Now | null, status: Now['status'], error?: string): Now {
  return {
    status,
    error,
    track: prev?.track ?? null,
    is_playing: false,
    progress_ms: prev?.progress_ms ?? 0,
    fetched_at: Date.now(),
    device: null,
    is_last_played: !!prev?.track,
  };
}

async function fetchFresh(prev: Now | null): Promise<Now> {
  let token: string | null;
  try {
    token = await accessToken();
  } catch (e) {
    return keepLast(prev, 'error', e instanceof Error ? e.message : 'Spotify error');
  }
  if (!token) {
    return { status: 'not_connected', track: null, is_playing: false, progress_ms: 0, fetched_at: Date.now(), device: null, is_last_played: false };
  }

  const res = await fetch(PLAYER_URL, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });

  if (res.status === 204) return keepLast(prev, 'idle');
  if (res.status === 429 && prev) {
    // Rate limited: carry the last known state forward instead of flashing an error.
    const moved = prev.is_playing ? Date.now() - prev.fetched_at : 0;
    return { ...prev, progress_ms: prev.progress_ms + moved, fetched_at: Date.now() };
  }
  if (!res.ok) return keepLast(prev, 'error', `Spotify returned ${res.status}`);

  const j = await res.json();
  if (j.currently_playing_type === 'ad') return keepLast(prev, 'ad');
  const track = toTrack(j.item);
  if (!track) return keepLast(prev, 'idle');

  return {
    status: j.is_playing ? 'playing' : 'paused',
    track,
    is_playing: !!j.is_playing,
    progress_ms: j.progress_ms || 0,
    fetched_at: Date.now(),
    device: j.device?.name ?? null,
    is_last_played: false,
  };
}

export async function getNow(): Promise<Now> {
  const cached = await getState<Now>('now');
  if (cached && Date.now() - cached.fetched_at < CACHE_MS) return cached;

  let now = await fetchFresh(cached);

  if (!now.track && now.status !== 'not_connected') {
    const last = await lastSeenSong();
    if (last) now = { ...now, track: last, is_last_played: true, progress_ms: 0 };
  }

  if (now.track && !now.is_last_played && (cached?.track?.id !== now.track.id || cached?.is_last_played)) {
    await upsertSong(now.track);
  }

  await setState('now', now);
  return now;
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Comment, Likes, ListItem, Track, Who } from './types';

let client: SupabaseClient | null = null;

export function db() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

/* ---------- small key/value store (Spotify tokens, now-playing cache) ---------- */

export async function getState<T>(key: string): Promise<T | null> {
  const { data, error } = await db().from('app_state').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return (data?.value as T) ?? null;
}

export async function setState(key: string, value: unknown) {
  const { error } = await db()
    .from('app_state')
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function clearState(key: string) {
  const { error } = await db().from('app_state').delete().eq('key', key);
  if (error) throw error;
}

/* ---------- songs ---------- */

type SongRow = {
  track_id: string;
  title: string;
  artist: string;
  album: string | null;
  art_url: string | null;
  duration_ms: number | null;
  spotify_url: string | null;
};

export function rowToTrack(r: SongRow): Track {
  return {
    id: r.track_id,
    title: r.title,
    artist: r.artist,
    album: r.album,
    art_url: r.art_url,
    duration_ms: r.duration_ms ?? 0,
    spotify_url: r.spotify_url,
  };
}

export async function upsertSong(t: Track) {
  const { error } = await db()
    .from('songs')
    .upsert(
      {
        track_id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        art_url: t.art_url,
        duration_ms: t.duration_ms,
        spotify_url: t.spotify_url,
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'track_id' },
    );
  if (error) throw error;
}

export async function lastSeenSong(): Promise<Track | null> {
  const { data, error } = await db()
    .from('songs')
    .select('*')
    .order('last_seen', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToTrack(data as SongRow) : null;
}

export async function getSong(id: string): Promise<Track | null> {
  const { data, error } = await db().from('songs').select('*').eq('track_id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToTrack(data as SongRow) : null;
}

/* ---------- likes ---------- */

export async function likesFor(id: string): Promise<Likes> {
  const { data, error } = await db().from('likes').select('who').eq('track_id', id);
  if (error) throw error;
  const who = new Set((data ?? []).map((r) => r.who as Who));
  return { om: who.has('om'), gisele: who.has('gisele') };
}

export async function setLike(id: string, who: Who, liked: boolean) {
  const q = liked
    ? db().from('likes').upsert({ track_id: id, who }, { onConflict: 'track_id,who' })
    : db().from('likes').delete().eq('track_id', id).eq('who', who);
  const { error } = await q;
  if (error) throw error;
}

export async function likeLists(): Promise<Record<Who | 'both', ListItem[]>> {
  const { data, error } = await db()
    .from('likes')
    .select('who, created_at, songs(*)')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;

  const om: ListItem[] = [];
  const gisele: ListItem[] = [];
  const byTrack = new Map<string, { track: Track; om?: string; gisele?: string }>();

  for (const r of (data ?? []) as unknown as { who: Who; created_at: string; songs: SongRow | SongRow[] | null }[]) {
    const row = Array.isArray(r.songs) ? r.songs[0] : r.songs;
    if (!row) continue;
    const track = rowToTrack(row);
    const entry = byTrack.get(track.id) ?? { track };
    entry[r.who] = r.created_at;
    byTrack.set(track.id, entry);
    (r.who === 'om' ? om : gisele).push({ track, liked_at: r.created_at });
  }

  const both = [...byTrack.values()]
    .filter((e) => e.om && e.gisele)
    .map((e) => ({ track: e.track, liked_at: e.om! > e.gisele! ? e.om! : e.gisele! }))
    .sort((a, b) => (a.liked_at < b.liked_at ? 1 : -1));

  return { om, gisele, both };
}

/* ---------- comments ---------- */

export async function commentsFor(id: string): Promise<Comment[]> {
  const { data, error } = await db()
    .from('comments')
    .select('*')
    .eq('track_id', id)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as Comment[];
}

export async function addComment(id: string, who: Who, body: string, at_ms: number | null) {
  const { data, error } = await db()
    .from('comments')
    .insert({ track_id: id, who, body, at_ms })
    .select('*')
    .single();
  if (error) throw error;
  return data as Comment;
}

export async function deleteComment(commentId: number, who: Who) {
  const { error } = await db().from('comments').delete().eq('id', commentId).eq('who', who);
  if (error) throw error;
}

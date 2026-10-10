export type Who = 'om' | 'gisele';

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  art_url: string | null;
  duration_ms: number;
  spotify_url: string | null;
};

export type NowStatus = 'playing' | 'paused' | 'idle' | 'ad' | 'not_connected' | 'error';

export type Now = {
  status: NowStatus;
  track: Track | null;
  is_playing: boolean;
  progress_ms: number;
  fetched_at: number;
  device: string | null;
  /** true when nothing is playing and we're showing the most recent song instead */
  is_last_played: boolean;
  error?: string;
};

export type Comment = {
  id: number;
  track_id: string;
  who: Who;
  body: string;
  at_ms: number | null;
  created_at: string;
};

export type Likes = Record<Who, boolean>;

export type ListItem = { track: Track; liked_at: string };

-- Jam Notes database. Paste this whole file into Supabase > SQL Editor and click Run.
-- Safe to run more than once.

create table if not exists songs (
  track_id     text primary key,
  title        text not null,
  artist       text not null,
  album        text,
  art_url      text,
  duration_ms  integer,
  spotify_url  text,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);

create table if not exists likes (
  track_id   text not null references songs(track_id) on delete cascade,
  who        text not null check (who in ('om', 'gisele')),
  created_at timestamptz not null default now(),
  primary key (track_id, who)
);

create table if not exists comments (
  id         bigint generated always as identity primary key,
  track_id   text not null references songs(track_id) on delete cascade,
  who        text not null check (who in ('om', 'gisele')),
  body       text not null check (char_length(body) between 1 and 500),
  at_ms      integer,
  created_at timestamptz not null default now()
);

create index if not exists comments_track_idx on comments (track_id, created_at);
create index if not exists songs_last_seen_idx on songs (last_seen desc);

-- Holds the Spotify connection and the now-playing cache.
create table if not exists app_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Lock everything down. The app only talks to the database from the server
-- using the secret key, which bypasses these. The public key can read nothing.
alter table songs     enable row level security;
alter table likes     enable row level security;
alter table comments  enable row level security;
alter table app_state enable row level security;

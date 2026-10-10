'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Deck from './Deck';
import type { Comment, Likes, ListItem, Now, Track, Who } from '@/lib/types';

type StateResp = {
  me: Who;
  names: Record<Who, string>;
  now: Now;
  likes: Likes;
  comments: Comment[];
  server_time: number;
};
type Tab = 'now' | 'om' | 'gisele' | 'both';
type Lists = Record<Who | 'both', ListItem[]>;

const POLL_MS = 4000;
const LIVE_WINDOW_MS = 7000;

/* ---------- helpers ---------- */

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const ago = (t: string | number) => {
  const d = (Date.now() - new Date(t).getTime()) / 1000;
  if (d < 45) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
};

async function api<T>(path: string, key: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: { 'x-jam-key': key, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j as T;
}

function useKey() {
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [justConnected, setJustConnected] = useState(false);
  useEffect(() => {
    const u = new URL(window.location.href);
    let k = u.searchParams.get('k');
    try {
      if (k) localStorage.setItem('jamKey', k);
      else k = localStorage.getItem('jamKey');
    } catch {
      /* storage blocked: the link still works */
    }
    if (u.searchParams.get('connected')) {
      setJustConnected(true);
      u.searchParams.delete('connected');
    }
    if (k && !u.searchParams.get('k')) u.searchParams.set('k', k);
    window.history.replaceState(null, '', u.toString());
    setKey(k);
  }, []);
  return { key, justConnected };
}

/* ---------- small pieces ---------- */

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.6-9.4-9.3C1.3 7.9 3.4 4.5 6.9 4.5c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.5 0 5.6 3.4 4.3 6.7-1.9 4.7-9.4 9.3-9.4 9.3z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LikeRow({
  likes,
  me,
  names,
  onToggle,
}: {
  likes: Likes;
  me: Who;
  names: Record<Who, string>;
  onToggle: () => void;
}) {
  const other: Who = me === 'om' ? 'gisele' : 'om';
  const mine = likes[me];
  const theirs = likes[other];
  return (
    <div className="likeRow">
      <button
        className={`heart ${mine ? 'on' : ''}`}
        onClick={onToggle}
        aria-pressed={mine}
        aria-label={mine ? 'Unlike' : 'Like'}
      >
        <span key={String(mine)} className="heartPop">
          <Heart filled={mine} />
        </span>
        {mine && (
          <span className="burst" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} style={{ ['--a' as string]: `${i * 60}deg` }} />
            ))}
          </span>
        )}
      </button>
      <div className="likeText">
        {mine && theirs ? (
          <span className="both">you both love this one</span>
        ) : theirs ? (
          <span>
            <b className={other}>{names[other]}</b> likes this
          </span>
        ) : mine ? (
          <span>saved to your likes</span>
        ) : (
          <span className="muted">tap the heart to keep it</span>
        )}
      </div>
    </div>
  );
}

function Notes({
  comments,
  me,
  names,
  activeIds,
  onDelete,
}: {
  comments: Comment[];
  me: Who;
  names: Record<Who, string>;
  activeIds?: Set<number>;
  onDelete: (id: number) => void;
}) {
  if (!comments.length) return <p className="empty">No notes yet. Say something about this one.</p>;
  return (
    <ul className="notes">
      {comments.map((c) => (
        <li key={c.id} className={`note ${c.who} ${activeIds?.has(c.id) ? 'live' : ''}`}>
          <div className="noteHead">
            <b className={c.who}>{c.who === me ? 'you' : names[c.who]}</b>
            {c.at_ms != null && <span className="stamp">{fmt(c.at_ms)}</span>}
            <span className="muted small">{ago(c.created_at)}</span>
            {c.who === me && c.id > 0 && (
              <button className="del" onClick={() => onDelete(c.id)} aria-label="Delete note">
                ×
              </button>
            )}
          </div>
          <p>{c.body}</p>
        </li>
      ))}
    </ul>
  );
}

function Composer({
  track,
  progress,
  live,
  onSend,
}: {
  track: Track;
  progress: number | null;
  live: boolean;
  onSend: (trackId: string, body: string, at: number | null) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [stamp, setStamp] = useState(true);
  // Pin the song (and moment) when you start typing, so a song change mid-thought doesn't misfile it.
  const [pin, setPin] = useState<{ track: Track; at: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const change = (v: string) => {
    if (!pin && v.trim()) setPin({ track, at: live ? progress : null });
    if (!v) setPin(null);
    setText(v);
  };

  const target = pin?.track ?? track;
  const at = live && stamp ? (pin?.at ?? progress) : null;
  const moved = pin && pin.track.id !== track.id;

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onSend(target.id, body, at == null ? null : Math.round(at));
      setText('');
      setPin(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'could not send');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="composer">
      {moved && (
        <div className="retarget">
          note is for <b>{pin!.track.title}</b>
          <button onClick={() => setPin({ track, at: live ? progress : null })}>use current song</button>
        </div>
      )}
      <div className="composeRow">
        {live && (
          <button
            className={`stampChip ${stamp ? 'on' : ''}`}
            onClick={() => setStamp((s) => !s)}
            title={stamp ? 'Timestamp on (tap to turn off)' : 'Timestamp off (tap to turn on)'}
          >
            {stamp ? fmt(at ?? 0) : 'no time'}
          </button>
        )}
        <input
          value={text}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={live ? 'this part goes hard...' : 'leave a note...'}
          maxLength={500}
          aria-label="Write a note"
        />
        <button className="send" onClick={send} disabled={!text.trim() || busy} aria-label="Send">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M4 12l15-7-5 15-2.5-6.5z" fill="currentColor" />
          </svg>
        </button>
      </div>
      {live && stamp && pin && (
        <button className="restamp" onClick={() => setPin({ track: target, at: progress })}>
          restamp to now
        </button>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}

function SongList({ items, onOpen, empty }: { items: ListItem[]; onOpen: (t: Track) => void; empty: string }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <ul className="songList">
      {items.map(({ track, liked_at }, i) => (
        <li key={track.id} style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
          <button onClick={() => onOpen(track)}>
            {track.art_url ? <img src={track.art_url} alt="" /> : <span className="artBlank" />}
            <span className="songMeta">
              <span className="songTitle">{track.title}</span>
              <span className="muted small">{track.artist}</span>
            </span>
            <span className="muted small">{ago(liked_at)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------- detail sheet for a song from a likes list ---------- */

function SongSheet({
  trackId,
  apiKey,
  me,
  names,
  onClose,
  onChanged,
}: {
  trackId: string;
  apiKey: string;
  me: Who;
  names: Record<Who, string>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<{ track: Track; likes: Likes; comments: Comment[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ track: Track; likes: Likes; comments: Comment[] }>(`/api/song?id=${encodeURIComponent(trackId)}`, apiKey)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [trackId, apiKey]);

  useEffect(load, [load]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const toggle = async () => {
    if (!data) return;
    const liked = !data.likes[me];
    setData({ ...data, likes: { ...data.likes, [me]: liked } });
    try {
      await api('/api/like', apiKey, { method: 'POST', body: JSON.stringify({ track_id: trackId, liked }) });
      onChanged();
    } catch {
      load();
    }
  };

  const send = async (id: string, body: string) => {
    const { comment } = await api<{ comment: Comment }>('/api/comment', apiKey, {
      method: 'POST',
      body: JSON.stringify({ track_id: id, body, at_ms: null }),
    });
    setData((d) => (d ? { ...d, comments: [...d.comments, comment] } : d));
  };

  const del = async (id: number) => {
    setData((d) => (d ? { ...d, comments: d.comments.filter((c) => c.id !== id) } : d));
    await api(`/api/comment?id=${id}`, apiKey, { method: 'DELETE' }).catch(load);
  };

  return (
    <div className="sheetBack" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {err && <p className="err">{err}</p>}
        {!data ? (
          !err && <p className="muted">loading...</p>
        ) : (
          <>
            <div className="sheetHead">
              {data.track.art_url ? <img src={data.track.art_url} alt="" /> : <span className="artBlank big" />}
              <div>
                <h2 className="title">{data.track.title}</h2>
                <p className="muted">{data.track.artist}</p>
                {data.track.spotify_url && (
                  <a className="spotLink" href={data.track.spotify_url} target="_blank" rel="noreferrer">
                    open in Spotify
                  </a>
                )}
              </div>
            </div>
            <LikeRow likes={data.likes} me={me} names={names} onToggle={toggle} />
            <Notes comments={data.comments} me={me} names={names} onDelete={del} />
            <Composer track={data.track} progress={null} live={false} onSend={send} />
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- main app ---------- */

export default function JamApp() {
  const { key, justConnected } = useKey();
  const [s, setS] = useState<StateResp | null>(null);
  const [locked, setLocked] = useState(false);
  const [netErr, setNetErr] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState<Tab>('now');
  const [lists, setLists] = useState<Lists | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const likeHold = useRef(0);
  const pollRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (justConnected) {
      setToast('Spotify connected');
      const t = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(t);
    }
  }, [justConnected]);

  /* polling, paused while the tab is hidden */
  useEffect(() => {
    if (!key) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      try {
        const next = await api<StateResp>('/api/state', key);
        if (!alive) return;
        setOffset(next.server_time - Date.now());
        setS((prev) =>
          prev && Date.now() < likeHold.current && prev.now.track?.id === next.now.track?.id
            ? { ...next, likes: prev.likes }
            : next,
        );
        setNetErr(null);
      } catch (e) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : 'offline';
        if (msg === 'unauthorized') setLocked(true);
        else setNetErr(msg);
      }
    };
    pollRef.current = poll;

    const start = () => {
      poll();
      clearInterval(timer);
      timer = setInterval(poll, POLL_MS);
    };
    const stop = () => clearInterval(timer);
    const onVis = () => (document.hidden ? stop() : start());

    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [key]);

  /* smooth progress between polls */
  const playing = !!s?.now.is_playing;
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [playing]);

  const now = s?.now;
  const track = now?.track ?? null;
  const duration = track?.duration_ms || 0;
  const progress = now
    ? Math.min(duration || Infinity, now.progress_ms + (now.is_playing ? Date.now() + offset - now.fetched_at : 0))
    : 0;

  /* tab title shows the song */
  useEffect(() => {
    if (!track) {
      document.title = 'Jam Notes';
      return;
    }
    const mark = playing ? '♪' : now?.is_last_played ? '◦' : '❚❚';
    document.title = `${mark} ${track.title} · ${track.artist}`;
  }, [track?.id, track?.title, track?.artist, playing, now?.is_last_played]); // eslint-disable-line react-hooks/exhaustive-deps

  /* likes lists */
  const loadLists = useCallback(() => {
    if (!key) return;
    api<Lists>('/api/likes', key)
      .then(setLists)
      .catch(() => {});
  }, [key]);
  useEffect(() => {
    if (tab !== 'now') loadLists();
  }, [tab, loadLists]);

  const liveIds = useMemo(() => {
    const ids = new Set<number>();
    if (!s || !now?.is_playing) return ids;
    for (const c of s.comments) {
      if (c.at_ms != null && progress >= c.at_ms && progress - c.at_ms < LIVE_WINDOW_MS) ids.add(c.id);
    }
    return ids;
  }, [s, now?.is_playing, progress]);

  if (key === undefined) return <div className="boot" />;

  if (!key || locked) {
    return (
      <main className="locked">
        <div className="lockDisc" />
        <h1 className="title">Jam Notes</h1>
        <p className="muted">This room is private. Open it with your personal link.</p>
      </main>
    );
  }

  if (!s) {
    return (
      <main className="app">
        <div className="loading">
          <div className="lockDisc spin" />
          <p className="muted">{netErr ? `can't reach the room (${netErr})` : 'dropping the needle...'}</p>
        </div>
      </main>
    );
  }

  const { me, names } = s;
  const other: Who = me === 'om' ? 'gisele' : 'om';

  const toggleLike = async () => {
    if (!track || now?.status === 'not_connected') return;
    const liked = !s.likes[me];
    likeHold.current = Date.now() + 3000;
    setS({ ...s, likes: { ...s.likes, [me]: liked } });
    try {
      const r = await api<{ likes: Likes }>('/api/like', key, {
        method: 'POST',
        body: JSON.stringify({ track_id: track.id, liked }),
      });
      setS((p) => (p && p.now.track?.id === track.id ? { ...p, likes: r.likes } : p));
    } catch {
      likeHold.current = 0;
      pollRef.current();
    }
  };

  const sendNote = async (trackId: string, body: string, at: number | null) => {
    const { comment } = await api<{ comment: Comment }>('/api/comment', key, {
      method: 'POST',
      body: JSON.stringify({ track_id: trackId, body, at_ms: at }),
    });
    setS((p) => (p && p.now.track?.id === trackId ? { ...p, comments: [...p.comments, comment] } : p));
  };

  const deleteNote = async (id: number) => {
    setS((p) => (p ? { ...p, comments: p.comments.filter((c) => c.id !== id) } : p));
    await api(`/api/comment?id=${id}`, key, { method: 'DELETE' }).catch(() => pollRef.current());
  };

  const statusLine = (() => {
    if (!now) return '';
    switch (now.status) {
      case 'playing':
        return now.device ? `playing on ${now.device}` : 'playing';
      case 'paused':
        return 'paused';
      case 'ad':
        return 'ad break, hang tight';
      case 'error':
        return me === 'om' && now.error ? now.error : 'Spotify hiccup, retrying';
      case 'idle':
        return 'last played';
      default:
        return '';
    }
  })();

  const tabs: { id: Tab; label: string }[] = [
    { id: 'now', label: 'Now' },
    { id: me, label: 'Mine' },
    { id: other, label: names[other] },
    { id: 'both', label: 'Both' },
  ];

  return (
    <>
      {track?.art_url && <div key={track.id} className="ambient" style={{ backgroundImage: `url(${track.art_url})` }} />}
      <div className="grain" />

      <main className="app">
        <header className="top">
          <span className="brand">jam notes</span>
          <span className={`pulse ${playing ? 'on' : ''}`}>{playing ? 'live' : 'quiet'}</span>
        </header>

        <nav className="tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id !== 'now' && <span className="tabHeart">♥</span>}
            </button>
          ))}
        </nav>

        {tab === 'now' ? (
          now?.status === 'not_connected' ? (
            <section className="card center">
              <div className="lockDisc" />
              {me === 'om' ? (
                <>
                  <p>Connect your Spotify to start the room.</p>
                  <a className="btn" href={`/connect?k=${encodeURIComponent(key)}`}>
                    Connect Spotify
                  </a>
                </>
              ) : (
                <p className="muted">Waiting for {names.om} to start the music.</p>
              )}
            </section>
          ) : !track ? (
            <section className="card center">
              <div className="lockDisc" />
              <p className="muted">Nothing has played yet. Start a song on Spotify.</p>
            </section>
          ) : (
            <section className="nowView">
              <Deck
                track={track}
                playing={playing}
                armOn={!now?.is_last_played}
                progressFrac={duration ? progress / duration : 0}
                live={s.comments.filter((c) => liveIds.has(c.id))}
                names={names}
              />

              <div key={track.id} className="songInfo">
                <h1 className="title">{track.title}</h1>
                <p className="artist">{track.artist}</p>
                <p className={`status ${now?.status}`}>{statusLine}</p>
              </div>

              {!now?.is_last_played && duration > 0 && (
                <div className="progress">
                  <span>{fmt(progress)}</span>
                  <div className="bar">
                    <div className="fill" style={{ width: `${Math.min(100, (progress / duration) * 100)}%` }} />
                    {s.comments
                      .filter((c) => c.at_ms != null)
                      .map((c) => (
                        <i
                          key={c.id}
                          className={`tick ${c.who}`}
                          style={{ left: `${Math.min(100, ((c.at_ms ?? 0) / duration) * 100)}%` }}
                          title={`${names[c.who]} at ${fmt(c.at_ms ?? 0)}`}
                        />
                      ))}
                  </div>
                  <span>{fmt(duration)}</span>
                </div>
              )}

              <LikeRow likes={s.likes} me={me} names={names} onToggle={toggleLike} />

              <Notes comments={s.comments} me={me} names={names} activeIds={liveIds} onDelete={deleteNote} />

              <Composer
                track={track}
                progress={now?.is_last_played ? null : progress}
                live={!now?.is_last_played}
                onSend={sendNote}
              />
            </section>
          )
        ) : (
          <section className="listView">
            {!lists ? (
              <p className="muted">loading...</p>
            ) : tab === 'both' ? (
              <>
                <h2 className="listTitle">Songs you both love</h2>
                <SongList items={lists.both} onOpen={(t) => setOpen(t.id)} empty="No overlap yet. It'll fill up." />
              </>
            ) : (
              <>
                <h2 className="listTitle">{tab === me ? 'Songs you like' : `Songs ${names[tab as Who]} likes`}</h2>
                <SongList
                  items={lists[tab as Who]}
                  onOpen={(t) => setOpen(t.id)}
                  empty={tab === me ? 'Heart a song and it lands here.' : `Nothing from ${names[tab as Who]} yet.`}
                />
              </>
            )}
          </section>
        )}

        {netErr && <p className="offline">reconnecting...</p>}
      </main>

      {open && (
        <SongSheet
          trackId={open}
          apiKey={key}
          me={me}
          names={names}
          onClose={() => setOpen(null)}
          onChanged={() => {
            loadLists();
            pollRef.current();
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

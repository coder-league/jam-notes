'use client';

import type { Comment, Track, Who } from '@/lib/types';

/** Deterministic pseudo-random so bars don't reshuffle on every render. */
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const BARS = Array.from({ length: 30 }, (_, i) => ({
  dur: 0.55 + rand(i, 1) * 0.9,
  delay: -rand(i, 2) * 1.2,
  peak: 0.35 + rand(i, 3) * 0.65,
}));

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function Deck({
  track,
  playing,
  armOn,
  progressFrac,
  live,
  names,
}: {
  track: Track | null;
  playing: boolean;
  /** stylus on the record (playing or paused mid-song) */
  armOn: boolean;
  progressFrac: number;
  live: Comment[];
  names: Record<Who, string>;
}) {
  // Tonearm: -14deg rests off the record, 0deg is the outer groove, 24deg the inner groove.
  const armAngle = armOn ? Math.min(24, Math.max(0, progressFrac * 24)) : -14;
  const state = playing ? 'running' : 'paused';

  return (
    <div className="deckWrap">
      <div className="bubbles" aria-live="polite">
        {live.map((c) => (
          <div key={c.id} className={`bubble ${c.who}`}>
            <span className="bubbleWho">{names[c.who]}</span>
            <span className="bubbleAt">{fmt(c.at_ms ?? 0)}</span>
            <p>{c.body}</p>
          </div>
        ))}
      </div>

      <div className="plinth">
        <div className="platter">
          <div key={track?.id ?? 'none'} className="vinyl" style={{ animationPlayState: `${state}, running` }}>
            <div className="label">
              {track?.art_url ? <img src={track.art_url} alt="" /> : <div className="labelBlank" />}
            </div>
            <div className="spindle" />
          </div>
          <div className="sheen" />
        </div>

        <svg className="arm" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="88" cy="12" r="7.5" className="armBase" />
          <g
            className="armSwing"
            style={{ transform: `rotate(${armAngle}deg)`, transformOrigin: '88px 12px', transformBox: 'view-box' }}
          >
            <rect x="85.6" y="1.5" width="4.8" height="6" rx="1.2" className="armWeight" />
            <line x1="88" y1="9" x2="88" y2="55" className="armTube" />
            <rect x="85.9" y="54" width="4.2" height="9" rx="1" className="armHead" />
          </g>
          <circle cx="88" cy="12" r="3" className="armPivot" />
        </svg>

        <div className={`led ${playing ? 'on' : ''}`} />
      </div>

      <div className="eq" aria-hidden="true">
        {BARS.map((b, i) => (
          <span
            key={i}
            style={{
              animationDuration: `${b.dur}s`,
              animationDelay: `${b.delay}s`,
              animationPlayState: state,
              ['--peak' as string]: b.peak,
            }}
          />
        ))}
      </div>
    </div>
  );
}

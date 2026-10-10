import { handle, json, names } from '@/lib/auth';
import { commentsFor, likesFor } from '@/lib/db';
import { getNow } from '@/lib/spotify';
import type { Comment, Likes } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** One call per poll: what's playing, plus likes and notes for it. */
export const GET = handle(async (_req, me) => {
  const now = await getNow();
  let likes: Likes = { om: false, gisele: false };
  let comments: Comment[] = [];
  if (now.track) {
    [likes, comments] = await Promise.all([likesFor(now.track.id), commentsFor(now.track.id)]);
  }
  // Only Om sees technical error details.
  const safeNow = me === 'om' ? now : { ...now, error: now.error ? 'Spotify hiccup' : undefined };
  return json({ me, names: names(), now: safeNow, likes, comments, server_time: Date.now() });
});

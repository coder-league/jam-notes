import { handle, json } from '@/lib/auth';
import { getSong, likesFor, setLike } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = handle(async (req, me) => {
  const { track_id, liked } = (await req.json().catch(() => ({}))) as { track_id?: string; liked?: boolean };
  if (!track_id || typeof liked !== 'boolean') return json({ error: 'bad request' }, 400);
  if (!(await getSong(track_id))) return json({ error: 'unknown song' }, 404);
  await setLike(track_id, me, liked);
  return json({ likes: await likesFor(track_id) });
});

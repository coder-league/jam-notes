import { handle, json } from '@/lib/auth';
import { commentsFor, getSong, likesFor } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async (req) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'bad request' }, 400);
  const track = await getSong(id);
  if (!track) return json({ error: 'unknown song' }, 404);
  const [likes, comments] = await Promise.all([likesFor(id), commentsFor(id)]);
  return json({ track, likes, comments });
});

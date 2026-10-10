import { handle, json } from '@/lib/auth';
import { addComment, deleteComment, getSong } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = handle(async (req, me) => {
  const { track_id, body, at_ms } = (await req.json().catch(() => ({}))) as {
    track_id?: string;
    body?: string;
    at_ms?: number | null;
  };
  const text = (body ?? '').trim();
  if (!track_id || !text) return json({ error: 'bad request' }, 400);
  if (text.length > 500) return json({ error: 'too long (500 max)' }, 400);
  const at = typeof at_ms === 'number' && Number.isFinite(at_ms) && at_ms >= 0 ? Math.round(at_ms) : null;
  if (!(await getSong(track_id))) return json({ error: 'unknown song' }, 404);
  const comment = await addComment(track_id, me, text, at);
  return json({ comment });
});

export const DELETE = handle(async (req, me) => {
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return json({ error: 'bad request' }, 400);
  await deleteComment(id, me); // only deletes your own
  return json({ ok: true });
});

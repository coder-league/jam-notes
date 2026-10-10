import { handle, json } from '@/lib/auth';
import { rawPlayer } from '@/lib/spotify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Spike test (Om only): open /api/raw?k=YOUR_KEY while in a Jam.
 * If body.item.name matches the song the Jam is playing, the app will work.
 */
export const GET = handle(
  async () => {
    const raw = await rawPlayer();
    const body = (raw as { body?: { item?: { name?: string }; device?: { name?: string }; is_playing?: boolean } }).body;
    const summary = !raw.connected
      ? 'Spotify not connected yet. Open /connect?k=YOUR_KEY first.'
      : !body
        ? 'Nothing playing on your account right now (HTTP 204).'
        : `Spotify says you're ${body.is_playing ? 'playing' : 'paused on'} "${body.item?.name ?? 'unknown'}" on ${body.device?.name ?? 'an unknown device'}. Does that match the Jam?`;
    return json({ summary, ...raw });
  },
  { omOnly: true },
);

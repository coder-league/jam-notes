import { timingSafeEqual } from 'node:crypto';
import type { Who } from './types';

export function names(): Record<Who, string> {
  return {
    om: process.env.NAME_OM || 'Om',
    gisele: process.env.NAME_GISELE || 'Gisele',
  };
}

function same(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

export function whoFromKey(k: string | null | undefined): Who | null {
  if (!k) return null;
  const om = process.env.KEY_OM;
  const gi = process.env.KEY_GISELE;
  if (om && same(k, om)) return 'om';
  if (gi && same(k, gi)) return 'gisele';
  return null;
}

export function whoFromRequest(req: Request): Who | null {
  const header = req.headers.get('x-jam-key');
  const query = new URL(req.url).searchParams.get('k');
  return whoFromKey(header || query);
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Wraps a route: checks the personal key, catches errors. */
export function handle(
  fn: (req: Request, who: Who) => Promise<Response>,
  opts: { omOnly?: boolean } = {},
) {
  return async (req: Request) => {
    const who = whoFromRequest(req);
    if (!who || (opts.omOnly && who !== 'om')) return json({ error: 'unauthorized' }, 401);
    try {
      return await fn(req, who);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'server error';
      return json({ error: msg }, 500);
    }
  };
}

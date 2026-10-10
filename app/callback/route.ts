import { exchangeCode, redirectUri } from '@/lib/spotify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function page(msg: string, status = 400) {
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;background:#0d0b0a;color:#f4ebe1;padding:40px;line-height:1.5"><h2>Jam Notes</h2><p>${msg}</p><p><a style="color:#f0a64b" href="/">Back</a></p></body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  const err = u.searchParams.get('error');
  const cookie = req.headers.get('cookie') ?? '';
  const saved = cookie.match(/(?:^|;\s*)jam_oauth=([^;]+)/)?.[1];

  if (err) return page(`Spotify didn't connect: ${err.replace(/[<>&"]/g, '')}`);
  if (!code || !state || !saved || saved !== state) {
    return page('That login link expired. Open your /connect link again.');
  }

  try {
    await exchangeCode(code, redirectUri(req));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    return page(`Couldn't finish connecting: ${msg.replace(/[<>&"]/g, '')}`, 500);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/?connected=1',
      'Set-Cookie': 'jam_oauth=; Path=/; Max-Age=0',
    },
  });
}

import { whoFromRequest } from '@/lib/auth';
import { SCOPES, redirectUri } from '@/lib/spotify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Om opens /connect?k=KEY_OM once to link his Spotify. */
export async function GET(req: Request) {
  if (whoFromRequest(req) !== 'om') {
    return new Response('Only the owner can connect Spotify.', { status: 401 });
  }
  const state = crypto.randomUUID();
  const url = new URL('https://accounts.spotify.com/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID ?? '',
    scope: SCOPES,
    redirect_uri: redirectUri(req),
    state,
    show_dialog: 'true',
  }).toString();
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      'Set-Cookie': `jam_oauth=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
    },
  });
}

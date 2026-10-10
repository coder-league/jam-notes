# Jam Notes setup

Total time: about 20 minutes. Do the steps in order.

## 1. Database (Supabase)

1. Supabase > your project > **SQL Editor** > **New query**.
2. Paste everything in `db/schema.sql`, click **Run**. You should see "Success".

## 2. Make your two personal links' keys

On your computer, in this folder: `npm install` then `npm run keys`.
(No Node? Any long random string works, e.g. mash 25 letters and numbers. Make two different ones.)

- `KEY_OM` is your key. It can connect Spotify and run the spike test.
- `KEY_GISELE` is hers.

## 3. Deploy on Vercel

1. Push this folder to `coder-league/jam-notes` on GitHub.
2. Vercel > Add New > Project > import `jam-notes`. Before clicking Deploy, open **Environment Variables** and add:

| Name | Value |
|---|---|
| `SPOTIFY_CLIENT_ID` | Spotify app > Settings |
| `SPOTIFY_CLIENT_SECRET` | Spotify app > Settings > View client secret |
| `SUPABASE_URL` | Supabase > Project Settings > Data API > Project URL |
| `SUPABASE_SECRET_KEY` | Supabase > API Keys > secret key (`sb_secret_...`) |
| `KEY_OM` | from step 2 |
| `KEY_GISELE` | from step 2 |
| `NAME_OM` | `Om` |
| `NAME_GISELE` | `Gisele` |

3. Click **Deploy**. Note your URL, e.g. `https://jam-notes-abc.vercel.app`.

## 4. Tell Spotify about your site

developer.spotify.com > your app > Settings > Edit > Redirect URIs > add
`https://YOUR-URL.vercel.app/callback` (exact, no trailing slash) > Save.

## 5. Connect your Spotify

Open `https://YOUR-URL.vercel.app/connect?k=YOUR_KEY_OM`, approve, and you land in the room.

## 6. Spike test (do this before sending her anything)

Start a Jam, then open `https://YOUR-URL.vercel.app/api/raw?k=YOUR_KEY_OM`.
The `summary` line says what Spotify thinks you're playing.

- Matches the Jam song: you're good.
- Wrong song / nothing: try again with you hosting the Jam on your device. If it still fails, the API can't see Jams for your setup.

## 7. Send her link

`https://YOUR-URL.vercel.app/?k=YOUR_KEY_GISELE`

She just opens it. It remembers her on that browser. Tell her not to share it, since anyone with it can post as her.

## Troubleshooting

- **"Spotify hiccup"** on her screen: open the app with your link to see the real error. "login expired" means open `/connect?k=...` again.
- **Spotify 403 on connect**: in your Spotify app, check User Management has your account email listed, and whether Spotify now requires Premium for dev-mode apps.
- **Database errors**: rerun `db/schema.sql`. If the new `sb_secret_` key is rejected, use the **Legacy** `service_role` key in `SUPABASE_SECRET_KEY` instead.
- **Lost her link / it leaked**: change `KEY_GISELE` in Vercel, redeploy, send the new link.

## Local testing (optional)

Copy `.env.example` to `.env.local`, fill it in, `npm run dev`, open
`http://127.0.0.1:3000/connect?k=YOUR_KEY_OM`. This uses the `http://127.0.0.1:3000/callback`
redirect URI you already added to Spotify.

## How it works

- Only your Spotify is connected. The server reads what you're playing, caches it for ~3.5s,
  and both pages poll every 4s (paused when the tab is hidden).
- All database access is server-side with the secret key. Row Level Security is on with no
  policies, so the public key can't read anything.
- Notes pin to the song and moment you started typing, so a song change mid-sentence doesn't misfile them.
- The equalizer bars are decorative. Spotify doesn't expose the audio itself to third-party apps.

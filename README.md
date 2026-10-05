# Festify

Pick a festival and get the official lineup poster rebuilt around **your** listening: the acts you play most
become the headliners, and anyone you've never played is left off.

## Ways in

- **Spotify login:** invite-only while the Spotify app is in development mode (5 users).
- **Last.fm username:** public scrobble history with real play counts, no login (`src/sources/lastfm.ts`).
- **Spotify data export:** the .zip from Spotify's "Download your data", read entirely in the browser
  (`src/sources/spotifyExport.ts`). Works with both "Account data" and "Extended streaming history".

Last.fm and data-upload users can pick a listening window (all time, last 12/6/3 months, last month). Uploads build
every window at once, counted back from the newest play in the file, so switching is instant.
- **Demo data:** made-up listening, for trying the posters.

## Extras

- **{Name}Fest:** a made-up festival headlined by your own top 36 artists, drawn entirely in code as a two-ink
  risograph print (`src/components/PersonalPoster.tsx`, `src/festivals/personal.ts`). The name comes from your first name.

- **Edit your poster:** hide acts, force acts to headline, or add acts from the lineup you love but don't stream.
  Saved per festival in the browser (`src/posterEdits.ts`).
- **You might like:** a toggle that adds lineup acts similar to your top artists, via Last.fm's similar-artists data,
  marked with * (`src/suggest.ts`).
- **Your biggest clashes:** for festivals with set times (Glastonbury), pairs of your acts where every set by one
  overlaps a set by the other by more than 5 minutes, ranked by the two acts' combined position in your running
  order (`src/clashes.ts`).
- **Spotify playlist:** Spotify logins can turn the poster into a private playlist, in billing order
  (`src/spotify/playlist.ts`).

## How the ranking works

Spotify's Web API doesn't expose play counts, so each artist gets a score built from two equally weighted signals,
both normalised against your whole library (see `src/curate.ts`). Last.fm and data exports feed the same ranked
lists, built from real play counts.

- **Listening:** position in your top artists (4 weeks / 6 months / ~1 year), your top tracks by them, and
  plays in your last 50 tracks.
- **Liked songs:** √(number of liked songs), so "wave" listeners still count.

Following an artist adds a small tie-break. Only artists with listening or liked songs appear. The top 4 acts become
headliners. The poster then automatically splits the rest between the second tier and the small print, and sizes
the text to fit.

## Setup

1. Create an app at <https://developer.spotify.com/dashboard> (Web API).
2. Add these redirect URIs:
   - `http://127.0.0.1:5173/` (local dev, since Spotify no longer accepts `localhost`)
   - `https://samkimish.github.io/festify/` (GitHub Pages)
   - later, `https://kimish.co.uk/` or wherever it ends up
3. In development mode, add each person who should be able to log in under **User Management**.
4. `cp .env.example .env.local` and set `VITE_SPOTIFY_CLIENT_ID` and `VITE_LASTFM_API_KEY`
   (<https://www.last.fm/api/account/create>; the key is public and read-only).
5. `npm install`, then `npm run dev`, and open <http://127.0.0.1:5173/>.

The "Try it with demo data" button works without any Spotify setup.

## Adding a festival

1. Make a blank version of the poster (artwork and logos, no names) and put it in
   `public/festivals/<id>/background.png`.
2. Copy `src/festivals/primavera-sound-2027.ts`, fill in the lineup, and adjust `zones` (percentages of the poster)
   so the text areas avoid the logo and partner strip.
3. Register it in `src/festivals/index.ts`.
4. Optional: `npm run resolve-ids -- src/festivals/<id>.ts` (or `<id>.lineup.json` for full lineups; needs
   `SPOTIFY_CLIENT_SECRET` in `.env.local`) finds Spotify IDs, so namesakes aren't mistaken for the act. Acts
   without an ID are matched by name, as is everything for Last.fm and data-export users.

## Multi-site festivals

Reading & Leeds share one menu entry with a Reading / Leeds toggle: each site is its own festival (`site.group`) with
its own artwork, bill and timetable. Timetables are plain text in `festival-sources/reading-leeds-2026/`, turned into
lineup data with `node scripts/parse-reading.mjs reading|leeds <txt> <json>`.

## Brand assets

`node scripts/make-brand-assets.mjs` regenerates the favicon, home-screen icon and social preview image (`public/og-image.jpg`).

## Deploying

- **GitHub Pages:** pushing to `main` runs `.github/workflows/deploy.yml`. Set the repo variables `SPOTIFY_CLIENT_ID` and `LASTFM_API_KEY`
  and set Pages → Source to "GitHub Actions".
- **Netlify:** build command `npm run build`, publish directory `dist`, env vars `VITE_SPOTIFY_CLIENT_ID` and `VITE_LASTFM_API_KEY`.

Unofficial fan project, not affiliated with any festival or Spotify. Poster artwork belongs to its owners.

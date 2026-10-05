# Festify

Log in with Spotify, pick a festival, and get the official lineup poster rebuilt around **your** listening:
the acts you play most become the headliners, and anyone you've never played is left off.

## How the ranking works

Spotify's Web API doesn't expose play counts, so each artist gets a score built from two equally weighted signals,
both normalised against your whole library (see `src/curate.ts`):

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
4. `cp .env.example .env.local` and set `VITE_SPOTIFY_CLIENT_ID`.
5. `npm install`, then `npm run dev`, and open <http://127.0.0.1:5173/>.

The "Try it with demo data" button works without any Spotify setup.

## Adding a festival

1. Make a blank version of the poster (artwork and logos, no names) and put it in
   `public/festivals/<id>/background.png`.
2. Copy `src/festivals/primavera-sound-2027.ts`, fill in the lineup, and adjust `zones` (percentages of the poster)
   so the text areas avoid the logo and partner strip.
3. Register it in `src/festivals/index.ts`.
4. Optional: `npm run resolve-ids -- src/festivals/<id>.ts` (needs `SPOTIFY_CLIENT_SECRET` in `.env.local`)
   finds Spotify IDs. Acts without an ID are matched by name.

## Brand assets

`node scripts/make-brand-assets.mjs` regenerates the favicon, home-screen icon and social preview image (`public/og-image.png`).

## Deploying

- **GitHub Pages:** pushing to `main` runs `.github/workflows/deploy.yml`. Set the repo variable `SPOTIFY_CLIENT_ID`
  and set Pages → Source to "GitHub Actions".
- **Netlify:** build command `npm run build`, publish directory `dist`, env var `VITE_SPOTIFY_CLIENT_ID`.

Unofficial fan project, not affiliated with any festival or Spotify. Poster artwork belongs to its owners.

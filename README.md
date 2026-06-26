# LiVa v4.1.0-RECONSTRUCTION

**Zero-latency zapping aggregator** deployed as a Cloudflare Worker (Edge Runtime).

URL: https://liva.simondalmasso44.workers.dev

## Stack

- Cloudflare Workers (Edge Runtime)
- Vanilla HTML/CSS/JS frontend (no React, no client framework)
- TailwindCSS (via CDN)
- hls.js for Pluto TV HLS playback

## Architecture

```
src/
├── index.js         # Worker entry: routing, /api/streams, /api/pluto, /api/health
├── twitch.js        # Twitch OAuth auto-refresher (Feature #4) + Helix streams
├── youtube.js       # YouTube search + embeddable filter (Feature #3)
├── pluto.js         # Pluto TV LATAM HLS channels (Feature #8)
├── aggregator.js    # Fisher-Yates shuffle, interleave 3:1, Shorta pseudo-live, geo injection
└── frontend.js      # Embedded HTML frontend (3-iframe pool, anti-bounce shield, Pluto hub)
```

## Mandatory Features

1. **Zero-latency zapping pool** — 3 persistent iframes per snap-item (prev/curr/next), mounted with `opacity-0 pointer-events-none` for inactive slots. TLS connection + buffer preserved across zaps.
2. **Touch shield anti-bounce** — Transparent `div.bounce-shield` (z-index 50) overlays each iframe. iframe uses `pointer-events: none` + `sandbox="allow-scripts allow-same-origin allow-presentation"`. YT params include `modestbranding=1&rel=0&showinfo=0&fs=0&disablekb=1&iv_load_policy=3`.
3. **YouTube embed bypass** — iframe starts with `mute=1&autoplay=1`. Worker pre-filters videos where `status.embeddable !== true`.
4. **Twitch OAuth auto-refresher** — On HTTP 401 from Helix, worker fetches a new app token from `id.twitch.tv/oauth2/token`, updates the global cache, and retries the request without surfacing the error to the frontend.
5. **Shorta pseudo-live simulator** — Pulls recent uploads from `@hacela.shorta` channel (ignores `eventType=live`). Embeds with `loop=1&playlist={videoId}&controls=0`. Badged as `SERIE 🎬`.
6. **Algorithmic feed shuffle + interleave** — Fisher-Yates (crypto.getRandomValues) on the server, executed once per cache window. Interleave pattern: 3 real streams → 1 Shorta chapter.
7. **Geo edge injection** — Uses `request.cf.regionCode` and `request.cf.city`. Viewers in Santa Fe province (`SF` / city contains `santa fe` or `rosario`) get local channels prepended at index 0-1.
8. **Pluto TV dedicated hub** — Isolated tab. Top 15 LATAM channels ranked by curated slug priority. Rendered with native HLS via hls.js (not iframes).

## Local development

```bash
npm install
echo 'YOUTUBE_API_KEY=...' > .dev.vars
echo 'TWITCH_CLIENT_ID=...' >> .dev.vars
echo 'TWITCH_CLIENT_SECRET=...' >> .dev.vars
npm run dev
```

## Deployment

Secrets are configured out-of-band (never committed):

```bash
wrangler secret put YOUTUBE_API_KEY
wrangler secret put TWITCH_CLIENT_ID
wrangler secret put TWITCH_CLIENT_SECRET
npm run deploy
```

## Strict constraints

- No `target="_blank"` redirects from iframes (enforced via sandbox attribute).
- Shuffle computed server-side once per cache window (60s), never on React re-render.

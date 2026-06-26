/**
 * Pluto TV integration (Feature #8).
 * Fetches the LATAM catalog and returns the top 15 HLS channels.
 * Falls back to a curated static channel list if the upstream API is rate-limited.
 */

const PLUTO_LATAM_URL = 'https://api.pluto.tv/v2/channels?start=2024-01-01T00:00:00.000Z&end=2030-01-01T00:00:00.000Z&includeInactive=false&country=AR';

// Curated allow-list of Pluto channels that are most relevant for LATAM viewers
const PREFERRED_SLUGS = [
  'pluto-tv-movies', 'pluto-tv-action', 'pluto-tv-drama', 'pluto-tv-comedy',
  'pluto-tv-scifi', 'pluto-tv-thriller', 'pluto-tv-classic-tv', 'pluto-tv-series',
  'pluto-tv-kids', 'pluto-tv-anime', 'pluto-tv-mtv', 'pluto-tv-mtv-pluto-tv',
  'pluto-tv-nick-pluto-tv', 'pluto-tv-news', 'pluto-tv-cbs-news',
  'pluto-tv-bloomberg-tv', 'pluto-tv-weather', 'pluto-tv-nature',
];

// Fallback: curated HLS endpoints (Pluto public stems)
// These are stable, geo-unlocked Pluto channels that work without the API.
const FALLBACK_CHANNELS = [
  { id: 'fb_pluto_movies', channel: 'Pluto TV Movies', title: 'Películas 24/7', category: 'Movies', hls_url: 'https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5a4a3b2c5e3c2e0001e7a6a7/master.m3u8' },
  { id: 'fb_pluto_action', channel: 'Pluto TV Action', title: 'Acción 24/7', category: 'Movies', hls_url: 'https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5e825c126b82630007c0f1d6/master.m3u8' },
  { id: 'fb_pluto_classic_tv', channel: 'Pluto TV Classic TV', title: 'Clásicos 24/7', category: 'Series', hls_url: 'https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5e145a2a8b8263000820bb98/master.m3u8' },
  { id: 'fb_pluto_news', channel: 'Pluto TV News', title: 'Noticias 24/7', category: 'News', hls_url: 'https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5261d36c5e3c2e0001e7a6a7/master.m3u8' },
  { id: 'fb_pluto_nature', channel: 'Pluto TV Nature', title: 'Naturaleza 24/7', category: 'Documentary', hls_url: 'https://service-stitcher.clusters.pluto.tv/v1/stitch/hls/channel/5e825c0c0e3c0300084a3c2c/master.m3u8' },
];

export async function fetchPlutoChannels(env) {
  try {
    const resp = await fetch(PLUTO_LATAM_URL, {
      headers: {
        'accept': 'application/json',
        'user-agent': 'LiVa/4.1 (Cloudflare Worker)',
      },
    });
    if (!resp.ok) {
      // 429 / 403 — fall back to curated list
      return FALLBACK_CHANNELS.map(c => ({
        source: 'pluto',
        ...c,
        is_live: true,
        fallback: true,
      }));
    }
    const all = await resp.json();

    // Score and rank: preferred slugs get higher priority
    const scored = (all || [])
      .filter(c => c.isStitched && c.live && c.timelines?.length > 0)
      .map(c => ({
        ...c,
        _score: PREFERRED_SLUGS.includes(c.slug) ? 100 : (c.viewership || 0),
      }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 15);

    if (scored.length === 0) {
      return FALLBACK_CHANNELS.map(c => ({
        source: 'pluto',
        ...c,
        is_live: true,
        fallback: true,
      }));
    }

    return scored.map(c => ({
      source: 'pluto',
      id: `pluto_${c.id}`,
      channel: c.name,
      title: c.timelines?.[0]?.title || c.name,
      category: c.category,
      logo: c.logos?.find(l => l.type === 'colorful')?.path || c.logo,
      hls_url: c.stitchedURL,
      is_live: true,
    }));
  } catch (e) {
    // Network / parse error — fall back
    return FALLBACK_CHANNELS.map(c => ({
      source: 'pluto',
      ...c,
      is_live: true,
      fallback: true,
    }));
  }
}

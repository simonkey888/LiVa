/**
 * LiVa v4.1.0-RECONSTRUCTION — Cloudflare Worker (Edge Runtime)
 * Author: Simón Dalmasso
 *
 * 8 mandatory features:
 *  1) Zero-latency zapping pool (3 iframes)         [frontend]
 *  2) Touch shield anti-bounce                       [frontend]
 *  3) YouTube embed restriction bypass (mute+autoplay, embeddable filter) [here + frontend]
 *  4) Twitch OAuth auto-refresher                    [here]
 *  5) Shorta pseudo-live simulator                   [here]
 *  6) Algorithmic feed shuffle + interleave 3:1      [here]
 *  7) Geo location edge injection (request.cf)       [here]
 *  8) Pluto TV dedicated hub                         [here]
 */

import { FRONTEND_HTML } from './frontend.js';
import {
  fetchTwitchStreams,
  ensureTwitchToken,
} from './twitch.js';
import { fetchYouTubeStreams } from './youtube.js';
import { fetchPlutoChannels } from './pluto.js';
import {
  fisherYatesShuffle,
  interleaveShorta,
  injectGeoChannels,
  fetchShortaPlaylist,
} from './aggregator.js';

// In-memory token cache (per-isolate)
let twitchTokenCache = { token: null, expiresAt: 0 };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cf = request.cf || {};

    // --- Routing ---
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(FRONTEND_HTML, {
        headers: { 'content-type': 'text/html;charset=utf-8' },
      });
    }

    if (url.pathname === '/api/streams') {
      return handleStreams(request, env, ctx, cf);
    }

    if (url.pathname === '/api/pluto') {
      return handlePluto(env);
    }

    if (url.pathname === '/api/health') {
      return jsonResponse({
        ok: true,
        version: '4.1.0-RECONSTRUCTION',
        time: new Date().toISOString(),
        cf: { city: cf.city, regionCode: cf.regionCode, country: cf.country },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};

// ---------------- /api/streams ----------------
async function handleStreams(request, env, ctx, cf) {
  try {
    const cacheKey = new URL(request.url);
    cacheKey.pathname = '/api/streams';
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    // Parallel fan-out
    const [twitchStreams, ytStreams, shortaPlaylist] = await Promise.allSettled([
      fetchTwitchStreams(env, () => ensureTwitchToken(env, twitchTokenCache)),
      fetchYouTubeStreams(env),
      fetchShortaPlaylist(env),
    ]);

    const twitch = twitchStreams.status === 'fulfilled' ? twitchStreams.value : [];
    const yt = ytStreams.status === 'fulfilled' ? ytStreams.value : [];
    const shorta = shortaPlaylist.status === 'fulfilled' ? shortaPlaylist.value : [];

    // Combine real streams
    const real = [...twitch, ...yt];

    // 6) Fisher-Yates strict shuffle (server-side, ONE pass)
    const shuffledReal = fisherYatesShuffle(real);

    // 6) Interleave 3:1 (real : shorta)
    const interleaved = interleaveShorta(shuffledReal, shorta);

    // 7) Geo injection — Santa Fe / SF gets local channels prepended
    const finalFeed = injectGeoChannels(interleaved, cf);

    const payload = {
      ok: true,
      generated_at: Date.now(),
      geo: { city: cf.city, regionCode: cf.regionCode, country: cf.country },
      count: finalFeed.length,
      streams: finalFeed,
    };

    const response = new Response(JSON.stringify(payload), {
      headers: {
        'content-type': 'application/json;charset=utf-8',
        'cache-control': 'public, max-age=60, s-maxage=60',
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message || err) }, 500);
  }
}

// ---------------- /api/pluto ----------------
async function handlePluto(env) {
  try {
    const channels = await fetchPlutoChannels(env);
    return jsonResponse({
      ok: true,
      count: channels.length,
      channels,
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message || err) }, 500);
  }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json;charset=utf-8' },
  });
}

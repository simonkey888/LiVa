/**
 * Twitch integration with OAuth auto-refresher (Feature #4).
 * If a request returns 401, we re-fetch a new app token and retry once.
 */

const HELIX_BASE = 'https://api.twitch.tv/helix';

// Curated list of popular Spanish-speaking streamers + 24/7 music channels
const TARGET_STREAMERS = [
  'coscu', 'mellandro', 'bkn', 'momo', 'thecasgar', 'solak_tv',
  'bugha', 'twitchpresents', 'monstercat', 'nvidiaesports',
  'shadoune666', 'auronplay', 'rubius', 'elyasemiel', 'skipthetutorial',
];

const TARGET_GAMES = ['509658', '33214', '21779', '29595', '511224', '32399']; // Just Chatting, Fortnite, LoL, CS:GO, VALORANT, Apex

export async function ensureTwitchToken(env, tokenCache) {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  const clientId = env.TWITCH_CLIENT_ID;
  const clientSecret = env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Twitch credentials not configured');
  }

  const url = new URL('https://id.twitch.tv/oauth2/token');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('grant_type', 'client_credentials');

  const resp = await fetch(url, { method: 'POST' });
  if (!resp.ok) {
    throw new Error(`Twitch token fetch failed: ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json();
  tokenCache.token = data.access_token;
  tokenCache.expiresAt = now + data.expires_in * 1000;
  return tokenCache.token;
}

async function twitchHelix(path, env, tokenCache, retry = true) {
  const token = await ensureTwitchToken(env, tokenCache);
  const resp = await fetch(`${HELIX_BASE}${path}`, {
    headers: {
      'client-id': env.TWITCH_CLIENT_ID,
      'authorization': `Bearer ${token}`,
    },
  });

  if (resp.status === 401 && retry) {
    // Force refresh
    tokenCache.token = null;
    tokenCache.expiresAt = 0;
    return twitchHelix(path, env, tokenCache, false);
  }
  if (!resp.ok) {
    throw new Error(`Twitch Helix ${path} -> ${resp.status}`);
  }
  return resp.json();
}

export async function fetchTwitchStreams(env, ensureToken) {
  // We use a small token cache shim compatible with twitchHelix
  const tokenCache = {
    get token() { return twitchTokenState.token; },
    set token(v) { twitchTokenState.token = v; },
    get expiresAt() { return twitchTokenState.expiresAt; },
    set expiresAt(v) { twitchTokenState.expiresAt = v; },
  };
  // ensureToken primes the cache (called from index.js)
  await ensureToken();

  const userLogins = TARGET_STREAMERS.join('&login=');
  const usersResp = await twitchHelix(`/users?login=${userLogins}`, env, tokenCache);
  const userIds = (usersResp.data || []).map(u => u.id);
  if (userIds.length === 0) return [];

  const idQuery = userIds.map(i => `user_id=${i}`).join('&');
  const streamsResp = await twitchHelix(`/streams?${idQuery}&first=100`, env, tokenCache);
  const liveStreams = (streamsResp.data || []).map(s => ({
    source: 'twitch',
    id: `tw_${s.id}`,
    channel: s.user_name,
    title: s.title,
    game: s.game_name,
    viewers: s.viewer_count,
    embed_url: `https://player.twitch.tv/?channel=${s.user_login}&parent=liva.simondalmasso44.workers.dev&muted=true&autoplay=true`,
    thumbnail: s.thumbnail_url?.replace('{width}', '640').replace('{height}', '360'),
    is_live: true,
  }));

  // Also pull top streams by game to ensure feed richness
  const gameStreams = await Promise.allSettled(
    TARGET_GAMES.slice(0, 3).map(g =>
      twitchHelix(`/streams?game_id=${g}&first=5`, env, tokenCache)
    )
  );
  for (const r of gameStreams) {
    if (r.status !== 'fulfilled' || !r.value?.data) continue;
    for (const s of r.value.data) {
      if (liveStreams.find(x => x.id === `tw_${s.id}`)) continue;
      liveStreams.push({
        source: 'twitch',
        id: `tw_${s.id}`,
        channel: s.user_name,
        title: s.title,
        game: s.game_name,
        viewers: s.viewer_count,
        embed_url: `https://player.twitch.tv/?channel=${s.user_login}&parent=liva.simondalmasso44.workers.dev&muted=true&autoplay=true`,
        thumbnail: s.thumbnail_url?.replace('{width}', '640').replace('{height}', '360'),
        is_live: true,
      });
    }
  }

  return liveStreams;
}

// Shared token state across module
const twitchTokenState = { token: null, expiresAt: 0 };

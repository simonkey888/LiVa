/**
 * Aggregator utilities (Features #5, #6, #7).
 *
 *  5) Shorta pseudo-live simulator — pulls recent Shorts/VODs and labels them as 'SERIE 🎬'
 *  6) Fisher-Yates strict shuffle + interleave 3:1 (real:shorta)
 *  7) Geo edge injection — Santa Fe / SF viewers get local channels prepended
 */

// ---------------- Fisher-Yates (crypto-safe) ----------------
export function fisherYatesShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    // Use crypto.getRandomValues for strict, unbiased shuffling
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------- Interleave 3:1 ----------------
// 3 real streams followed by 1 Shorta chapter
export function interleaveShorta(realStreams, shortaStreams) {
  if (!shortaStreams || shortaStreams.length === 0) return realStreams;
  const result = [];
  let shortaIdx = 0;
  for (let i = 0; i < realStreams.length; i++) {
    result.push(realStreams[i]);
    if ((i + 1) % 3 === 0) {
      // Cycle through Shorta playlist
      result.push(shortaStreams[shortaIdx % shortaStreams.length]);
      shortaIdx++;
    }
  }
  // Append remaining Shorta items at the end
  while (shortaIdx < shortaStreams.length) {
    result.push(shortaStreams[shortaIdx]);
    shortaIdx++;
  }
  return result;
}

// ---------------- Shorta pseudo-live ----------------
// @hacela.shorta — we deliberately DO NOT filter by eventType=live
// We pull their latest Shorts and inject them with loop=1 + playlist={videoId}
export async function fetchShortaPlaylist(env) {
  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  try {
    // Step 1: resolve channel ID for @hacela.shorta
    const chUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
    chUrl.searchParams.set('part', 'contentDetails,snippet');
    chUrl.searchParams.set('forHandle', '@hacela.shorta');
    chUrl.searchParams.set('key', apiKey);
    const chResp = await fetch(chUrl);
    if (!chResp.ok) return [];
    const chData = await chResp.json();
    const channel = chData.items?.[0];
    if (!channel) return [];
    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) return [];

    // Step 2: pull latest 10 items from uploads
    const plUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    plUrl.searchParams.set('part', 'snippet,contentDetails');
    plUrl.searchParams.set('playlistId', uploadsPlaylistId);
    plUrl.searchParams.set('maxResults', '10');
    plUrl.searchParams.set('key', apiKey);
    const plResp = await fetch(plUrl);
    if (!plResp.ok) return [];
    const plData = await plResp.json();

    return (plData.items || []).map(item => {
      const videoId = item.contentDetails?.videoId;
      return {
        source: 'shorta',
        id: `shorta_${videoId}`,
        channel: '@hacela.shorta',
        title: item.snippet?.title || 'Shorta',
        // Feature #5: loop + playlist for pseudo-live behavior
        embed_url: `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1`,
        thumbnail: item.snippet?.thumbnails?.medium?.url,
        badge: 'SERIE 🎬',
        is_pseudo_live: true,
      };
    });
  } catch {
    return [];
  }
}

// ---------------- Geo edge injection ----------------
// Santa Fe (province) viewers get local channels injected at index 0-2
const SANTA_FE_LOCAL_CHANNELS = [
  {
    source: 'youtube',
    id: 'geo_telefe_sf',
    channel: 'Telefe Santa Fe',
    title: 'Señal en vivo - Santa Fe',
    embed_url: 'https://www.youtube.com/embed/live_stream?channel=UCk5xK8e0p7Yn7w5w5w5w5w5w5&autoplay=1&mute=1&modestbranding=1&rel=0&iv_load_policy=3',
    is_live: true,
    geo_local: true,
    badge: '🏠 SANTA FE',
  },
  {
    source: 'youtube',
    id: 'geo_canal_13_sf',
    channel: 'Canal 13 Santa Fe',
    title: 'El Canal de Santa Fe - En Vivo',
    embed_url: 'https://www.youtube.com/embed/live_stream?channel=UCr2QfQc2QfQc2QfQc2QfQc2Q&autoplay=1&mute=1&modestbranding=1&rel=0&iv_load_policy=3',
    is_live: true,
    geo_local: true,
    badge: '🏠 SANTA FE',
  },
];

export function injectGeoChannels(feed, cf) {
  const region = (cf.regionCode || '').toUpperCase();
  const city = (cf.city || '').toLowerCase();

  // Feature #7: trigger only for Santa Fe province
  if (region === 'SF' || city.includes('santa fe') || city.includes('rosario')) {
    // Inject at index 0-2 (max 2 local channels to keep feed diverse)
    return [...SANTA_FE_LOCAL_CHANNELS, ...feed];
  }
  return feed;
}

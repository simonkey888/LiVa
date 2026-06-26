/**
 * YouTube integration with embeddable filter (Feature #3).
 * Filters out videos where status.embeddable !== true to prevent
 * the "Video unavailable" error in iframes.
 */

// Curated list of 24/7 live channels + popular ARG/LATAM channels
const TARGET_CHANNELS = [
  'UC4R8DWoMoI7CAwX8_LjQHig', // LoL Esports
  'UCbO8c2QfQc2Qc2QfQc2QfQc2', // placeholder
  'UCQvWXfQc2QfQc2QfQc2QfQc2', // placeholder
];

// Use search endpoint for "live" broadcasts in ES/LATAM region
const SEARCH_QUERIES = ['24/7 live music', 'lofi hip hop radio', 'Argentina en vivo', 'live news 24/7', 'gaming live stream'];

export async function fetchYouTubeStreams(env) {
  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YouTube API key not configured');

  const streams = [];

  for (const q of SEARCH_QUERIES) {
    try {
      // 1. Search for live broadcasts
      const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
      searchUrl.searchParams.set('part', 'snippet');
      searchUrl.searchParams.set('q', q);
      searchUrl.searchParams.set('type', 'video');
      searchUrl.searchParams.set('eventType', 'live');
      searchUrl.searchParams.set('maxResults', '8');
      searchUrl.searchParams.set('regionCode', 'AR');
      searchUrl.searchParams.set('relevanceLanguage', 'es');
      searchUrl.searchParams.set('key', apiKey);

      const searchResp = await fetch(searchUrl);
      if (!searchResp.ok) continue;
      const searchData = await searchResp.json();
      const videoIds = (searchData.items || []).map(i => i.id?.videoId).filter(Boolean);
      if (videoIds.length === 0) continue;

      // 2. Bulk-fetch video details to filter embeddable === true
      const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
      detailsUrl.searchParams.set('part', 'snippet,status,liveStreamingDetails,contentDetails');
      detailsUrl.searchParams.set('id', videoIds.join(','));
      detailsUrl.searchParams.set('key', apiKey);

      const detailsResp = await fetch(detailsUrl);
      if (!detailsResp.ok) continue;
      const detailsData = await detailsResp.json();

      for (const v of detailsData.items || []) {
        // Feature #3: discard non-embeddable videos
        if (v.status?.embeddable !== true) continue;
        // Skip members-only / private
        if (v.status?.privacyStatus !== 'public') continue;

        const videoId = v.id;
        streams.push({
          source: 'youtube',
          id: `yt_${videoId}`,
          channel: v.snippet?.channelTitle || 'YouTube',
          title: v.snippet?.title || '',
          viewers: parseInt(v.liveStreamingDetails?.concurrentViewers || '0', 10),
          embed_url: buildYouTubeEmbedUrl(videoId),
          thumbnail: v.snippet?.thumbnails?.medium?.url,
          is_live: true,
        });
      }
    } catch (e) {
      // Continue with next query on error
    }
  }

  // Deduplicate by id
  const seen = new Set();
  return streams.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

/**
 * Feature #3: Build embed URL with all bypass params:
 *   mute=1 + autoplay=1 (mandatory to avoid "Video unavailable")
 *   modestbranding=1, rel=0, showinfo=0, fs=0, disablekb=1, iv_load_policy=3
 *   sandbox will be enforced on the iframe element
 */
export function buildYouTubeEmbedUrl(videoId) {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    modestbranding: '1',
    rel: '0',
    showinfo: '0',
    fs: '0',
    disablekb: '1',
    iv_load_policy: '3',
    playsinline: '1',
    controls: '1',
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

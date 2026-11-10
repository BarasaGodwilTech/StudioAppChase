/* Reads a pasted music/video link and returns title, artist, artwork and length (when the platform shares them).
   Runs on the server so there are no browser CORS problems. Uses each platform's public oEmbed / page tags. */
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; ChaseXRecordsBot/1.0)', 'accept-language': 'en' };

function detect(link) {
  const s = String(link || '');
  if (!s) return 'none';
  if (/youtu\.be|youtube\.com/.test(s)) return 'youtube';
  if (/open\.spotify\.com/.test(s)) return 'spotify';
  if (/soundcloud\.com/.test(s)) return 'soundcloud';
  if (/\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(s)) return 'audio';
  if (/\.(mp4|webm|mov)(\?|$)/i.test(s)) return 'video';
  if (/audiomack\.com/.test(s)) return 'audiomack';
  if (/music\.apple\.com/.test(s)) return 'apple';
  if (/boomplay\.com/.test(s)) return 'boomplay';
  return 'external';
}
const PLAYABLE = { youtube: 1, spotify: 1, soundcloud: 1, audio: 1 };

function safeUrl(u) {
  let x; try { x = new URL(u); } catch { throw new Error('That does not look like a link.'); }
  if (!/^https?:$/.test(x.protocol)) throw new Error('Only http and https links are supported.');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/i.test(x.hostname)) throw new Error('That address is not allowed.');
  return x.href;
}
const dec = s => String(s || '').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x([\da-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).trim();
const getText = async u => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(8000), redirect: 'follow' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); };
const getJson = async u => JSON.parse(await getText(u));
function meta(html, key) {
  const k = key.replace(/[:.]/g, '\\$&');
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*?content=["']([^"']*)["']`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name)=["']${k}["']`, 'i'));
  return a ? dec(a[1]) : '';
}
/* "Artist - Song (Official Video) ft. X"  ->  { artist, title } */
function splitTitle(raw, channel) {
  let t = dec(raw).replace(/\s*[\(\[][^)\]]*(official|video|audio|lyric|visuali[sz]er|hd|4k|music video)[^)\]]*[\)\]]/gi, '').replace(/\s*\|.*$/, '').trim();
  let artist = '';
  const m = t.match(/^(.{1,60}?)\s+[-–—]\s+(.+)$/);
  if (m) { artist = m[1].trim(); t = m[2].trim(); }
  else if (channel) artist = dec(channel).replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
  return { artist, title: t };
}
const ytId = u => { const m = String(u).match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/); return m && m[1]; };

async function info(rawUrl) {
  const url = safeUrl(rawUrl), platform = detect(url);
  const out = { url, platform, playable: !!PLAYABLE[platform], title: '', artist: '', artwork: '', duration: 0, notes: [] };
  try {
    if (platform === 'youtube') {
      const id = ytId(url); if (!id) throw new Error('Could not find the video id in that link.');
      out.artwork = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      try { const j = await getJson(`https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}&format=json`); Object.assign(out, splitTitle(j.title, j.author_name)); out.channel = j.author_name; if (j.thumbnail_url) out.artwork = j.thumbnail_url; } catch { out.notes.push('Title lookup failed.'); }
      try { const h = await getText(`https://www.youtube.com/watch?v=${id}`); const m = h.match(/"lengthSeconds":"(\d+)"/); if (m) out.duration = +m[1]; } catch { /* length is optional */ }
    } else if (platform === 'spotify') {
      try { const j = await getJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`); out.title = dec(j.title); out.artwork = j.thumbnail_url || ''; } catch { out.notes.push('Title lookup failed.'); }
      try {
        const h = await getText(url);
        if (!out.title) out.title = meta(h, 'og:title');
        if (!out.artwork) out.artwork = meta(h, 'og:image');
        const d = +meta(h, 'music:duration'); if (d) out.duration = d;
        const parts = meta(h, 'og:description').replace(/^Listen to .*? on Spotify\.\s*/i, '').split(/\s+·\s+/).map(s => s.replace(/\.$/, '').trim()).filter(p => p && p.toLowerCase() !== out.title.toLowerCase() && !/^\d{4}$/.test(p) && !/^(song|single|album|ep)$/i.test(p));
        if (parts[0]) out.artist = parts[0];
      } catch { /* page tags are optional */ }
    } else if (platform === 'soundcloud') {
      const j = await getJson(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`);
      out.artist = dec(j.author_name); out.title = dec(j.title).replace(new RegExp(`\\s+by\\s+${(j.author_name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), ''); out.artwork = j.thumbnail_url || '';
    } else if (platform === 'apple') {
      try { const j = await getJson(`https://embed.music.apple.com/oembed?url=${encodeURIComponent(url)}`); out.title = dec(j.title); out.artwork = j.thumbnail_url || ''; out.artist = dec(j.author_name || ''); } catch { /* fall through to page tags */ }
    }
    if ((platform === 'audio' || platform === 'video')) {
      const f = decodeURIComponent(url.split('?')[0].split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ');
      Object.assign(out, splitTitle(f, ''));
    }
    if (!out.title && !['youtube', 'spotify', 'soundcloud', 'audio', 'video'].includes(platform)) {
      const h = await getText(url), t = meta(h, 'og:title') || (h.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
      const s = t.match(/^(.+?)\s+(?:by|-|–)\s+(.+?)(?:\s+[|·-].*)?$/i); out.title = s ? dec(s[1]) : dec(t); if (s && !out.artist) out.artist = dec(s[2]);
      out.artwork = out.artwork || meta(h, 'og:image');
    }
  } catch (e) { out.notes.push(e.message); }
  if (!out.playable && !['none'].includes(platform)) out.notes.push(platform === 'video' ? 'This is a video file. Add it under Videos.' : 'This platform cannot play inside the app. Users will see an Open button.');
  if (!out.title) out.notes.push('Could not read the details. Type them in.');
  return out;
}
module.exports = { detect, info, splitTitle, safeUrl };

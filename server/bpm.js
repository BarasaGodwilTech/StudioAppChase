/* Automatic BPM (tempo) detection.
   1. Songs that link straight to an audio file (mp3, wav, ogg, m4a...) are downloaded and measured.
   2. Anything else is looked up in the Deezer music database by artist and title.
   YouTube, Spotify and SoundCloud do not let anyone read their audio, so those songs can only use step 2
   (or the admin can measure an uploaded copy of the song, or tap the tempo by hand). */
const MusicTempo = require('music-tempo');
const fs = require('fs');
const path = require('path');
const { detect, safeUrl } = require('./linkinfo');
const UPLOADS = path.join(__dirname, '..', 'public', 'uploads');

const SR = 44100;                 // the tempo library expects 44.1 kHz audio
const MAX_BYTES = 30 * 1024 * 1024;
let decoder;

async function decodeAudio(buf) {
  decoder = decoder || (await import('audio-decode')).default;
  const r = await decoder(new Uint8Array(buf.buffer, buf.byteOffset, buf.length));
  const chans = r.channelData || (r.getChannelData ? Array.from({ length: r.numberOfChannels }, (_, c) => r.getChannelData(c)) : []);
  if (!chans.length || !r.sampleRate) throw new Error('empty');
  return { sampleRate: r.sampleRate, length: chans[0].length, numberOfChannels: chans.length, getChannelData: c => chans[c] };
}

/* A short mono stretch of the song at 44.1 kHz */
function windowMono(ab, startSec, durSec) {
  const sr = ab.sampleRate, n = Math.floor(durSec * SR), out = new Float32Array(n), last = ab.length - 1, chans = [];
  for (let c = 0; c < ab.numberOfChannels; c++) chans.push(ab.getChannelData(c));
  for (let i = 0; i < n; i++) {
    const p = (startSec + i / SR) * sr, i0 = Math.min(last, Math.floor(p)), i1 = Math.min(last, i0 + 1), f = p - i0;
    let s = 0;
    for (const ch of chans) s += ch[i0] * (1 - f) + ch[i1] * f;
    out[i] = s / chans.length;
  }
  return out;
}

/* The detector often locks onto the hi-hats and reports double speed for slow songs (an 86 BPM hip-hop beat reads as 172).
   Almost everything it finds from about 105 BPM up is right, so only readings above 165 are folded to half speed.
   (A real 170+ BPM drum-and-bass track will read as half; the admin can type the real number in.) */
const fold = t => { while (t > 165) t /= 2; return t; };

function tempoOf(data) {
  try { const t = +new MusicTempo(data).tempo; return t > 0 ? fold(t) : null; } catch { return null; }
}

/* Two stretches of the song are measured; if they agree we trust the answer */
function reconcile(ts) {
  if (!ts.length) return null;
  if (ts.length === 1) return { bpm: ts[0], confidence: 'medium' };
  const [a, b] = ts, r = a / b;
  if (Math.abs(r - 1) < 0.03) return { bpm: (a + b) / 2, confidence: 'high' };
  if (Math.abs(r - 2) < 0.06 || Math.abs(r - 0.5) < 0.03) {          // one stretch found the double-time beat
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return { bpm: hi <= 175 ? hi : lo, confidence: 'low' };
  }
  return { bpm: a, confidence: 'low' };
}

async function fromBuffer(buf) {
  let ab;
  try { ab = await decodeAudio(buf); } catch { throw new Error('Could not read that audio file. Use mp3, wav, ogg, flac or m4a.'); }
  const dur = ab.length / ab.sampleRate;
  if (!(dur >= 12)) throw new Error('That audio is too short to measure.');
  const win = Math.min(40, dur);
  const starts = dur <= 45 ? [0] : [dur * 0.2, dur * 0.55].map(s => Math.min(s, dur - win));
  const r = reconcile(starts.map(s => tempoOf(windowMono(ab, s, win))).filter(Boolean));
  if (!r) throw new Error('No clear beat found in that audio.');
  return { bpm: Math.round(r.bpm), confidence: r.confidence, duration: Math.round(dur) };
}

async function readLocal(link) {
  const m = /^\/?uploads\/([\w.-]+)$/.exec(link);
  if (!m) throw new Error('Unsafe file path.');
  return fs.promises.readFile(path.join(UPLOADS, m[1]));
}

async function download(url) {
  if (/^\/?uploads\//.test(url)) return readLocal(url);
  const res = await fetch(safeUrl(url), { signal: AbortSignal.timeout(45000), redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; ChaseXRecordsBot/1.0)' } });
  if (!res.ok) throw new Error('The audio link answered with HTTP ' + res.status + '.');
  if (+res.headers.get('content-length') > MAX_BYTES) throw new Error('That audio file is too big to analyse (limit 30 MB).');
  const chunks = []; let n = 0;
  for await (const c of res.body) { n += c.length; if (n > MAX_BYTES) throw new Error('That audio file is too big to analyse (limit 30 MB).'); chunks.push(c); }
  return Buffer.concat(chunks);
}

const norm = s => String(s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, '');
async function fromDeezer(artist, title) {
  if (!title) return null;
  const getJson = async u => (await fetch(u, { signal: AbortSignal.timeout(8000) })).json();
  const q = artist ? `artist:"${artist}" track:"${title}"` : `track:"${title}"`;
  const s = await getJson('https://api.deezer.com/search?limit=5&q=' + encodeURIComponent(q));
  const hit = (s.data || []).find(x => norm(x.title).includes(norm(title)) && (!artist || norm(x.artist && x.artist.name).includes(norm(artist)) || norm(artist).includes(norm(x.artist && x.artist.name))));
  if (!hit) return null;
  const t = await getJson('https://api.deezer.com/track/' + hit.id);
  return t && t.bpm > 0 ? Math.round(t.bpm) : null;
}

/* Works out the BPM of a song from its link. Never throws. */
async function detectTrack({ link, artist, title }) {
  const platform = detect(link), notes = [];
  if (platform === 'audio') {
    try { const r = await fromBuffer(await download(link)); return { bpm: r.bpm, source: 'audio', confidence: r.confidence, notes }; }
    catch (e) { notes.push(e.message); }
  } else if (link) {
    notes.push('YouTube, Spotify and SoundCloud do not share their audio, so it cannot be measured from the link.');
  }
  try { const d = await fromDeezer(artist, title); if (d) return { bpm: d, source: 'deezer', confidence: 'medium', notes }; notes.push('Not found in the Deezer database.'); }
  catch { notes.push('Could not reach the Deezer database.'); }
  return { bpm: null, source: null, confidence: null, notes };
}

/* Decoding a song takes a lot of memory, so only one analysis runs at a time */
let chain = Promise.resolve();
const serial = fn => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

module.exports = {
  fromBuffer: buf => serial(() => fromBuffer(buf)),
  detectTrack: t => serial(() => detectTrack(t)),
  fromDeezer, reconcile
};

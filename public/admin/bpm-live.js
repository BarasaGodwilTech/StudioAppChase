/* Measures a song's BPM by listening to it play in this browser tab, the way a tuner listens.
   Works with any link the admin can play here (YouTube, SoundCloud, Spotify). Nothing is recorded or saved:
   the sound is turned into a single number and thrown away. Needs desktop Chrome or Edge ("Share tab audio"). */
(function (root) {
  const SR = 44100;

  function resample(pcm, sr, want) {
    if (sr === want) return pcm;
    const n = Math.floor(pcm.length * want / sr), out = new Float32Array(n), r = sr / want, last = pcm.length - 1;
    for (let i = 0; i < n; i++) { const p = i * r, i0 = Math.floor(p), f = p - i0; out[i] = pcm[i0] * (1 - f) + pcm[Math.min(last, i0 + 1)] * f; }
    return out;
  }

  /* pcm: mono samples. Returns { bpm, confidence }. Readings above 165 are folded to half speed (see the server's explanation). */
  function analyzePCM(pcm, sampleRate) {
    const MT = typeof MusicTempo !== 'undefined' ? MusicTempo : root.MusicTempo;
    if (!MT) throw new Error('The tempo library did not load. Refresh the page and try again.');
    const data = resample(pcm, sampleRate, SR);
    if (data.length < SR * 15) throw new Error('Not enough music was heard to measure it.');
    let t = +new MT(data.subarray(0, SR * 40)).tempo;
    if (!(t > 0)) throw new Error('No clear beat found.');
    while (t > 165) t /= 2;
    return { bpm: Math.round(t), confidence: 'medium' };
  }

  function embedFor(link) {
    link = String(link || '');
    let m = link.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|music\.youtube\.com\/watch\?(?:[^#]*&)?v=)([\w-]{11})/);
    if (m) return { kind: 'youtube', id: m[1], src: 'https://www.youtube.com/embed/' + m[1] + '?autoplay=1&rel=0&playsinline=1', auto: true, h: 220, seconds: 48, skip: 8 };
    if (/soundcloud\.com\//.test(link)) return { kind: 'soundcloud', src: 'https://w.soundcloud.com/player/?auto_play=true&url=' + encodeURIComponent(link), auto: true, h: 166, seconds: 48, skip: 8 };
    m = link.match(/open\.spotify\.com\/(?:intl-\w+\/)?track\/(\w+)/) || link.match(/^spotify:track:(\w+)/);
    if (m) return { kind: 'spotify', id: m[1], src: 'https://open.spotify.com/embed/track/' + m[1], auto: false, h: 152, seconds: 27, skip: 2 };   /* Spotify embeds can be 30 second previews */
    return null;
  }

  const supported = () => !!(root.navigator && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && (root.AudioContext || root.webkitAudioContext));

  /* Ask once for this tab's sound. The same capture can then measure many songs in a row. */
  async function startCapture(opts = {}) {
    if (!supported()) throw new Error('Listening needs desktop Chrome or Edge.');
    let stream;
    try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: { suppressLocalAudioPlayback: opts.silent !== false, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, preferCurrentTab: true, selfBrowserSurface: 'include', systemAudio: 'exclude' }); }
    catch (e) { throw new Error('Sharing was cancelled. Choose "This tab" and tick "Also share tab audio".'); }
    if (!stream.getAudioTracks().length) { stream.getTracks().forEach(t => t.stop()); throw new Error('No sound was shared. Choose "This tab" and tick "Also share tab audio".'); }
    const ctx = new (root.AudioContext || root.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    const proc = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain();
    mute.gain.value = 0; src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    const cap = { stream, ctx, proc, onChunk: null, ended: false };
    proc.onaudioprocess = e => { if (cap.onChunk) cap.onChunk(new Float32Array(e.inputBuffer.getChannelData(0))); };
    stream.getAudioTracks()[0].addEventListener('ended', () => { cap.ended = true; });
    return cap;
  }
  function stopCapture(cap) {
    if (!cap) return;
    try { cap.onChunk = null; cap.proc.disconnect(); cap.stream.getTracks().forEach(t => t.stop()); cap.ctx.close(); } catch (e) { /* already closed */ }
  }

  /* Collects `seconds` of actual music (silence before the song starts is ignored). */
  function listen(cap, o = {}) {
    const seconds = o.seconds || 48, maxWait = o.maxWait || 70, sr = cap.ctx.sampleRate;
    return new Promise((res, rej) => {
      const parts = []; let heard = 0; const t0 = Date.now();
      const fin = (fn, v) => { cap.onChunk = null; fn(v); };
      cap.onChunk = c => {
        if (o.signal && o.signal.aborted) return fin(rej, new Error('Stopped.'));
        if (cap.ended) return fin(rej, new Error('Sharing was stopped.'));
        let s = 0, n = 0; for (let i = 0; i < c.length; i += 8) { s += c[i] * c[i]; n++; }
        const loud = Math.sqrt(s / n) > 0.004;
        if (loud || parts.length) parts.push(c);
        if (loud) heard += c.length / sr;
        const waited = (Date.now() - t0) / 1000;
        o.onProgress && o.onProgress({ heard, waited, seconds });
        if (heard >= seconds) { const tot = parts.reduce((a, p) => a + p.length, 0), pcm = new Float32Array(tot); let k = 0; for (const p of parts) { pcm.set(p, k); k += p.length; } return fin(res, { pcm, sampleRate: sr }); }
        if (waited > maxWait) return fin(rej, new Error(heard > 8 ? 'Heard only ' + Math.round(heard) + ' seconds of music.' : 'No sound was heard. Press play in the player, and check that "Share tab audio" was ticked.'));
      };
    });
  }

  let spP;
  function spotifyApi() {
    return spP || (spP = new Promise((res, rej) => {
      if (root.__bpmSp) return res(root.__bpmSp);
      const prev = root.onSpotifyIframeApiReady;
      root.onSpotifyIframeApiReady = a => { root.__bpmSp = a; res(a); if (prev) prev(a); };
      const sc = document.createElement('script'); sc.src = 'https://open.spotify.com/embed/iframe-api/v1'; sc.async = true;
      sc.onerror = () => rej(new Error('The Spotify player did not load.'));
      document.head.appendChild(sc); setTimeout(() => rej(new Error('The Spotify player did not load.')), 12000);
    }));
  }
  async function playSpotify(host, id) {
    const api = await spotifyApi(), slot = document.createElement('div');
    host.innerHTML = ''; host.appendChild(slot);
    api.createController(slot, { uri: 'spotify:track:' + id, width: '100%', height: 152 }, c => { c.addListener('ready', () => { try { c.play(); } catch (e) { /* needs a click */ } }); });
  }

  /* Plays the link in `host` and measures it. The first 8 seconds are skipped (adverts and intros). */
  async function measureLink(cap, link, o = {}) {
    const e = embedFor(link);
    if (!e) throw new Error('This link cannot be played here. Use Tap or From file.');
    let started = false;
    if (e.kind === 'spotify') { try { await playSpotify(o.host, e.id); started = true; } catch (err) { started = false; } }
    if (!started) {
      const f = document.createElement('iframe');
      f.src = e.src; f.allow = 'autoplay; encrypted-media'; f.style.cssText = 'width:100%;height:' + e.h + 'px;border:0;border-radius:12px;background:#000';
      o.host.innerHTML = ''; o.host.appendChild(f);
    }
    try {
      const { pcm, sampleRate } = await listen(cap, { seconds: e.seconds, maxWait: e.auto || started ? 60 : 100, onProgress: o.onProgress, signal: o.signal });
      return analyzePCM(pcm.subarray(Math.floor(e.skip * sampleRate)), sampleRate);
    } finally { o.host.innerHTML = ''; }
  }

  const api = { analyzePCM, embedFor, resample, supported, startCapture, stopCapture, measureLink };
  root.BpmLive = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

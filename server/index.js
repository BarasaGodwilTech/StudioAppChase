require('dotenv').config();
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { q, init } = require('./db');
const { detect, info } = require('./linkinfo');
const { detectTrack, fromBuffer } = require('./bpm');
const fs = require('fs');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const GID = process.env.GOOGLE_CLIENT_ID || '';
const google = GID ? new OAuth2Client(GID) : null;
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));

/* ---------- helpers ---------- */
const DB_ERRORS = { '23503': [400, 'That is linked to something that does not exist (for example a deleted artist).'], '23505': [409, 'That already exists.'], '23502': [400, 'A required field is missing.'], '22P02': [400, 'One of the values has the wrong format.'], '22003': [400, 'A number is too big or too small.'], '22007': [400, 'That date is not valid.'], '22008': [400, 'That date is not valid.'] };
const wrap = fn => (req, res) => fn(req, res).catch(e => {
  const db = DB_ERRORS[e.code];
  if (!e.status) console.error(e);
  const status = e.status || (db && db[0]) || 500;
  res.status(status).json({ error: e.status ? e.message : db ? db[1] : 'Server error' });
});
const fail = (status, message) => Object.assign(new Error(message), { status });
const sign = u => jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '30d' });
const pub = u => ({ id: u.id, name: u.name, email: u.email, avatar: u.avatar, role: u.role });
const EMAIL = /^\S+@\S+\.\S+$/;

function auth(required = true) {
  return (req, _res, next) => {
    const h = req.headers.authorization || '';
    try { req.user = jwt.verify(h.replace(/^Bearer /, ''), SECRET); } catch { req.user = null; }
    if (required && !req.user) return next(fail(401, 'Please sign in.'));
    next();
  };
}
const admin = [auth(), (req, _res, next) => (req.user.role === 'admin' ? next() : next(fail(403, 'Admins only.')))];

const hits = new Map();
function limit(max, ms) {
  return (req, _res, next) => {
    const k = req.ip + req.path, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < ms);
    if (a.length >= max) return next(fail(429, 'Too many attempts. Try again in a few minutes.'));
    a.push(now); hits.set(k, a); next();
  };
}

async function userFor({ email, name, googleId, avatar }) {
  const admins = (process.env.ADMIN_EMAIL || '').toLowerCase();
  let { rows } = await q('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
  if (!rows[0]) {
    rows = (await q('INSERT INTO users(name,email,google_id,avatar,role) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [name, email.toLowerCase(), googleId || null, avatar || null, email.toLowerCase() === admins ? 'admin' : 'user'])).rows;
  } else if (googleId && !rows[0].google_id) {
    rows = (await q('UPDATE users SET google_id=$1, avatar=COALESCE(avatar,$2) WHERE id=$3 RETURNING *', [googleId, avatar || null, rows[0].id])).rows;
  }
  return rows[0];
}

/* ---------- public ---------- */
app.get('/api/config', (_req, res) => res.json({ googleClientId: GID }));

const trackSql = `SELECT t.id,t.bpm_source,t.title,t.artist_id,a.name AS artist,t.genre,t.link,t.artwork,t.palette,t.duration,t.bpm,t.tags,t.featured,t.status,t.plays,t.likes,t.release_date::text AS release_date
  FROM tracks t LEFT JOIN artists a ON a.id=t.artist_id`;
const withPlatform = r => ({ ...r, platform: detect(r.link) });

app.use(['/api/bootstrap', '/api/config'], (_req, res, next) => { res.set('Cache-Control', 'no-cache'); next(); });
app.get('/api/bootstrap', wrap(async (_req, res) => {
  const [tracks, artists, videos, services, settings] = await Promise.all([
    q(trackSql + " WHERE t.status='published' ORDER BY t.release_date DESC, t.id DESC"),
    q("SELECT id,name,genre,bio,image,instagram,palette FROM artists WHERE status='active' ORDER BY name"),
    q("SELECT * FROM videos WHERE status='published' ORDER BY sort, id"),
    q('SELECT * FROM services WHERE active ORDER BY kind, sort, id'),
    q('SELECT key,value FROM settings')]);
  res.json({ tracks: tracks.rows.map(withPlatform), artists: artists.rows, videos: videos.rows, services: services.rows,
    settings: Object.fromEntries(settings.rows.map(r => [r.key, r.value])) });
}));

/* A "stream" is counted by the app after about 30 seconds of listening.
   One listener (signed-in user, or an anonymous hash of their connection) adds one stream per song every 25 seconds.
   The check lives in the database, so it still works after the server restarts. */
app.post('/api/tracks/:id/play', auth(false), limit(40, 60000), wrap(async (req, res) => {
  const id = +req.params.id;
  const who = req.user ? 'u' + req.user.id : 'i' + crypto.createHash('sha256').update(String(req.ip) + SECRET).digest('hex').slice(0, 16);
  const dup = await q("SELECT 1 FROM plays WHERE track_id=$1 AND who=$2 AND at > now()-interval '25 seconds' LIMIT 1", [id, who]);
  if (dup.rows[0]) {
    const t = await q('SELECT plays FROM tracks WHERE id=$1', [id]);
    return res.json({ ok: true, counted: false, plays: t.rows[0] ? t.rows[0].plays : 0 });
  }
  const r = await q("UPDATE tracks SET plays=plays+1 WHERE id=$1 AND status='published' RETURNING plays", [id]);
  if (!r.rows[0]) throw fail(404, 'Song not found.');
  await q('INSERT INTO plays(track_id, who) VALUES($1,$2)', [id, who]);
  res.json({ ok: true, counted: true, plays: r.rows[0].plays });
}));

app.post('/api/videos/:id/view', wrap(async (req, res) => { await q('UPDATE videos SET views=views+1 WHERE id=$1', [+req.params.id]); res.json({ ok: true }); }));

/* ---------- auth ---------- */
app.post('/api/auth/register', limit(8, 600000), wrap(async (req, res) => {
  const { name = '', email = '', password = '' } = req.body;
  if (name.trim().length < 2) throw fail(400, 'Enter your name.');
  if (!EMAIL.test(email)) throw fail(400, 'Enter a valid email address.');
  if (password.length < 8) throw fail(400, 'Use at least 8 characters.');
  if ((await q('SELECT 1 FROM users WHERE email=$1', [email.toLowerCase()])).rows[0]) throw fail(409, 'That email already has an account. Sign in instead.');
  const u = (await q('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING *',
    [name.trim(), email.toLowerCase(), await bcrypt.hash(password, 11), email.toLowerCase() === (process.env.ADMIN_EMAIL || '').toLowerCase() ? 'admin' : 'user'])).rows[0];
  res.json({ token: sign(u), user: pub(u) });
}));

app.post('/api/auth/login', limit(10, 600000), wrap(async (req, res) => {
  const { email = '', password = '' } = req.body;
  const u = (await q('SELECT * FROM users WHERE email=$1', [email.toLowerCase()])).rows[0];
  if (!u || !u.password_hash || !(await bcrypt.compare(password, u.password_hash))) throw fail(401, u && !u.password_hash ? 'This account uses Google. Tap Continue with Google.' : 'Email or password is not right.');
  res.json({ token: sign(u), user: pub(u) });
}));

app.post('/api/auth/google', limit(20, 600000), wrap(async (req, res) => {
  if (!google) throw fail(503, 'Google sign-in is not set up yet.');
  let p;
  try { p = (await google.verifyIdToken({ idToken: req.body.credential, audience: GID })).getPayload(); } catch { throw fail(401, 'Google sign-in could not be verified.'); }
  if (!p.email || !p.email_verified) throw fail(401, 'Your Google email is not verified.');
  const u = await userFor({ email: p.email, name: p.name || p.email.split('@')[0], googleId: p.sub, avatar: p.picture });
  res.json({ token: sign(u), user: pub(u) });
}));

/* Privacy policy (set CONTACT_EMAIL on Render to show your email address) */
app.get('/privacy', wrap(async (_req, res) => {
  const saved = (await q("SELECT value FROM settings WHERE key='contact_email'")).rows[0];
  const mail = String((saved && saved.value) || process.env.CONTACT_EMAIL || '').replace(/[<>"&]/g, '');
  const contact = mail ? `email us at <a href="mailto:${mail}">${mail}</a>` : 'contact us through the details on our website or social pages';
  res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy policy · Chase X Records</title>
<style>body{margin:0;background:#060A08;color:#EAF2EC;font:16px/1.65 system-ui,sans-serif}main{max-width:720px;margin:0 auto;padding:40px 22px 80px}h1{font-size:34px;margin:0 0 6px}h2{font-size:19px;margin:30px 0 6px;color:#9CFF57}p,li{color:#C4D1C8}a{color:#9CFF57}small{color:#7E8C83}</style>
<main><h1>Privacy policy</h1><small>Chase X Records · last updated ${new Date().toISOString().slice(0, 10)}</small>
<h2>What we collect</h2><ul><li><b>Account:</b> your name, email and a scrambled (hashed) password. If you use Google sign-in, your name, email and profile photo from Google. We never see your Google password.</li>
<li><b>Likes:</b> the songs you like.</li><li><b>Bookings:</b> the name, phone number, notes, service, date and time you send when you request a session or lesson.</li>
<li><b>Listening counts:</b> when you listen to a song for about 30 seconds we add one stream. To stop counting the same person twice we store your account number or a scrambled code made from your connection, never your plain IP address.</li>
<li><b>On your device:</b> your sign-in, recently played songs and settings are saved in your browser or app so it works the next time you open it.</li></ul>
<h2>What we do with it</h2><p>We use it to run the app: sign you in, show your liked songs, handle your bookings, and show artists how many streams their songs have. We do not sell your information and we do not show ads.</p>
<h2>Other services</h2><p>Songs and videos play through YouTube, SoundCloud, Spotify or direct files. Those services may set their own cookies and have their own privacy policies. Google handles Google sign-in. Our website is hosted on Render.</p>
<h2>Your choices</h2><p>You can ask us to see, correct or delete your account and its data at any time. To do that, ${contact}.</p></main>`);
}));

/* Lightweight check used by the Android app (and keep-alive pings) to know the server is awake */
app.get('/healthz', (_req, res) => { res.set('Cache-Control', 'no-store'); res.type('text/plain').send('ok'); });

/* ---------- Google sign-in for the installed Android app ----------
   Google blocks its sign-in page inside app web views, so the app opens it in the phone's secure browser tab.
   Google sends the result here, we sign the person in, and hand a one-time code back to the app. */
const appCodes = new Map();
const APP_SCHEME = 'chasexrecords';
const origin = req => (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
const cookieOf = (req, n) => ((req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(n + '=')) || '').slice(n.length + 1);
const page = (title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#060A08;color:#fff;font:16px system-ui,sans-serif;text-align:center;padding:24px"><div>${body}</div>`;

app.get('/auth/google/start', limit(30, 600000), (req, res) => {
  if (!GID) return res.status(503).send(page('Not set up', '<p>Google sign-in is not set up yet.</p>'));
  const nonce = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `gn=${nonce}; Max-Age=600; Path=/auth/google; HttpOnly; SameSite=None; Secure`);
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({ client_id: GID, redirect_uri: origin(req) + '/auth/google/callback', response_type: 'id_token',
    scope: 'openid email profile', nonce, response_mode: 'form_post', prompt: 'select_account' }).toString();
  res.redirect(u.toString());
});

app.post('/auth/google/callback', express.urlencoded({ extended: false, limit: '20kb' }), limit(30, 600000), async (req, res) => {
  const back = msg => res.status(400).send(page('Sign-in failed', `<h2>Sign-in failed</h2><p>${msg}</p><p>Close this tab and try again.</p>`));
  try {
    if (!google) return back('Google sign-in is not set up yet.');
    const p = (await google.verifyIdToken({ idToken: req.body.id_token, audience: GID })).getPayload();
    const nonce = cookieOf(req, 'gn');
    if (!nonce || p.nonce !== nonce) return back('This sign-in expired.');
    if (!p.email || !p.email_verified) return back('Your Google email is not verified.');
    const u = await userFor({ email: p.email, name: p.name || p.email.split('@')[0], googleId: p.sub, avatar: p.picture });
    const code = crypto.randomBytes(24).toString('hex');
    appCodes.set(code, { token: sign(u), user: pub(u), exp: Date.now() + 120000 });
    for (const [k, v] of appCodes) if (v.exp < Date.now()) appCodes.delete(k);
    const link = `${APP_SCHEME}://auth?c=${code}`;
    res.setHeader('Set-Cookie', 'gn=; Max-Age=0; Path=/auth/google; HttpOnly; SameSite=None; Secure');
    res.send(page('Signed in', `<h2>You are signed in</h2><p>Returning to the app…</p><p><a style="color:#9CFF57" href="${link}">Tap here if it does not open</a></p><script>location.replace(${JSON.stringify(link)})</script>`));
  } catch (e) { console.error(e.message); back('Google sign-in could not be verified.'); }
});

app.post('/api/auth/app-exchange', limit(30, 600000), wrap(async (req, res) => {
  const c = appCodes.get(String(req.body.code || ''));
  appCodes.delete(String(req.body.code || ''));
  if (!c || c.exp < Date.now()) throw fail(401, 'Sign-in expired. Please try again.');
  res.json({ token: c.token, user: c.user });
}));

/* ---------- playlists (each belongs to one signed-in user) ---------- */
const plSql = `SELECT p.id, p.name, COALESCE(array_agg(pt.track_id ORDER BY pt.pos, pt.added_at) FILTER (WHERE pt.track_id IS NOT NULL), '{}') AS tracks
  FROM playlists p LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id`;
const myPlaylist = async (req) => {
  const p = (await q('SELECT id, name FROM playlists WHERE id=$1 AND user_id=$2', [+req.params.id, req.user.id])).rows[0];
  if (!p) throw fail(404, 'Playlist not found.');
  return p;
};
app.get('/api/playlists', auth(), wrap(async (req, res) => res.json((await q(plSql + ' WHERE p.user_id=$1 GROUP BY p.id ORDER BY p.updated_at DESC, p.id DESC', [req.user.id])).rows)));
app.post('/api/playlists', auth(), limit(40, 600000), wrap(async (req, res) => {
  const name = text((req.body || {}).name, 60, 'The playlist name', true);
  if ((await q('SELECT count(*)::int n FROM playlists WHERE user_id=$1', [req.user.id])).rows[0].n >= 60) throw fail(400, 'You can have up to 60 playlists.');
  const p = (await q('INSERT INTO playlists(user_id,name) VALUES($1,$2) RETURNING id,name', [req.user.id, name])).rows[0];
  res.json({ ...p, tracks: [] });
}));
app.patch('/api/playlists/:id', auth(), wrap(async (req, res) => {
  await myPlaylist(req);
  const name = text((req.body || {}).name, 60, 'The playlist name', true);
  await q('UPDATE playlists SET name=$1, updated_at=now() WHERE id=$2', [name, +req.params.id]);
  res.json({ ok: true, name });
}));
app.delete('/api/playlists/:id', auth(), wrap(async (req, res) => { await myPlaylist(req); await q('DELETE FROM playlists WHERE id=$1', [+req.params.id]); res.json({ ok: true }); }));
app.post('/api/playlists/:id/tracks', auth(), limit(200, 600000), wrap(async (req, res) => {
  await myPlaylist(req);
  const tid = whole((req.body || {}).track_id, 1, 2147483647, 'The song');
  if (!tid || !(await q("SELECT 1 FROM tracks WHERE id=$1 AND status='published'", [tid])).rows[0]) throw fail(404, 'Song not found.');
  const n = (await q('SELECT count(*)::int n, COALESCE(max(pos),0) m FROM playlist_tracks WHERE playlist_id=$1', [+req.params.id])).rows[0];
  if (n.n >= 500) throw fail(400, 'A playlist can hold up to 500 songs.');
  await q('INSERT INTO playlist_tracks(playlist_id,track_id,pos) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [+req.params.id, tid, n.m + 1]);
  await q('UPDATE playlists SET updated_at=now() WHERE id=$1', [+req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/playlists/:id/tracks/:tid', auth(), wrap(async (req, res) => {
  await myPlaylist(req);
  await q('DELETE FROM playlist_tracks WHERE playlist_id=$1 AND track_id=$2', [+req.params.id, +req.params.tid]);
  await q('UPDATE playlists SET updated_at=now() WHERE id=$1', [+req.params.id]);
  res.json({ ok: true });
}));

app.get('/api/me', auth(), wrap(async (req, res) => {
  const u = (await q('SELECT * FROM users WHERE id=$1', [req.user.id])).rows[0];
  if (!u) throw fail(401, 'Please sign in again.');
  const likes = (await q('SELECT track_id FROM likes WHERE user_id=$1 ORDER BY liked_at DESC', [u.id])).rows.map(r => r.track_id);
  const bookings = (await q(`SELECT b.id,b.kind,b.date::text,b.slot,b.status,s.name AS service FROM bookings b LEFT JOIN services s ON s.id=b.service_id
    WHERE b.user_id=$1 ORDER BY b.date DESC, b.slot DESC LIMIT 20`, [u.id])).rows;
  res.json({ user: pub(u), likes, bookings });
}));

app.post('/api/tracks/:id/like', auth(), wrap(async (req, res) => {
  const id = +req.params.id;
  if (!(await q('SELECT 1 FROM tracks WHERE id=$1', [id])).rows[0]) throw fail(404, 'Song not found.');
  const del = await q('DELETE FROM likes WHERE user_id=$1 AND track_id=$2', [req.user.id, id]);
  if (del.rowCount) await q('UPDATE tracks SET likes=GREATEST(likes-1,0) WHERE id=$1', [id]);
  else { await q('INSERT INTO likes VALUES($1,$2)', [req.user.id, id]); await q('UPDATE tracks SET likes=likes+1 WHERE id=$1', [id]); }
  res.json({ liked: !del.rowCount });
}));

/* ---------- bookings (studio sessions and lessons) ---------- */
app.get('/api/bookings/taken', wrap(async (req, res) => {
  const r = await q("SELECT slot FROM bookings WHERE kind=$1 AND date=$2 AND status<>'cancelled'", [req.query.kind === 'lesson' ? 'lesson' : 'studio', req.query.date]);
  res.json(r.rows.map(x => x.slot));
}));

app.post('/api/bookings', auth(), limit(10, 600000), wrap(async (req, res) => {
  const { service_id, date, slot, name = '', phone = '', email = '', notes = '' } = req.body;
  const s = (await q('SELECT * FROM services WHERE id=$1 AND active', [service_id])).rows[0];
  if (!s) throw fail(400, 'Pick a service.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !slot) throw fail(400, 'Pick a day and time.');
  if (new Date(date + 'T23:59:59') < new Date()) throw fail(400, 'That day has already passed.');
  if (name.trim().length < 2) throw fail(400, 'Enter your name.');
  if (phone.replace(/\D/g, '').length < 9) throw fail(400, 'Enter a phone number we can reach you on.');
  try {
    const b = (await q('INSERT INTO bookings(service_id,kind,user_id,name,phone,email,date,slot,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [s.id, s.kind, req.user.id, name.trim(), phone.trim(), email.trim() || null, date, slot, notes.slice(0, 500)])).rows[0];
    res.json({ ok: true, id: b.id });
  } catch (e) { if (e.code === '23505') throw fail(409, 'That time was just taken. Pick another slot.'); throw e; }
}));

/* ---------- admin ---------- */
const RES = {
  tracks: ['title', 'artist_id', 'genre', 'link', 'artwork', 'palette', 'duration', 'bpm', 'bpm_source', 'tags', 'featured', 'status', 'release_date'],
  artists: ['name', 'genre', 'bio', 'image', 'instagram', 'palette', 'status'],
  videos: ['title', 'subtitle', 'url', 'parts', 'poster', 'track_id', 'sort', 'status'],
  services: ['kind', 'name', 'description', 'price', 'duration_min', 'active', 'sort']
};
const clean = v => (v === '' ? null : v);

/* ---------- checks on everything the admin saves, so bad data can never reach the app ---------- */
const isUrl = v => { try { return /^https?:$/.test(new URL(String(v)).protocol); } catch { return false; } };
const isMedia = v => /^\/?(uploads|videos|images|icons)\/[\w./-]+$/.test(v) || isUrl(v);
const text = (v, max, what, required) => { v = v == null ? '' : String(v).trim(); if (required && !v) throw fail(400, `${what} is required.`); if (v.length > max) throw fail(400, `${what} is too long (limit ${max} characters).`); return v || null; };
const whole = (v, lo, hi, what) => { if (v === '' || v == null) return null; const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) throw fail(400, `${what} must be a number from ${lo} to ${hi}.`); return Math.round(n); };
const media = (v, what) => { v = text(v, 1000, what); if (v && !isMedia(v)) throw fail(400, `${what} must be a web address starting with http:// or https://, or an uploaded file.`); return v; };
const oneOf = (v, list, what) => { if (!list.includes(v)) throw fail(400, `${what} must be one of: ${list.join(', ')}.`); return v; };
const colors = v => (Array.isArray(v) ? v.map(String).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 3) : []);
const VALIDATE = {
  tracks: (b, full) => {
    const o = { ...b };
    if (full || 'title' in b) o.title = text(b.title, 200, 'The song title', true);
    if ('link' in b) { o.link = text(b.link, 1000, 'The listening link'); if (o.link && !isMedia(o.link) && !/^spotify:track:\w+$/.test(o.link)) throw fail(400, 'The listening link must start with http:// or https://, or be an uploaded file.'); }
    if ('artwork' in b) o.artwork = media(b.artwork, 'The artwork');
    if ('genre' in b) o.genre = text(b.genre, 60, 'The genre');
    if ('bpm' in b) o.bpm = whole(b.bpm, 30, 300, 'BPM');
    if ('duration' in b) o.duration = whole(b.duration, 0, 36000, 'The duration');
    if ('artist_id' in b) o.artist_id = whole(b.artist_id, 1, 2147483647, 'The artist');
    if ('status' in b) o.status = oneOf(b.status, ['published', 'draft'], 'Status');
    if ('tags' in b) { if (!Array.isArray(b.tags)) throw fail(400, 'Tags must be a list.'); o.tags = [...new Set(b.tags.map(x => String(x).trim().toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 20); }
    if ('palette' in b) o.palette = colors(b.palette);
    if ('release_date' in b && b.release_date) { if (isNaN(Date.parse(b.release_date))) throw fail(400, 'The release date is not valid.'); }
    return o;
  },
  artists: (b, full) => {
    const o = { ...b };
    if (full || 'name' in b) o.name = text(b.name, 120, 'The artist name', true);
    if ('genre' in b) o.genre = text(b.genre, 60, 'The genre');
    if ('bio' in b) o.bio = text(b.bio, 3000, 'The bio');
    if ('image' in b) o.image = media(b.image, 'The photo');
    if ('instagram' in b) o.instagram = text(b.instagram, 120, 'The Instagram handle');
    if ('palette' in b) o.palette = colors(b.palette);
    if ('status' in b) o.status = oneOf(b.status, ['active', 'hidden', 'draft', 'published'], 'Status');
    return o;
  },
  videos: (b, full) => {
    const o = { ...b };
    if (full || 'title' in b) o.title = text(b.title, 200, 'The video title', true);
    if ('subtitle' in b) o.subtitle = text(b.subtitle, 300, 'The subtitle');
    if (full || 'url' in b) { o.url = media(b.url, 'The video link'); if (!o.url) throw fail(400, 'The video link is required.'); }
    if ('poster' in b) o.poster = media(b.poster, 'The cover image');
    if ('parts' in b) o.parts = whole(b.parts, 1, 30, 'Parts');
    if ('track_id' in b) o.track_id = whole(b.track_id, 1, 2147483647, 'The linked song');
    if ('sort' in b) o.sort = whole(b.sort, -100000, 100000, 'Order');
    if ('status' in b) o.status = oneOf(b.status, ['published', 'draft'], 'Status');
    return o;
  },
  services: (b, full) => {
    const o = { ...b };
    if (full || 'name' in b) o.name = text(b.name, 120, 'The service name', true);
    if ('kind' in b) o.kind = text(b.kind, 30, 'The type', true);
    if ('description' in b) o.description = text(b.description, 1000, 'The description');
    if ('price' in b) o.price = b.price === '' || b.price == null ? 0 : (() => { const n = Number(b.price); if (!Number.isFinite(n) || n < 0 || n > 1e9) throw fail(400, 'The price must be zero or more.'); return n; })();
    if ('duration_min' in b) o.duration_min = whole(b.duration_min, 5, 1440, 'The length in minutes');
    if ('sort' in b) o.sort = whole(b.sort, -100000, 100000, 'Order');
    return o;
  }
};

/* ---------- automatic BPM ----------
   New or edited songs without a BPM are measured in the background (audio-file links), or looked up in Deezer. */
const bpmQueue = [], bpmLog = []; let bpmBusy = false;
const logBpm = (id, title, r) => { bpmLog.unshift({ id, title, bpm: r.bpm || null, source: r.source || null, notes: r.notes || [], at: Date.now() }); bpmLog.length = Math.min(bpmLog.length, 150); };
function queueBpm(id) { if (!bpmQueue.includes(id)) { bpmQueue.push(id); runBpm(); } }
async function runBpm() {
  if (bpmBusy) return; bpmBusy = true;
  try {
    while (bpmQueue.length) {
      const id = bpmQueue.shift();
      try {
        const t = (await q('SELECT t.id,t.title,t.link,t.bpm,a.name AS artist FROM tracks t LEFT JOIN artists a ON a.id=t.artist_id WHERE t.id=$1', [id])).rows[0];
        if (!t || t.bpm || !t.link) continue;
        const r = await detectTrack(t);
        logBpm(id, t.title, r);
        if (r.bpm) await q('UPDATE tracks SET bpm=$1,bpm_source=$2,bpm_checked=now() WHERE id=$3 AND bpm IS NULL', [r.bpm, r.source, id]);
        else await q('UPDATE tracks SET bpm_checked=now() WHERE id=$1', [id]);
      } catch (e) { console.error('BPM detection failed for song', id, e.message); }
    }
  } finally { bpmBusy = false; }
}

app.get('/api/admin/stats', admin, wrap(async (req, res) => {
  const days = [7, 30, 90].includes(+req.query.days) ? +req.query.days : 7;
  const one = async (sql) => (await q(sql)).rows[0];
  const [c, top, daily, pending] = await Promise.all([
    one(`SELECT (SELECT count(*)::int FROM tracks) tracks,(SELECT count(*)::int FROM artists) artists,(SELECT count(*)::int FROM users) users,
      (SELECT COALESCE(sum(plays),0)::int FROM tracks) plays,(SELECT count(*)::int FROM bookings WHERE status='pending') pending,
      (SELECT count(*)::int FROM plays WHERE at > now()-interval '7 days') plays7,
      (SELECT COALESCE(sum(views),0)::int FROM videos) views,(SELECT count(*)::int FROM videos) videos,(SELECT count(*)::int FROM bookings) bookings`),
    q(trackSql + ' ORDER BY t.plays DESC LIMIT 5'),
    q("SELECT to_char(d, CASE WHEN $1::int<=7 THEN 'Dy' ELSE 'DD Mon' END) AS day, COALESCE(n,0)::int AS n FROM generate_series(current_date-($1::int-1),current_date,'1 day') d LEFT JOIN (SELECT at::date AS dd, count(*) n FROM plays GROUP BY 1) p ON p.dd=d ORDER BY d", [days]),
    q("SELECT b.id,b.name,b.kind,b.date::text,b.slot,s.name AS service FROM bookings b LEFT JOIN services s ON s.id=b.service_id WHERE b.status='pending' ORDER BY b.date,b.slot LIMIT 6")]);
  res.json({ counts: c, top: top.rows, daily: daily.rows, pending: pending.rows });
}));

app.get('/api/admin/bookings', admin, wrap(async (_req, res) => res.json((await q(`SELECT b.id,b.kind,b.name,b.phone,b.email,b.date::text,b.slot,b.notes,b.status,s.name AS service
  FROM bookings b LEFT JOIN services s ON s.id=b.service_id ORDER BY b.date DESC, b.slot DESC LIMIT 300`)).rows)));
app.patch('/api/admin/bookings/:id', admin, wrap(async (req, res) => {
  if (!['pending', 'confirmed', 'done', 'cancelled'].includes(req.body.status)) throw fail(400, 'Bad status.');
  await q('UPDATE bookings SET status=$1 WHERE id=$2', [req.body.status, +req.params.id]); res.json({ ok: true });
}));

app.get('/api/admin/users', admin, wrap(async (_req, res) => res.json((await q('SELECT id,name,email,role,created_at FROM users ORDER BY id DESC LIMIT 500')).rows)));
app.patch('/api/admin/users/:id', admin, wrap(async (req, res) => {
  if (!['user', 'admin'].includes(req.body.role)) throw fail(400, 'Bad role.');
  if (+req.params.id === req.user.id) throw fail(400, 'You cannot change your own role.');
  await q('UPDATE users SET role=$1 WHERE id=$2', [req.body.role, +req.params.id]); res.json({ ok: true });
}));

app.get('/api/admin/settings', admin, wrap(async (_req, res) => res.json(Object.fromEntries((await q('SELECT key,value FROM settings')).rows.map(r => [r.key, r.value])))));
app.put('/api/admin/settings', admin, wrap(async (req, res) => {
  for (const [k, v] of Object.entries(req.body)) if (/^[a-z_]{2,40}$/.test(k)) await q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2', [k, String(v ?? '')]);
  res.json({ ok: true });
}));

app.get('/api/admin/link-info', admin, wrap(async (req, res) => {
  try { res.json(await info(String(req.query.url || ''))); } catch (e) { throw fail(400, e.message); }
}));

/* Measure a song's BPM: from a pasted link, from an audio file the admin picks (not stored), or measure everything that is missing */
app.post('/api/admin/bpm/link', admin, wrap(async (req, res) => {
  const b = req.body || {};
  res.json(await detectTrack({ link: String(b.link || ''), artist: String(b.artist || ''), title: String(b.title || '') }));
}));
app.post('/api/admin/bpm/file', ...admin, express.raw({ type: () => true, limit: '40mb' }), wrap(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw fail(400, 'The file was empty.');
  try { const r = await fromBuffer(req.body); res.json({ bpm: r.bpm, confidence: r.confidence, source: 'file', notes: [] }); }
  catch (e) { throw fail(400, e.message); }
}));
app.get('/api/admin/bpm/status', admin, wrap(async (_req, res) => res.json({ pending: bpmQueue.length + (bpmBusy ? 1 : 0), busy: bpmBusy, log: bpmLog })));
app.post('/api/admin/bpm/missing', admin, wrap(async (_req, res) => {
  const ids = (await q('SELECT id FROM tracks WHERE bpm IS NULL AND link IS NOT NULL ORDER BY id')).rows.map(r => r.id);
  ids.forEach(queueBpm);
  res.json({ queued: ids.length });
}));

const UP = path.join(__dirname, '..', 'public', 'uploads');
const EXT = { jpg: 8, jpeg: 8, png: 8, webp: 8, gif: 8, mp4: 250, webm: 250, mov: 250, mp3: 60, m4a: 60, aac: 60, ogg: 60, wav: 80, flac: 80 };
app.post('/api/admin/upload', ...admin, express.raw({ type: () => true, limit: '250mb' }), wrap(async (req, res) => {
  const ext = String(req.query.name || '').split('.').pop().toLowerCase();
  if (!EXT[ext]) throw fail(400, 'Use a jpg, png, webp, gif, mp4, webm, mov, mp3, m4a, wav, ogg or flac file.');
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw fail(400, 'The file was empty.');
  if (req.body.length > EXT[ext] * 1024 * 1024) throw fail(400, `That file is too big (limit ${EXT[ext]} MB).`);
  fs.mkdirSync(UP, { recursive: true });
  const name = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UP, name), req.body);
  res.json({ url: 'uploads/' + name });
}));

app.get('/api/admin/:res', admin, wrap(async (req, res) => {
  const r = req.params.res; if (!RES[r]) throw fail(404, 'Not found.');
  const rows = r === 'tracks' ? (await q(trackSql + ' ORDER BY t.id DESC')).rows.map(withPlatform) : (await q(`SELECT * FROM ${r} ORDER BY ${r === 'services' ? 'kind, sort, id' : r === 'videos' ? 'sort, id' : 'id DESC'}`)).rows;
  res.json(rows);
}));
app.post('/api/admin/:res', admin, wrap(async (req, res) => {
  const r = req.params.res, cols = RES[r]; if (!cols) throw fail(404, 'Not found.');
  const body = VALIDATE[r] ? VALIDATE[r](req.body || {}, true) : req.body || {};
  const keys = cols.filter(c => c in body);
  const row = (await q(`INSERT INTO ${r}(${keys.join(',')}) VALUES(${keys.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`, keys.map(k => clean(body[k])))).rows[0];
  if (r === 'tracks') queueBpm(row.id);
  res.json(row);
}));
app.put('/api/admin/:res/:id', admin, wrap(async (req, res) => {
  const r = req.params.res, cols = RES[r]; if (!cols) throw fail(404, 'Not found.');
  const body = VALIDATE[r] ? VALIDATE[r](req.body || {}, false) : req.body || {};
  const keys = cols.filter(c => c in body);
  if (keys.length) await q(`UPDATE ${r} SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')} WHERE id=$${keys.length + 1}`, [...keys.map(k => clean(body[k])), +req.params.id]);
  if (r === 'tracks' && (keys.includes('link') || keys.includes('bpm'))) queueBpm(+req.params.id);
  res.json({ ok: true });
}));
app.delete('/api/admin/:res/:id', admin, wrap(async (req, res) => {
  if (!RES[req.params.res]) throw fail(404, 'Not found.');
  await q(`DELETE FROM ${req.params.res} WHERE id=$1`, [+req.params.id]); res.json({ ok: true });
}));

/* ---------- static + start ---------- */
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
/* Optional: only needed if you ever switch back to a Trusted Web Activity app. The current app does not use it. */
app.get('/.well-known/assetlinks.json', (_req, res) => {
  const pkg = process.env.ANDROID_PACKAGE, fp = (process.env.ANDROID_SHA256 || '').split(',').map(s => s.trim()).filter(Boolean);
  res.json(pkg && fp.length ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fp } }] : []);
});
app.use((err, _req, res, next) => {
  if (!err) return next();
  // our own deliberate errors (rate limit, sign-in, ...) keep their message; broken requests get a plain one
  if (err.status && !err.type) return res.status(err.status).json({ error: err.status < 500 ? err.message : 'Server error' });
  res.status(err.status && err.status < 500 ? err.status : 400).json({ error: err.type === 'entity.too.large' ? 'That request is too large.' : 'That request was not understood.' });
});
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], setHeaders: (res, f) => { if (/sw\.js$/.test(f)) res.setHeader('Cache-Control', 'no-cache'); } }));

(async () => {
  if (!process.env.DATABASE_URL) { console.error('\nDATABASE_URL is missing. Open .env and paste your Neon connection string.\n'); process.exit(1); }
  try { await init(); } catch (e) { console.error('\nCould not set up the database:', e.message, '\nCheck DATABASE_URL in .env.\n'); process.exit(1); }
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && !(await q('SELECT 1 FROM users WHERE email=$1', [process.env.ADMIN_EMAIL.toLowerCase()])).rows[0]) {
    await q("INSERT INTO users(name,email,password_hash,role) VALUES('Admin',$1,$2,'admin')", [process.env.ADMIN_EMAIL.toLowerCase(), await bcrypt.hash(process.env.ADMIN_PASSWORD, 11)]);
    console.log('Admin account created for', process.env.ADMIN_EMAIL);
  }
  /* a while after start-up, measure songs that still have no BPM (each song is retried at most once a week) */
  setTimeout(async () => {
    try { (await q("SELECT id FROM tracks WHERE bpm IS NULL AND link IS NOT NULL AND (bpm_checked IS NULL OR bpm_checked < now()-interval '7 days') ORDER BY id LIMIT 60")).rows.forEach(r => queueBpm(r.id)); } catch (e) { console.error(e.message); }
  }, 20000);
  app.listen(PORT, () => console.log(`\nChase X Records is running:\n  App    http://localhost:${PORT}\n  Admin  http://localhost:${PORT}/admin\n`));
})();

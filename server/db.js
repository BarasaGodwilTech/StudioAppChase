const { Pool } = require('pg');
const url = process.env.DATABASE_URL || '';
const local = /localhost|127\.0\.0\.1/.test(url);
const pool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 8 });
const q = (text, params) => pool.query(text, params);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT,
  google_id TEXT UNIQUE, avatar TEXT, role TEXT NOT NULL DEFAULT 'user', created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS artists(
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, genre TEXT, bio TEXT, image TEXT, instagram TEXT,
  palette TEXT[] DEFAULT '{}', status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS tracks(
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, artist_id INT REFERENCES artists(id) ON DELETE SET NULL,
  genre TEXT, link TEXT, artwork TEXT, palette TEXT[] DEFAULT '{}', duration INT DEFAULT 0, bpm INT,
  tags TEXT[] DEFAULT '{}', featured BOOLEAN DEFAULT false, status TEXT DEFAULT 'published',
  release_date DATE DEFAULT CURRENT_DATE, plays INT DEFAULT 0, likes INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS videos(
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT, url TEXT, parts TEXT[] DEFAULT '{}', poster TEXT,
  track_id INT REFERENCES tracks(id) ON DELETE SET NULL, sort INT DEFAULT 0, status TEXT DEFAULT 'published', views INT DEFAULT 0);
CREATE TABLE IF NOT EXISTS services(
  id SERIAL PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'studio', name TEXT NOT NULL, description TEXT,
  price INT DEFAULT 0, duration_min INT DEFAULT 60, active BOOLEAN DEFAULT true, sort INT DEFAULT 0);
CREATE TABLE IF NOT EXISTS bookings(
  id SERIAL PRIMARY KEY, service_id INT REFERENCES services(id) ON DELETE SET NULL, kind TEXT NOT NULL,
  user_id INT REFERENCES users(id) ON DELETE SET NULL, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
  date DATE NOT NULL, slot TEXT NOT NULL, notes TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot_once ON bookings(kind, date, slot) WHERE status <> 'cancelled';
CREATE TABLE IF NOT EXISTS likes(user_id INT REFERENCES users(id) ON DELETE CASCADE, track_id INT REFERENCES tracks(id) ON DELETE CASCADE, PRIMARY KEY(user_id, track_id));
CREATE TABLE IF NOT EXISTS plays(id BIGSERIAL PRIMARY KEY, track_id INT REFERENCES tracks(id) ON DELETE CASCADE, at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
`;

async function init() {
  await q(SCHEMA);
  await q('ALTER TABLE likes ADD COLUMN IF NOT EXISTS liked_at TIMESTAMPTZ DEFAULT now()');
  await q("UPDATE videos SET subtitle='Chase X Records' WHERE subtitle='Chase X - 3 parts'");
  const { rows } = await q('SELECT count(*)::int AS n FROM tracks');
  if (rows[0].n === 0) await seed();
}

async function seed() {
  const art = async (n, g, b, p) => (await q('INSERT INTO artists(name,genre,bio,palette) VALUES($1,$2,$3,$4) RETURNING id', [n, g, b, p])).rows[0].id;
  const cx = await art('Chase X', 'Afro-Pop', 'Producer and artist behind Chase X Records.', ['#3BFF8A', '#0A6B42', '#FFB224']);
  const vc = await art('Vibe Collective', 'R&B', 'A collective of voices produced at Chase X Records.', ['#12C26E', '#06382A', '#FFD86B']);
  const ki = await art('Kito', 'Electronic', 'Electronic producer working out of the studio.', ['#0A6B42', '#3BFF8A', '#FFFFFF']);
  const tr = async (t, a, g, bpm, tags, pal, feat) => (await q(
    'INSERT INTO tracks(title,artist_id,genre,bpm,tags,palette,featured) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [t, a, g, bpm, tags, pal, feat])).rows[0].id;
  const blessed = await tr('Blessed', cx, 'Afro-Pop', 104, ['new'], ['#3BFF8A', '#0A6B42', '#FFB224'], true);
  await tr('Evening Run', cx, 'R&B', 128, ['workout'], ['#FFB224', '#FF6B35', '#FF4D8D'], true);
  await tr('Lagos Nights', vc, 'Afro-Pop', 112, [], ['#12C26E', '#06382A', '#FFD86B'], true);
  await tr('Golden Hour', cx, 'Hip-Hop', 140, ['workout'], ['#FFD86B', '#FF6B35', '#12C26E'], false);
  await tr('Neon Tide', ki, 'Electronic', 150, ['workout'], ['#0A6B42', '#3BFF8A', '#FFFFFF'], false);
  await tr('Late Session', vc, 'R&B', 92, [], ['#FF4D8D', '#0C1310', '#3BFF8A'], false);
  await q(`INSERT INTO videos(title,subtitle,parts,poster,track_id,sort) VALUES('Blessed - Official Video','Chase X Records',$1,'videos/poster-1.jpg',$2,0)`,
    [['videos/blessed-1.mp4', 'videos/blessed-2.mp4', 'videos/blessed-3.mp4'], blessed]);
  const sv = (k, n, d, p, m, s) => q('INSERT INTO services(kind,name,description,price,duration_min,sort) VALUES($1,$2,$3,$4,$5,$6)', [k, n, d, p, m, s]);
  await sv('studio', 'Recording', 'Vocals and instruments', 0, 60, 1);
  await sv('studio', 'Mixing', 'Balance every layer', 0, 60, 2);
  await sv('studio', 'Mastering', 'Release-ready polish', 0, 60, 3);
  await sv('studio', 'Production', 'Beats to full tracks', 0, 120, 4);
  await sv('lesson', 'Vocal coaching', 'Technique, breath and performance', 0, 60, 1);
  await sv('lesson', 'Music production', 'Learn to build beats and arrange songs', 0, 90, 2);
  await sv('lesson', 'Songwriting', 'Hooks, structure and lyrics', 0, 60, 3);
  const st = (k, v) => q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING', [k, v]);
  await st('hero_title', 'Blessed'); await st('hero_sub', 'Chase X Records. Where sound meets vision.');
  await st('hero_track', String(blessed)); await st('contact_whatsapp', ''); await st('contact_email', '');
  await st('slots', '10:00,12:00,14:00,16:00,18:00,20:00'); await st('channel_url', 'https://www.youtube.com/@chasex1113');
}

module.exports = { pool, q, init };

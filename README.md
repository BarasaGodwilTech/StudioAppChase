# Chase X Records app

Mobile-first music app (your redesign) with a link-based music library, Postgres on Neon, Google sign-in, studio and lesson booking, a floating (picture-in-picture) player and a full admin panel.

## First run (Windows)
1. Install Node.js LTS from https://nodejs.org
2. Double-click **start.bat**. The first time it creates `.env` and opens it in Notepad.
3. Fill in `.env`:
   - `DATABASE_URL`: Neon dashboard > your project > Connect > copy the connection string
   - `JWT_SECRET`: any long random text
   - `GOOGLE_CLIENT_ID`: see below (can be added later)
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD`: your admin login
4. Double-click **start.bat** again. It installs packages, creates all tables in Neon, adds starter content and opens http://localhost:3000
5. Admin panel: http://localhost:3000/admin (also reachable from You > Open admin panel when signed in as admin)

## Adding music (links, not files)
Admin > Songs > Add song > paste the streaming link.
| Link type | Plays inside the app | Notes |
|---|---|---|
| YouTube | Yes | Counts as a view on YouTube |
| Spotify track | Yes | Visitors not logged into Spotify in their browser get 30-second previews (Spotify's rule) |
| SoundCloud | Yes | |
| Direct .mp3/.m4a link | Yes | |
| Audiomack, Apple Music, Boomplay, others | No | Shows an "Open on ..." button instead (these platforms do not allow controlling their player) |

A play is counted in your own stats after 20 seconds of listening. Add the tag `workout` to a song to list it on the Workout page. Artists you produce for get their own page (Admin > Artists).

## Admin panel (/admin)
- **Songs:** paste a link and the title, artist, artwork and length are read for you (YouTube, Spotify, SoundCloud, Apple Music, direct mp3; other sites use their page tags). Artists are matched or created automatically. **Add many** takes one link per line.
- **Videos:** add a YouTube or direct .mp4 link, or upload your own file(s). Several uploaded files play one after another. Order with the arrows. The first video is the Home "Watch video" one.
- **Artists, Bookings, Services & pricing, Reports (CSV downloads), Users (make admin), Settings** (Home text, contact, social links, booking times).
- Uploaded files are saved in `public/uploads/` on the machine running the server. Hosts like Railway wipe local files on redeploy unless you attach a volume, so for a live site prefer links for videos and artwork.

## Google sign-in
1. https://console.cloud.google.com > APIs & Services > Credentials > Create credentials > OAuth client ID > Web application
2. Authorized JavaScript origins: `http://localhost:3000` and your live domain later
3. Copy the Client ID into `GOOGLE_CLIENT_ID` in `.env`, restart. The button is Google's own official one, so the logo is correct.

## Floating player (PiP)
Picture-in-picture icon at the top right of the full player. Document PiP works in Chrome and Edge on computers. If "Floating player when I leave the tab" is on in You > settings, it opens when you switch tabs while music plays. Phones use the lock-screen controls instead.

## Put it online (needed before the APK)
The phone cannot reach `localhost`, so the server must be online with https.
1. Push this folder to GitHub, then create a project on Railway (or Render) from that repo. Start command: `npm start`.
2. Add the same variables as `.env` in the host's settings (`DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`). Do not upload `.env` itself.
3. Open the https address the host gives you. On Chrome for Android the menu should offer "Install app".
4. Add that address to Google's **Authorized JavaScript origins**.
5. Uploads (`public/uploads`) are wiped on redeploy unless you attach a volume, so use links for videos and artwork on the live site.

## Android app (real app, no browser bar)
The folder `android/` is a native Android app that shows your live site in its own full-screen window. It does not use Chrome, so the domain/share bar can never appear, and it needs no fingerprint setup.
1. GitHub repo > Settings > Secrets and variables > Actions > **Variables**: `SITE_URL` = your https address (for example `https://studioappchase.onrender.com`).
2. Actions tab > **Build Android app** > Run workflow. Download `chase-x-app` and install the APK.
3. **Google sign-in in the app:** in Google Cloud Console > Credentials > your Web client > *Authorized redirect URIs*, add `https://YOUR-SITE/auth/google/callback` (for example `https://studioappchase.onrender.com/auth/google/callback`). Email sign-in works without this.

Optional, for updating the app over an old install and for Google Play: run **Create signing key (run once)**, save `KEY_PASSWORD` and `KEYSTORE_BASE64` as secrets (see the workflow), and builds become signed releases. Without them you get a test-signed APK that still installs and looks identical. `ANDROID_PACKAGE` / `ANDROID_SHA256` are no longer needed.

## Website and app layouts
One codebase, three layouts: phones get the bottom navigation (always visible), tablets get a slim left sidebar, and desktops get a full sidebar with your library (Liked songs, recently played), wide content grids and a Spotify-style player bar at the bottom. Likes and bookings need an account; browsing and listening do not. Streams are counted after about 30 seconds of listening.
The Android app shows the live website, so these changes reach the app automatically after you redeploy. No new APK is needed.

## Background music (Android app)
While a song plays, the app runs a media service: music keeps going with the screen off or the app closed with Back, and the lock screen and notification show play / pause / next / previous. Android 13+ asks once for notification permission the first time you play. Add `CONTACT_EMAIL` on Render to show your email on the privacy page at `/privacy`. This needs a new APK build.

## Automatic BPM and the Workout page
- Songs at or above the BPM limit (default 100, change it in Admin > Settings > Workout page) show on the Workout page by themselves. Tag a song `workout` to always include it, or `no-workout` to keep it off.
- A song with no BPM is measured in the background after you save it, and again a little after the server starts:
  - **Link to an audio file** (.mp3, .wav, .ogg, .m4a): the server downloads it and measures the tempo.
  - **Anything else:** the Deezer music database is checked by artist and title.
  - **YouTube, Spotify and SoundCloud links cannot be measured** (they do not share their audio, and Spotify removed its tempo data). For those, open the song in Admin and use **From file** (pick your own copy of the song; it is measured and not stored) or **Tap** (tap along to the beat), then Save.
- Admin > Songs > **Detect BPMs** measures every song that has none. A small "auto" label shows which BPMs were measured for you.
- Accuracy: slow songs can be read as double speed by this kind of detector, so readings above 165 are halved. A real 170+ BPM song (drum and bass) will read as half, so type its real BPM in.

## Offline, playlists and the floating player
- **Saved offline:** songs that are audio files (an mp3 you upload in Admin, or a link to a file on a host that allows it) are kept on the device when played (up to 40 songs / 300 MB, switch in You > settings) and can be saved on purpose with the ⋯ menu, the player, a playlist or Liked songs. Saved songs play with no signal. YouTube, Spotify and SoundCloud songs cannot be saved offline: those services do not allow it.
- **Playlists:** sign in, then tap ⋯ on any song > Add to playlist. Playlists are stored in your account and show in the sidebar on tablets and desktops.
- **App data stays fresh:** the app checks for admin changes every minute and whenever you come back to it. The service worker caches the app so it opens offline, and updates apply as soon as you are online.
- **Admin saves are checked:** links, BPM, status, tags and so on are validated on the server, so a typo can never break the app.
- **Floating player (Android app):** the floating-player button, or leaving the app while music plays (setting: "Floating player when I leave the app"), shrinks the app to a small cover + title window with previous / play / next buttons. This needs a new APK build.
- **Spotify in the app:** full songs need Spotify's protected playback (now allowed for Spotify only) and a Spotify sign-in inside the app. Without a sign-in Spotify itself limits embeds to 30-second previews. Previews that end now move on to the next song and still count as a stream.
- **Audio hosting note:** files uploaded in Admin are stored on the server's disk. On Render's free plan that disk is cleared when you redeploy, so re-upload after a deploy (or add a Render persistent disk).

## Measuring BPM from YouTube, Spotify and SoundCloud links
Admin > Songs > **Detect BPMs** measures what it can (audio files, Deezer), then shows every song that is still missing a BPM with the reason. For YouTube, SoundCloud and Spotify links the **Listen** button (or "Measure by listening" for all of them) plays the link in the admin page and works the tempo out from the sound. It needs desktop Chrome or Edge: choose **This tab** and tick **Also share tab audio** when the browser asks. Nothing is recorded or saved. If a video starts with an advert or a long intro, check the result by ear.

## Background BPM listening (Admin > Songs)
Turn on **Background listening** once per visit and choose **This tab** + **Also share tab audio** when the browser asks. A hidden, silent player then measures every YouTube, SoundCloud and Spotify song that has no BPM, one after another, and picks up new songs you add within a minute. A small chip at the bottom left shows progress; **Stop** turns it off. Keep the admin page open (it can be minimised or on a spare computer). Browsers do not allow a website to listen to other sites without this one-time permission, so it cannot run with the admin page closed. Songs it cannot measure are skipped and retried after 24 hours; check a few results by ear.

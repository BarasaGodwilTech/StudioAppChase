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

## Make the Android APK
Use a Trusted Web Activity. It opens your live site inside Chrome with no address bar, so Google sign-in works (Google blocks sign-in inside ordinary app web views).
1. Go to https://www.pwabuilder.com, enter your https address and press Start.
2. Choose **Package for stores > Android**. Pick a package id such as `com.chasexrecords.app`, keep the name "Chase X Records", then Generate.
3. Download the zip. It holds the APK, the AAB (for Google Play) and a **signing key. Keep that key safe forever**; updates must use the same key.
4. Copy the SHA-256 fingerprint PWABuilder shows. Put it and the package id into the host variables `ANDROID_SHA256` and `ANDROID_PACKAGE`, then redeploy. This removes the browser bar at the top of the app.
5. Send the APK to a phone and install it (allow "install unknown apps"). For Google Play use the AAB and a Play developer account (one-time fee).
If you change the app later, just redeploy the site. The APK does not need rebuilding unless you change its name or icon.

## Build the Android app with GitHub Actions
The folder `android/` is a small Android app that opens your live site full screen, and `.github/workflows/` holds the two build recipes. Nothing to install on your computer.
**One-time setup** (repository > Settings > Secrets and variables > Actions)
1. Variables tab > New variable: `SITE_URL` = your live https address (no slash at the end). Optional: `APP_ID` = your package name (default `com.chasexrecords.app`).
2. Secrets tab > New secret: `KEY_PASSWORD` = a strong password you choose. Save it somewhere safe.
3. Actions tab > **1 - Create signing key (run once)** > Run workflow. When it finishes, open the run: the summary shows your **SHA-256 fingerprint**, and the page bottom has an artifact `chasex-keystore`. Download it within a day (it is deleted after that) and keep `chasex.keystore` safe forever. Updates must use this same key.
4. Turn the keystore into text and save it as a second secret named `KEYSTORE_BASE64`. On Windows, in PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("chasex.keystore")) | Set-Clipboard`, then paste.
5. On your server (Railway) set `ANDROID_PACKAGE` to the package name and `ANDROID_SHA256` to the fingerprint, then redeploy. This removes the browser bar inside the app.
**Every build:** Actions tab > **2 - Build Android app** > Run workflow (or push a tag such as `v1.0`). When it finishes, download `chase-x-app` from the run page. It contains the APK to install on phones, and a `.aab` file for Google Play.
Without the `KEYSTORE_BASE64` secret it builds a test APK that still installs but shows the browser bar. If Google Play App Signing is used later, add Google's fingerprint to `ANDROID_SHA256` too, separated by a comma.

## Deploying later

## Folders
`server/` API + database setup, `public/` the app, `public/admin/` admin panel, `public/videos/` your hero and Blessed videos.

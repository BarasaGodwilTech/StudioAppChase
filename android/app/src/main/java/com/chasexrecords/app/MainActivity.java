package com.chasexrecords.app;

import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.app.Activity;
import android.app.Dialog;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.Icon;
import android.graphics.Typeface;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.util.Rational;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Chase X Records: a full-screen app that shows the live website.
 * It uses an in-app web view (not Chrome), so there is never an address bar or "Share" bar.
 * While a sleeping server wakes up, the app shows its own loading screen instead of the host's page.
 */
public class MainActivity extends Activity {

    private static final int BRAND = Color.parseColor("#060A08");
    private static final int GREEN = Color.parseColor("#9CFF57");
    private static final String SITE = BuildConfig.SITE_URL;

    private FrameLayout root;
    private WebView web;
    private LinearLayout splash;
    private TextView splashStatus;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private String siteHost;
    private volatile boolean destroyed = false;
    private volatile boolean musicOn = false;
    private volatile boolean autoPip = true;
    private boolean askedNotif = false;
    private BroadcastReceiver mediaRx;
    private volatile int launchId = 0;

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        siteHost = Uri.parse(SITE).getHost();

        root = new FrameLayout(this);
        root.setBackgroundColor(BRAND);

        web = new BgWebView(this);
        web.setBackgroundColor(BRAND);
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        splash = buildSplash();
        splash.setVisibility(View.GONE);
        root.addView(splash, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // Keep content clear of the status bar, navigation bar and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setBuiltInZoomControls(false);
        s.setSupportZoom(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString().replace("; wv", "") + " ChaseXApp/1");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        // Lets the website ask the app for floating (picture-in-picture) video.
        web.addJavascriptInterface(new NativeBridge(), "ChaseXNative");

        // Notification / lock-screen buttons (play, pause, next, previous) control the web player.
        mediaRx = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                String cmd = i.getStringExtra("cmd");
                String fn = "toggle".equals(cmd) ? "toggle" : "next".equals(cmd) ? "next" : "prev".equals(cmd) ? "prev" : null;
                if (fn != null && web != null) web.evaluateJavascript("window.cxMedia&&cxMedia." + fn + "()", null);
            }
        };
        IntentFilter mf = new IntentFilter(PlaybackService.ACTION);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(mediaRx, mf, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(mediaRx, mf);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handleUrl(req.getUrl());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showOffline(view);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && !url.equals("about:blank")) hideSplash();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // Links that open a new window (target="_blank") go to the phone's browser or app.
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                final WebView temp = new WebView(MainActivity.this);
                WebSettings ts = temp.getSettings();
                ts.setJavaScriptEnabled(true);
                ts.setDomStorageEnabled(true);
                ts.setUserAgentString(web.getSettings().getUserAgentString());
                CookieManager.getInstance().setAcceptThirdPartyCookies(temp, true);
                final Dialog[] dlg = {null};
                final boolean[] done = {false};
                temp.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView w) { temp.post(() -> closePopup(dlg[0], temp)); }
                });
                temp.setWebViewClient(new WebViewClient() {
                    /** Spotify pages open inside the app (so sign-in is shared with the player); everything else goes to the browser. */
                    private boolean handle(String url) {
                        if (done[0] || url == null || url.equals("about:blank")) return true;
                        Uri u = Uri.parse(url);
                        if (isSpotifyHost(u.getHost())) {
                            if (dlg[0] == null) dlg[0] = showPopup(temp);
                            return false;
                        }
                        done[0] = true;
                        openOutside(u);
                        temp.post(() -> closePopup(dlg[0], temp));
                        return true;
                    }
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return handle(r.getUrl().toString()); }
                    @Override
                    public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) { handle(url); }
                });
                ((WebView.WebViewTransport) resultMsg.obj).setWebView(temp);
                resultMsg.sendToTarget();
                return true;
            }

            // Full-screen video.
            @Override
            public void onShowCustomView(View view, CustomViewCallback cb) {
                if (customView != null) { cb.onCustomViewHidden(); return; }
                customView = view;
                customViewCallback = cb;
                web.setVisibility(View.GONE);
                root.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                setVideoFullscreen(true);
            }

            @Override
            public void onHideCustomView() { hideCustomView(); }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Spotify plays full songs through protected (DRM) playback; without this it falls back to 30 second previews.
                // Allowed for Spotify only. Camera, microphone and everything else stay blocked.
                Uri o = request.getOrigin();
                List<String> ok = new ArrayList<>();
                if (o != null && isSpotifyHost(o.getHost())) {
                    for (String r : request.getResources()) {
                        if (PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(r)) ok.add(r);
                    }
                }
                if (ok.isEmpty()) request.deny();
                else request.grant(ok.toArray(new String[0]));
            }
        });

        if (state != null && web.restoreState(state) != null) {
            return;
        }
        String path = codePath(getIntent());
        launchSite(path == null ? "/" : path);
    }

    // ------------------------------------------------------------------ loading screen

    private LinearLayout buildSplash() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setGravity(Gravity.CENTER);
        l.setBackgroundColor(BRAND);
        l.setClickable(true);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.ic_foreground);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        int size = dp(170);
        l.addView(logo, new LinearLayout.LayoutParams(size, size));

        TextView title = new TextView(this);
        title.setText("Chase X Records");
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        l.addView(title, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ProgressBar bar = new ProgressBar(this);
        bar.setIndeterminate(true);
        bar.setIndeterminateTintList(ColorStateList.valueOf(GREEN));
        LinearLayout.LayoutParams barLp = new LinearLayout.LayoutParams(dp(36), dp(36));
        barLp.topMargin = dp(28);
        l.addView(bar, barLp);

        splashStatus = new TextView(this);
        splashStatus.setText("Loading…");
        splashStatus.setTextColor(Color.parseColor("#B3FFFFFF"));
        splashStatus.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        splashStatus.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams stLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        stLp.topMargin = dp(16);
        l.addView(splashStatus, stLp);
        return l;
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void showSplash(String status) {
        splashStatus.setText(status);
        splash.animate().cancel();
        splash.setAlpha(1f);
        splash.setVisibility(View.VISIBLE);
    }

    private void hideSplash() {
        if (splash.getVisibility() != View.VISIBLE) return;
        splash.animate().alpha(0f).setDuration(250).withEndAction(() -> splash.setVisibility(View.GONE));
    }

    /**
     * Shows the loading screen, waits until the server answers "ok" (a sleeping server can take about a minute),
     * then opens the site. The host's own "waking up" page is never shown.
     */
    private void launchSite(final String path) {
        final int id = ++launchId;
        showSplash("Loading…");
        final String target = SITE + path;
        new Thread(() -> {
            long end = System.currentTimeMillis() + 120000;
            int tries = 0;
            while (!destroyed && id == launchId && System.currentTimeMillis() < end) {
                if (!isOnline()) {
                    runOnUiThread(() -> { if (!destroyed) showOffline(web); });
                    return;
                }
                if (ping()) {
                    runOnUiThread(() -> { if (!destroyed && id == launchId) web.loadUrl(target); });
                    return;
                }
                tries++;
                if (tries == 2) {
                    runOnUiThread(() -> { if (!destroyed) splashStatus.setText("Waking up the studio…\nthis can take up to a minute"); });
                }
                try { Thread.sleep(2000); } catch (InterruptedException e) { return; }
            }
            if (!destroyed && id == launchId) {
                runOnUiThread(() -> { if (!destroyed) web.loadUrl(target); });
            }
        }).start();
    }

    private boolean ping() {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(SITE + "/healthz").openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(20000);
            c.setUseCaches(false);
            if (c.getResponseCode() != 200) return false;
            InputStream in = c.getInputStream();
            byte[] buf = new byte[16];
            int n = in.read(buf);
            in.close();
            return n > 0 && new String(buf, 0, n).trim().equals("ok");
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private boolean isOnline() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo ni = cm == null ? null : cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected();
        } catch (Exception e) {
            return true;
        }
    }

    // ------------------------------------------------------------------ links and sign-in

    /** Returns "/?ac=CODE" when the app is opened by chasexrecords://auth?c=CODE (Google sign-in finished). */
    private String codePath(Intent intent) {
        Uri d = intent == null ? null : intent.getData();
        if (d != null && "chasexrecords".equals(d.getScheme())) {
            String code = d.getQueryParameter("c");
            if (code != null && code.matches("[A-Za-z0-9]{10,100}")) return "/?ac=" + code;
        }
        return null;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String path = codePath(intent);
        if (path != null) web.loadUrl(SITE + path);
    }

    /** Returns true when we handled the link ourselves. */
    private boolean handleUrl(Uri u) {
        String scheme = u.getScheme() == null ? "" : u.getScheme();
        if (scheme.equals("chasexrecords") && "retry".equals(u.getHost())) {
            launchSite("/");
            return true;
        }
        if (scheme.equals("http") || scheme.equals("https")) {
            if (siteHost != null && siteHost.equalsIgnoreCase(u.getHost())) {
                if (u.getPath() != null && u.getPath().startsWith("/auth/google/start")) {
                    openCustomTab(u);   // Google sign-in must happen in the secure browser tab
                    return true;
                }
                return false;           // normal page inside the app
            }
            openOutside(u);
            return true;
        }
        if (scheme.equals("about") || scheme.equals("data") || scheme.equals("blob")) return false;
        openOutside(u);                 // tel:, mailto:, whatsapp:, etc.
        return true;
    }

    private static boolean isSpotifyHost(String h) {
        return h != null && (h.equals("spotify.com") || h.endsWith(".spotify.com") || h.endsWith(".scdn.co"));
    }

    private Dialog showPopup(WebView w) {
        Dialog d = new Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        FrameLayout f = new FrameLayout(this);
        f.setBackgroundColor(Color.BLACK);
        f.addView(w, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        d.setContentView(f);
        d.setOnDismissListener(x -> { try { f.removeView(w); w.destroy(); } catch (Exception ignored) { } });
        d.show();
        return d;
    }

    private void closePopup(Dialog d, WebView w) {
        try {
            if (d != null && d.isShowing()) d.dismiss();
            else w.destroy();
        } catch (Exception ignored) { }
    }

    private void openOutside(Uri u) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            if ("http".equals(u.getScheme()) || "https".equals(u.getScheme())) openCustomTab(u);
        }
    }

    private void openCustomTab(Uri u) {
        try {
            new CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, u);
        } catch (Exception e) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
        }
    }

    private void showOffline(WebView v) {
        hideSplash();
        String html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#060A08;color:#fff;font-family:sans-serif;text-align:center'>"
                + "<div style='padding:24px'><h2>No connection</h2>"
                + "<p style='opacity:.7'>Check your internet and try again.</p>"
                + "<a href='chasexrecords://retry' style='display:inline-block;margin-top:12px;padding:14px 32px;"
                + "border-radius:30px;background:#9CFF57;color:#060A08;text-decoration:none;font-weight:700'>Try again</a>"
                + "</div></body></html>";
        v.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    // ------------------------------------------------------------------ video: full screen and floating (PiP)

    private void hideCustomView() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        web.setVisibility(View.VISIBLE);
        setVideoFullscreen(false);
        if (customViewCallback != null) customViewCallback.onCustomViewHidden();
    }

    private void setVideoFullscreen(boolean on) {
        getWindow().getDecorView().setSystemUiVisibility(on
                ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                : View.SYSTEM_UI_FLAG_VISIBLE);
    }

    private boolean pipSupported() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    /** Music or a full-screen video can float. */
    private boolean canFloat() { return customView != null || musicOn; }

    @TargetApi(Build.VERSION_CODES.O)
    private RemoteAction remote(int icon, String title, String cmd, int code) {
        Intent i = new Intent(PlaybackService.ACTION).setPackage(getPackageName()).putExtra("cmd", cmd);
        PendingIntent pi = PendingIntent.getBroadcast(this, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new RemoteAction(Icon.createWithResource(this, icon), title, title, pi);
    }

    @TargetApi(Build.VERSION_CODES.O)
    private PictureInPictureParams pipParams() {
        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9));
        List<RemoteAction> acts = new ArrayList<>();
        acts.add(remote(android.R.drawable.ic_media_previous, "Previous", "prev", 11));
        acts.add(remote(musicOn ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                musicOn ? "Pause" : "Play", "toggle", 12));
        acts.add(remote(android.R.drawable.ic_media_next, "Next", "next", 13));
        b.setActions(acts);
        if (Build.VERSION.SDK_INT >= 31) b.setAutoEnterEnabled(autoPip && musicOn);   // gesture navigation floats it smoothly
        return b.build();
    }

    @TargetApi(Build.VERSION_CODES.O)
    private void refreshPipParams() {
        if (!pipSupported()) return;
        try { setPictureInPictureParams(pipParams()); } catch (Exception ignored) { }
    }

    /** Shrinks the app into a small floating window (cover + title for music, the picture for video). */
    @TargetApi(Build.VERSION_CODES.O)
    private void enterPip() {
        if (!canFloat() || !pipSupported()) return;
        try { enterPictureInPictureMode(pipParams()); } catch (Exception ignored) { }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean inPip, Configuration cfg) {
        super.onPictureInPictureModeChanged(inPip, cfg);
        if (web != null) web.evaluateJavascript("window.cxPip&&cxPip(" + inPip + ")", null);
    }

    /** Called by the page (window.ChaseXNative). */
    private class NativeBridge {
        @JavascriptInterface
        public boolean canPip() { return pipSupported(); }

        @JavascriptInterface
        public void pip() {
            runOnUiThread(() -> {
                if (!canFloat()) {
                    web.evaluateJavascript("toast&&toast('Play a song first, then float the player.')", null);
                    return;
                }
                enterPip();
            });
        }

        /** The "Floating player when I leave the app" setting. */
        @JavascriptInterface
        public void setAuto(boolean on) {
            runOnUiThread(() -> { autoPip = on; if (Build.VERSION.SDK_INT >= 26) refreshPipParams(); });
        }

        /** The page reports the current song so Android can show it on the lock screen and keep it playing. */
        @JavascriptInterface
        public void media(String title, String artist, boolean playing) {
            runOnUiThread(() -> {
                musicOn = playing;
                if (web instanceof BgWebView) ((BgWebView) web).setKeepVisible(playing);
                if (playing && Build.VERSION.SDK_INT >= 33 && !askedNotif
                        && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    askedNotif = true;
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7);
                }
                PlaybackService.update(MainActivity.this, title, artist, playing);
                if (Build.VERSION.SDK_INT >= 26) refreshPipParams();
            });
        }
    }

    /** Leaving the app while a video is full screen, or music is playing (and the setting is on), floats it automatically. */
    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (customView != null || (autoPip && musicOn)) enterPip();
    }

    @Override
    protected void onStop() {
        super.onStop();
        boolean inPip = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode();
        // Floating window closed, or the app was left without floating: stop the full-screen video.
        if (customView != null && !inPip) {
            web.evaluateJavascript("document.querySelectorAll('video').forEach(function(v){v.pause()})", null);
        }
    }

    // ------------------------------------------------------------------ lifecycle

    @Override
    public void onBackPressed() {
        if (customView != null) {
            hideCustomView();
        } else if (web.canGoBack()) {
            web.goBack();
        } else if (musicOn) {
            moveTaskToBack(true);   // keep the music playing, like other music apps
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    // The web view is deliberately never paused, so music keeps playing when you leave the app.

    /** A web view that keeps reporting itself as visible while music plays, so the page does not pause in the background. */
    private static class BgWebView extends WebView {
        private boolean keepVisible = false;

        BgWebView(Context c) { super(c); }

        void setKeepVisible(boolean on) {
            keepVisible = on;
            if (!on) super.onWindowVisibilityChanged(getWindowVisibility());
        }

        @Override
        protected void onWindowVisibilityChanged(int visibility) {
            super.onWindowVisibilityChanged(keepVisible ? View.VISIBLE : visibility);
        }
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        try { if (mediaRx != null) unregisterReceiver(mediaRx); } catch (Exception ignored) { }
        PlaybackService.stop(this);
        if (web != null) { root.removeView(web); web.destroy(); }
        super.onDestroy();
    }
}

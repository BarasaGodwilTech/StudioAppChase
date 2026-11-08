package com.chasexrecords.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

/**
 * Chase X Records: a full-screen app that shows the live website.
 * It uses an in-app web view (not Chrome), so there is never an address bar or "Share" bar.
 */
public class MainActivity extends Activity {

    private static final int BRAND = Color.parseColor("#060A08");
    private static final String SITE = BuildConfig.SITE_URL;

    private FrameLayout root;
    private WebView web;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private String siteHost;

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        siteHost = Uri.parse(SITE).getHost();

        root = new FrameLayout(this);
        root.setBackgroundColor(BRAND);

        web = new WebView(this);
        web.setBackgroundColor(BRAND);
        root.addView(web, new FrameLayout.LayoutParams(
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

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handleUrl(req.getUrl());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showOffline(view);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // Links that open a new window (target="_blank") go to the phone's browser or app.
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView temp = new WebView(MainActivity.this);
                final boolean[] done = {false};
                temp.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                        if (!done[0]) { done[0] = true; openOutside(r.getUrl()); }
                        return true;
                    }
                    @Override
                    public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
                        if (!done[0] && url != null && !url.equals("about:blank")) {
                            done[0] = true;
                            openOutside(Uri.parse(url));
                            v.stopLoading();
                        }
                    }
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
                setImmersive(true);
            }

            @Override
            public void onHideCustomView() { hideCustomView(); }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny();
            }
        });

        if (state != null) {
            web.restoreState(state);
        } else if (!openFromIntent(getIntent())) {
            web.loadUrl(SITE);
        }
    }

    /** Opens the site, or finishes Google sign-in when the app is opened by chasexrecords://auth?c=CODE. */
    private boolean openFromIntent(Intent intent) {
        Uri d = intent == null ? null : intent.getData();
        if (d != null && "chasexrecords".equals(d.getScheme())) {
            String code = d.getQueryParameter("c");
            if (code != null && code.matches("[A-Za-z0-9]{10,100}")) {
                web.loadUrl(SITE + "/?ac=" + code);
                return true;
            }
        }
        return false;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openFromIntent(intent);
    }

    /** Returns true when we handled the link ourselves. */
    private boolean handleUrl(Uri u) {
        String scheme = u.getScheme() == null ? "" : u.getScheme();
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
        String html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#060A08;color:#fff;font-family:sans-serif;text-align:center'>"
                + "<div style='padding:24px'><h2>No connection</h2>"
                + "<p style='opacity:.7'>Check your internet and try again.</p>"
                + "<a href='" + SITE + "' style='display:inline-block;margin-top:12px;padding:14px 32px;"
                + "border-radius:30px;background:#9CFF57;color:#060A08;text-decoration:none;font-weight:700'>Try again</a>"
                + "</div></body></html>";
        v.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    private void hideCustomView() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        web.setVisibility(View.VISIBLE);
        setImmersive(false);
        if (customViewCallback != null) customViewCallback.onCustomViewHidden();
    }

    private void setImmersive(boolean on) {
        getWindow().getDecorView().setSystemUiVisibility(on
                ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                : View.SYSTEM_UI_FLAG_VISIBLE);
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            hideCustomView();
        } else if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() { web.onPause(); super.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onDestroy() {
        if (web != null) { root.removeView(web); web.destroy(); }
        super.onDestroy();
    }
}

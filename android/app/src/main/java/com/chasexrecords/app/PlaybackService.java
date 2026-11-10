package com.chasexrecords.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

/**
 * Keeps music playing when the app is in the background or the screen is off, and shows the
 * player on the lock screen and in the notification shade (play / pause / next / previous).
 * The sound itself still comes from the web page; this service keeps Android from stopping the app.
 */
public class PlaybackService extends Service {

    public static final String ACTION = "com.chasexrecords.app.MEDIA";
    private static final String CHANNEL = "playback";
    private static final int ID = 7;
    private static final long IDLE_STOP_MS = 10 * 60 * 1000L;

    public static PlaybackService instance;

    private MediaSession session;
    private PowerManager.WakeLock wake;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable idleStop = this::stopSelf;
    private String title = "";
    private String artist = "";
    private boolean playing = false;
    private boolean foreground = false;

    /** Called by the app whenever the song or play state changes. */
    public static void update(Context c, String title, String artist, boolean playing) {
        if (instance != null) {
            instance.apply(title, artist, playing);
            return;
        }
        if (!playing) return;
        Intent i = new Intent(c, PlaybackService.class)
                .putExtra("t", title).putExtra("a", artist).putExtra("p", true);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (Exception ignored) { }
    }

    public static void stop(Context c) {
        try { c.stopService(new Intent(c, PlaybackService.class)); } catch (Exception ignored) { }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Music playback", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
        session = new MediaSession(this, "ChaseX");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { send("toggle"); }
            @Override public void onPause() { send("toggle"); }
            @Override public void onSkipToNext() { send("next"); }
            @Override public void onSkipToPrevious() { send("prev"); }
        });
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            apply(intent.getStringExtra("t"), intent.getStringExtra("a"), intent.getBooleanExtra("p", true));
        }
        return START_NOT_STICKY;
    }

    private void apply(String t, String a, boolean p) {
        if (t != null) title = t;
        if (a != null) artist = a;
        playing = p;

        handler.removeCallbacks(idleStop);
        if (playing) {
            if (wake == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "chasex:playback");
                wake.setReferenceCounted(false);
            }
            if (!wake.isHeld()) wake.acquire(4 * 60 * 60 * 1000L);
        } else {
            if (wake != null && wake.isHeld()) wake.release();
            handler.postDelayed(idleStop, IDLE_STOP_MS);   // nothing playing for a while: stop the service
        }

        session.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist).build());
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
                        | PlaybackState.ACTION_SKIP_TO_PREVIOUS)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f).build());

        Notification n = build();
        try {
            if (!foreground) {
                if (Build.VERSION.SDK_INT >= 29) {
                    startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                } else {
                    startForeground(ID, n);
                }
                foreground = true;
            } else {
                ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(ID, n);
            }
        } catch (Exception e) {
            // Android refused to start the foreground service: music still plays while the app is open.
        }
    }

    @SuppressWarnings("deprecation")
    private Notification build() {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        Intent open = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        b.setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(title)
                .setContentText(artist)
                .setContentIntent(PendingIntent.getActivity(this, 0, open, flags()))
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setOngoing(playing)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .addAction(android.R.drawable.ic_media_previous, "Previous", action("prev", 1))
                .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        playing ? "Pause" : "Play", action("toggle", 2))
                .addAction(android.R.drawable.ic_media_next, "Next", action("next", 3))
                .setStyle(new Notification.MediaStyle()
                        .setMediaSession(session.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2));
        return b.build();
    }

    private PendingIntent action(String cmd, int code) {
        Intent i = new Intent(ACTION).setPackage(getPackageName()).putExtra("cmd", cmd);
        return PendingIntent.getBroadcast(this, code, i, flags());
    }

    private int flags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
    }

    private void send(String cmd) {
        sendBroadcast(new Intent(ACTION).setPackage(getPackageName()).putExtra("cmd", cmd));
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(idleStop);
        if (wake != null && wake.isHeld()) wake.release();
        if (session != null) { session.setActive(false); session.release(); }
        stopForeground(true);
        instance = null;
        super.onDestroy();
    }
}

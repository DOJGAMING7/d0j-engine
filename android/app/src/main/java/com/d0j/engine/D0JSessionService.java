package com.d0j.engine;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.widget.Toast;

import androidx.annotation.Nullable;

/**
 * Session-scoped foreground service. It owns the persistent status notification
 * and local toast messages only. Floating controls and prediction lines live
 * inside the hosted game Activity (D0JGameHud), never in the system overlay.
 */
public class D0JSessionService extends Service {
    public static final String ACTION_START_SESSION = "com.d0j.engine.action.START_SESSION";
    public static final String ACTION_STOP_SESSION = "com.d0j.engine.action.STOP_SESSION";
    public static final String ACTION_UPDATE_STATUS = "com.d0j.engine.action.UPDATE_STATUS";
    public static final String ACTION_OPEN_MENU = "com.d0j.engine.action.OPEN_MENU";
    public static final String ACTION_SHOW_TOAST = "com.d0j.engine.action.SHOW_TOAST";
    public static final String ACTION_UPDATE_LINES = "com.d0j.engine.action.UPDATE_LINES";
    public static final String ACTION_CLEAR_LINES = "com.d0j.engine.action.CLEAR_LINES";
    public static final String ACTION_HOSTING_FAILED = "com.d0j.engine.action.HOSTING_FAILED";

    private static final String CHANNEL_ID = "d0j_session";
    private static final int NOTIFICATION_ID = 7701;
    private static volatile boolean active = false;

    private final Handler main = new Handler(Looper.getMainLooper());
    private String sessionPackage = "com.miniclip.eightballpool";
    private String statusText = "Session active";
    private String statusState = "running";
    private int gameExitTicks = 0;

    private final Runnable sessionWatchdog = new Runnable() {
        @Override public void run() {
            if (!active) return;
            if (!D0JPrefs.getBoolean(D0JSessionService.this, D0JPrefs.SESSION_ACTIVE, false)) {
                stopSessionInternal("SESSION_FLAG_CLEARED");
                return;
            }
            if (gameExited()) {
                gameExitTicks += 1;
                if (gameExitTicks >= 2) {
                    stopSessionInternal("GAME_EXITED");
                    return;
                }
            } else {
                gameExitTicks = 0;
            }
            main.postDelayed(this, 2000);
        }
    };

    public static boolean isActive() { return active; }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START_SESSION : intent.getAction();
        if (action == null) action = ACTION_START_SESSION;

        switch (action) {
            case ACTION_STOP_SESSION:
                stopSessionInternal();
                return START_NOT_STICKY;
            case ACTION_UPDATE_STATUS:
                handleStatusUpdate(intent);
                if (!active) startSessionInternal(intent);
                return START_STICKY;
            case ACTION_SHOW_TOAST:
                if (!active) startSessionInternal(intent);
                showToast(intent == null ? "" : intent.getStringExtra("text"));
                return START_STICKY;
            case ACTION_UPDATE_LINES:
                D0JGameHud.pushLines(this, intent == null ? "{}" : intent.getStringExtra("json"));
                return START_STICKY;
            case ACTION_CLEAR_LINES:
                D0JGameHud.pushLines(this, "{}");
                return START_STICKY;
            case ACTION_OPEN_MENU:
                openApp();
                return START_STICKY;
            case ACTION_HOSTING_FAILED:
                D0JGameHud.pushLines(this, "{}");
                D0JNativePlugin.notifyHostingFailed(
                        intent == null ? "" : intent.getStringExtra("reason"));
                stopSelf();
                return START_NOT_STICKY;
            case ACTION_START_SESSION:
            default:
                startSessionInternal(intent);
                return START_STICKY;
        }
    }

    private void startSessionInternal(Intent intent) {
        if (intent != null) {
            String pkg = intent.getStringExtra("packageName");
            if (pkg != null && !pkg.trim().isEmpty()) sessionPackage = pkg.trim();
            String text = intent.getStringExtra("text");
            if (text != null && !text.trim().isEmpty()) statusText = text.trim();
            String state = intent.getStringExtra("status");
            if (state != null && !state.trim().isEmpty()) statusState = state.trim();
        }
        active = true;
        gameExitTicks = 0;
        D0JPrefs.setBoolean(this, D0JPrefs.SESSION_ACTIVE, true);
        D0JPrefs.setString(this, D0JPrefs.SESSION_PACKAGE, sessionPackage);
        startForegroundCompat();
        main.removeCallbacks(sessionWatchdog);
        main.postDelayed(sessionWatchdog, 2000);
    }

    private void handleStatusUpdate(Intent intent) {
        if (intent == null) return;
        String text = intent.getStringExtra("text");
        String state = intent.getStringExtra("status");
        if (text != null && !text.trim().isEmpty()) statusText = text.trim();
        if (state != null && !state.trim().isEmpty()) statusState = state.trim();
        D0JPrefs.setString(this, D0JPrefs.SESSION_STATUS, statusState);
        D0JPrefs.setString(this, D0JPrefs.SESSION_STATUS_TEXT, statusText);
        if (active) startForegroundCompat();
    }

    private void stopSessionInternal() {
        stopSessionInternal("manual");
    }

    private void stopSessionInternal(String reason) {
        active = false;
        gameExitTicks = 0;
        D0JPrefs.setBoolean(this, D0JPrefs.SESSION_ACTIVE, false);
        D0JPrefs.setString(this, D0JPrefs.SESSION_STATUS, "stopped");
        D0JPrefs.setString(this, D0JPrefs.SESSION_STATUS_TEXT, "Session stopped");
        D0JGameHud.pushLines(this, "{}");
        D0JGameHud.clearLines();
        D0JNativePlugin.notifySessionEnded(reason == null ? "manual" : reason);
        main.removeCallbacks(sessionWatchdog);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
            else stopForeground(true);
        } catch (Exception ignored) { }
        stopSelf();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "SNAKE ENGINE Session", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("SNAKE ENGINE session status and actions");
        channel.setLightColor(Color.WHITE);
        manager.createNotificationChannel(channel);
    }

    private PendingIntent servicePi(String action, int req) {
        Intent i = new Intent(this, D0JSessionService.class).setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getService(this, req, i, flags);
    }

    private PendingIntent appPi() {
        Intent i = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("openMenu", true);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(this, 99, i, flags);
    }

    private void startForegroundCompat() {
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        b.setContentTitle("SNAKE ENGINE active")
                .setContentText("SNAKE ENGINE is running in background")
                .setSubText(statusText)
                .setSmallIcon(R.drawable.ic_snake_badge)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(appPi())
                .addAction(new Notification.Action.Builder(R.drawable.ic_snake_badge, "Open Menu",
                        servicePi(ACTION_OPEN_MENU, 1)).build())
                .addAction(new Notification.Action.Builder(R.drawable.ic_snake_badge, "Stop",
                        servicePi(ACTION_STOP_SESSION, 2)).build());
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    private void showToast(String text) {
        if (text == null || text.trim().isEmpty()) return;
        try {
            Toast.makeText(this, text, Toast.LENGTH_SHORT).show();
        } catch (Exception ignored) { }
    }

    private void openApp() {
        try {
            Intent i = new Intent(this, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            i.putExtra("openMenu", true);
            startActivity(i);
        } catch (Exception ignored) { }
    }

    private boolean gameExited() {
        try {
            Bundle args = new Bundle();
            args.putString("op", "sessionWatch");
            Bundle response = getContentResolver().call(
                    com.d0j.engine.vm.SystemCallProvider.uri(this),
                    com.d0j.engine.vm.SystemCallProvider.METHOD, null, args);
            if (response == null) return false;
            String json = response.getString("json", "");
            if (json == null || json.trim().isEmpty()) return false;
            org.json.JSONObject value = new org.json.JSONObject(json);
            String verdict = value.optString("verdict", "UNKNOWN");
            return "GAME_EXITED".equals(verdict);
        } catch (Exception ignored) {
            return false;
        }
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        if (active) stopSessionInternal("TASK_REMOVED");
        super.onTaskRemoved(rootIntent);
    }
}

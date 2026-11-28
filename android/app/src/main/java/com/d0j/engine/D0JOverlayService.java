package com.d0j.engine;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;

import androidx.annotation.Nullable;

import com.d0j.engine.vm.SystemCallProvider;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

public class D0JOverlayService extends Service {
    public static final String ACTION_START_SESSION = "com.d0j.engine.action.START_SESSION";
    public static final String ACTION_STOP_SESSION = "com.d0j.engine.action.STOP_SESSION";
    public static final String ACTION_UPDATE_STATUS = "com.d0j.engine.action.UPDATE_STATUS";
    public static final String ACTION_OPEN_MENU = "com.d0j.engine.action.OPEN_MENU";
    public static final String ACTION_OPEN_APP = "com.d0j.engine.action.OPEN_APP";
    public static final String ACTION_SHOW_TOAST = "com.d0j.engine.action.SHOW_TOAST";
    public static final String ACTION_UPDATE_LINES = "com.d0j.engine.action.UPDATE_LINES";
    public static final String ACTION_CLEAR_LINES = "com.d0j.engine.action.CLEAR_LINES";

    private static final String CHANNEL_ID = "d0j_session";
    private static final int NOTIFICATION_ID = 7701;
    private static volatile boolean active = false;

    private final Handler main = new Handler(Looper.getMainLooper());
    private WindowManager windowManager;
    private View floatButton;
    private View menuView;
    private android.webkit.WebView menuWebView;
    private LinearLayout toastView;
    private WindowManager.LayoutParams buttonParams;
    private WindowManager.LayoutParams menuParams;
    private WindowManager.LayoutParams toastParams;
    private View lineView;
    private WindowManager.LayoutParams lineParams;
    private String sessionPackage = "com.miniclip.eightballpool";
    private String statusText = "Session active";
    private String statusState = "running";
    private int gameExitTicks = 0;
    private final Runnable hideToastRunnable = this::removeToast;
    private final Runnable sessionWatchdog = new Runnable() {
        @Override public void run() {
            if (!active) return;
            // Failsafe: if session flag was cleared externally, stop.
            if (!D0JPrefs.getBoolean(D0JOverlayService.this, D0JPrefs.SESSION_ACTIVE, false)) {
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
            main.postDelayed(this, 4000);
        }
    };

    public static boolean isActive() { return active; }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
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
            case ACTION_OPEN_MENU:
                if (!active) startSessionInternal(intent);
                showMenu();
                return START_STICKY;
            case ACTION_OPEN_APP:
                openApp();
                return START_STICKY;
            case ACTION_SHOW_TOAST:
                if (!active) startSessionInternal(intent);
                showToast(intent == null ? "" : intent.getStringExtra("text"), intent == null ? "info" : intent.getStringExtra("kind"));
                return START_STICKY;
            case ACTION_UPDATE_LINES:
                if (!active) startSessionInternal(intent);
                showLines(intent == null ? "" : intent.getStringExtra("json"));
                return START_STICKY;
            case ACTION_CLEAR_LINES:
                clearLines();
                return START_STICKY;
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
        D0JPrefs.setBoolean(this, D0JPrefs.SESSION_ACTIVE, true);
        D0JPrefs.setString(this, D0JPrefs.SESSION_PACKAGE, sessionPackage);
        startForegroundCompat();
        if (floatButton == null) createFloatButton();
        if (lineView == null && canOverlay(this)) createLineLayer();
        active = true;
        gameExitTicks = 0;
        main.removeCallbacks(sessionWatchdog);
        main.postDelayed(sessionWatchdog, 4000);

        boolean launchGame = intent != null && intent.getBooleanExtra("launchGame", false);
        if (launchGame) launchPackage(sessionPackage);
    }

    private void handleStatusUpdate(Intent intent) {
        if (intent == null) return;
        String text = intent.getStringExtra("text");
        String state = intent.getStringExtra("status");
        if (text != null && !text.trim().isEmpty()) statusText = text.trim();
        if (state != null && !state.trim().isEmpty()) statusState = state.trim();
        D0JPrefs.setString(this, D0JPrefs.SESSION_STATUS, statusState);
        D0JPrefs.setString(this, D0JPrefs.SESSION_STATUS_TEXT, statusText);
        if (active) {
            startForegroundCompat();
            if (text != null && !text.trim().isEmpty()) showToast(statusText, statusState);
        }
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
        D0JNativePlugin.notifySessionEnded(reason == null ? "manual" : reason);
        main.removeCallbacks(sessionWatchdog);
        main.removeCallbacks(hideToastRunnable);
        removeMenu();
        removeToast();
        removeFloat();
        removeLineLayer();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
            else stopForeground(true);
        } catch (Exception ignored) {}
        stopSelf();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "D0J Session", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("D0J EnGine session status and actions");
        channel.setLightColor(Color.WHITE);
        manager.createNotificationChannel(channel);
    }

    private PendingIntent pi(String action, int req) {
        Intent i = new Intent(this, D0JOverlayService.class).setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getService(this, req, i, flags);
    }

    private PendingIntent appPi() {
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("openMenu", true);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(this, 99, i, flags);
    }

    private void startForegroundCompat() {
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        b.setContentTitle("D0J EnGine active")
                .setContentText(statusText)
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(appPi())
                .addAction(new Notification.Action.Builder(null, "Open Menu", pi(ACTION_OPEN_MENU, 1)).build())
                .addAction(new Notification.Action.Builder(null, "Stop", pi(ACTION_STOP_SESSION, 2)).build());
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    private void createFloatButton() {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int size = dp(58);
        LinearLayout wrap = new LinearLayout(this);
        wrap.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#121212"));
        bg.setCornerRadius(dp(18));
        bg.setStroke(dp(1), Color.parseColor("#E0E0E0"));
        wrap.setBackground(bg);
        wrap.setPadding(dp(6), dp(6), dp(6), dp(6));

        TextView tv = new TextView(this);
        tv.setText("D0J");
        tv.setTextColor(Color.WHITE);
        tv.setTypeface(Typeface.DEFAULT_BOLD);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        wrap.addView(tv, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        int flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL;
        buttonParams = new WindowManager.LayoutParams(size, size, type, flags, PixelFormat.TRANSLUCENT);
        buttonParams.gravity = Gravity.TOP | Gravity.START;
        buttonParams.x = D0JPrefs.getInt(this, D0JPrefs.FLOAT_X, Math.max(0, dm.widthPixels - size - dp(12)));
        buttonParams.y = D0JPrefs.getInt(this, D0JPrefs.FLOAT_Y, dp(120));

        wrap.setOnTouchListener(new View.OnTouchListener() {
            float downX, downY; int startX, startY; long downTime; boolean moved;
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = e.getRawX(); downY = e.getRawY();
                        startX = buttonParams.x; startY = buttonParams.y;
                        downTime = System.currentTimeMillis(); moved = false; return true;
                    case MotionEvent.ACTION_MOVE:
                        int dx = (int) (e.getRawX() - downX); int dy = (int) (e.getRawY() - downY);
                        if (Math.abs(dx) > dp(4) || Math.abs(dy) > dp(4)) moved = true;
                        buttonParams.x = Math.max(0, startX + dx);
                        buttonParams.y = Math.max(0, startY + dy);
                        try { windowManager.updateViewLayout(floatButton, buttonParams); } catch (Exception ignored) {}
                        return true;
                    case MotionEvent.ACTION_UP:
                        D0JPrefs.setInt(D0JOverlayService.this, D0JPrefs.FLOAT_X, buttonParams.x);
                        D0JPrefs.setInt(D0JOverlayService.this, D0JPrefs.FLOAT_Y, buttonParams.y);
                        if (!moved && System.currentTimeMillis() - downTime < 350) togglePanel();
                        return true;
                }
                return false;
            }
        });

        floatButton = wrap;
        try { windowManager.addView(floatButton, buttonParams); } catch (Exception ignored) { floatButton = null; }
    }

    private void togglePanel() {
        if (menuView != null) removeMenu();
        else showMenu();
    }

    private void showMenu() {
        if (menuView != null) return;
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int width = Math.min(dm.widthPixels - dp(20), dp(430));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#111111"));
        bg.setCornerRadius(dp(20));
        bg.setStroke(dp(1), Color.parseColor("#3A3A3A"));
        root.setBackground(bg);
        root.setPadding(dp(12), dp(10), dp(12), dp(12));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = new TextView(this);
        title.setText("D0J MOD MENU");
        title.setTextColor(Color.WHITE);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        header.addView(title, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        Button hide = smallBtn("Hide");
        hide.setOnClickListener(v -> removeMenu());
        header.addView(hide);
        root.addView(header);

        TextView sub = new TextView(this);
        sub.setText(statusText + " · drag header");
        sub.setTextColor(Color.parseColor("#BDBDBD"));
        sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        sub.setPadding(0, dp(2), 0, dp(8));
        root.addView(sub);

        ScrollView scroll = new ScrollView(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, Math.min(dm.heightPixels - dp(180), dp(560))));

        // Status
        content.addView(section("Status / Test"));
        content.addView(infoText("Session: " + (active ? "ACTIVE" : "IDLE")));
        content.addView(infoText("Target: " + sessionPackage));
        content.addView(actionRow("Run Quick Test", v -> D0JNativePlugin.notifyMenuCommand("runTest")));
        content.addView(actionRow("Open App", v -> openApp()));
        content.addView(actionRow("Launch 8BP", v -> D0JNativePlugin.notifyMenuCommand("launch8bp")));
        content.addView(actionRow("Stop Session", v -> { D0JNativePlugin.notifyMenuCommand("stop"); stopSessionInternal(); }));

        // VM host substrate (no framework hook attached in this build)
        content.addView(section("VM Host (rootless)"));
        content.addView(infoText("Hook status is reported, never assumed."));
        content.addView(actionRow("Session Guard Check", v -> D0JNativePlugin.notifyMenuCommand("sessionGuard")));
        content.addView(actionRow("VM Host Status", v -> D0JNativePlugin.notifyMenuCommand("vmStatus")));
        content.addView(actionRow("VM Hook Status", v -> D0JNativePlugin.notifyMenuCommand("vmHooks")));
        content.addView(actionRow("Attach VM Hooks", v -> D0JNativePlugin.notifyMenuCommand("vmAttach")));
        content.addView(actionRow("Start VM Host", v -> D0JNativePlugin.notifyMenuCommand("vmStart")));
        content.addView(actionRow("Run Lines From State", v -> D0JNativePlugin.notifyMenuCommand("runLiveLines")));

        // Lines
        content.addView(section("Lines / Prediction"));
        addToggle(content, "Show lines", "showLines", true);
        addToggle(content, "Keep lines after shot", "keepLines", true);
        addToggle(content, "Power lock", "powerLock", false);
        addSeek(content, "Default power", "power", 0, 100, 74, "%");
        addToggle(content, "Show pockets", "showPockets", true);
        addSeek(content, "Spin", "lineSpin", -100, 100, 0, "");
        addSeek(content, "Line opacity", "lineOpacity", 10, 100, 85, "%");
        addSeek(content, "Guide opacity", "guideOpacity", 10, 100, 70, "%");
        content.addView(actionRow("Run All Prediction Lines", v -> D0JNativePlugin.notifyMenuCommand("runLineTest")));
        content.addView(actionRow("Start Live Overlay Lines", v -> D0JNativePlugin.notifyMenuCommand("liveStart")));
        content.addView(actionRow("Stop Live Overlay Lines", v -> D0JNativePlugin.notifyMenuCommand("liveStop")));
        content.addView(actionRow("Open Line Prediction Test", v -> D0JNativePlugin.notifyMenuCommand("openTable")));

        // Auto play
        content.addView(section("Auto Play"));
        addToggle(content, "Enable auto play", "autoPlay", false);
        addChoice(content, "Auto play mode", "autoPlayMode", new String[]{"Pro Fast","Pro Player","Fast Mode"});
        addToggle(content, "Failed break", "failedBreak", false);
        content.addView(actionRow("Run Ratimoda", v -> D0JNativePlugin.notifyMenuCommand("autoplay")));
        content.addView(actionRow("Attach Live Input", v -> D0JNativePlugin.notifyMenuCommand("inputAttach")));
        content.addView(actionRow("Start Live Auto", v -> D0JNativePlugin.notifyMenuCommand("autoLiveStart")));
        content.addView(actionRow("Stop Live Auto", v -> D0JNativePlugin.notifyMenuCommand("autoLiveStop")));

        // Auto queue
        content.addView(section("Auto Queue"));
        addToggle(content, "Auto queue", "autoQueue", false);
        addChoice(content, "Queue mode", "queueMode", new String[]{"ONE","SESSION","INFINITE"});
        addSeek(content, "Match limit", "matchLimit", 1, 20, 3, "");
        addSeek(content, "Delay", "queueDelay", 1, 10, 2, "s");
        addSeek(content, "Jitter", "jitter", 0, 20, 4, "x0.1s");
        addSeek(content, "Retries", "retries", 0, 5, 2, "");
        addToggle(content, "Stop on manual input", "stopOnManual", true);
        addChoice(content, "Queue table (coins)", "queueTable", new String[]{"London","Moscow","Beijing","Barcelona"});

        // 8 ball
        content.addView(section("8 Ball / Golden Shot"));
        addToggle(content, "Prioritize 9th ball", "prioritize9", false);
        addToggle(content, "Paralysis opponent turn", "paralysisOpponent", false);
        addToggle(content, "Clean up shot", "cleanUpShot", false);
        addChoice(content, "Golden shot target", "goldenTarget", new String[]{"1","2","3","4"});

        content.addView(section("Session"));
        addToggle(content, "Auto-stop when 8BP closes", "autoStopOnGameExit", false);
        content.addView(infoText("Auto-stop needs Usage access permission (optional)."));
        content.addView(section("Notes"));
        content.addView(infoText("A1: no accessibility / no auto-back."));
        content.addView(infoText("Real 8BP live lines need game bridge/patch. Demo/table prediction works locally."));

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        menuParams = new WindowManager.LayoutParams(width, WindowManager.LayoutParams.WRAP_CONTENT, type,
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        menuParams.gravity = Gravity.TOP | Gravity.START;
        menuParams.x = D0JPrefs.getInt(this, D0JPrefs.FLOAT_X, dp(10));
        menuParams.y = Math.max(dp(40), D0JPrefs.getInt(this, D0JPrefs.FLOAT_Y, dp(90)));

        header.setOnTouchListener(new View.OnTouchListener() {
            float dx, dy; int sx, sy;
            @Override public boolean onTouch(View v, MotionEvent e) {
                if (menuParams == null || menuView == null) return false;
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        dx = e.getRawX(); dy = e.getRawY(); sx = menuParams.x; sy = menuParams.y; return true;
                    case MotionEvent.ACTION_MOVE:
                        menuParams.x = Math.max(0, sx + (int)(e.getRawX() - dx));
                        menuParams.y = Math.max(0, sy + (int)(e.getRawY() - dy));
                        try { windowManager.updateViewLayout(menuView, menuParams); } catch (Exception ignored) {}
                        return true;
                    case MotionEvent.ACTION_UP:
                        D0JPrefs.setInt(D0JOverlayService.this, D0JPrefs.FLOAT_X, menuParams.x);
                        D0JPrefs.setInt(D0JOverlayService.this, D0JPrefs.FLOAT_Y, menuParams.y);
                        return true;
                }
                return false;
            }
        });

        menuView = root;
        try { windowManager.addView(menuView, menuParams); } catch (Exception ignored) { menuView = null; menuWebView = null; }
    }

    private TextView section(String text) {
        TextView tv = new TextView(this);
        tv.setText(text.toUpperCase());
        tv.setTextColor(Color.parseColor("#FFFFFF"));
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        tv.setTypeface(Typeface.DEFAULT_BOLD);
        tv.setPadding(0, dp(12), 0, dp(6));
        return tv;
    }

    private TextView infoText(String text) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextColor(Color.parseColor("#A8A8A8"));
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        tv.setPadding(0, dp(2), 0, dp(6));
        return tv;
    }

    private Button smallBtn(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#222222"));
        bg.setCornerRadius(dp(10));
        bg.setStroke(dp(1), Color.parseColor("#444444"));
        b.setBackground(bg);
        b.setMinHeight(0); b.setMinimumHeight(0);
        b.setPadding(dp(12), dp(8), dp(12), dp(8));
        return b;
    }

    private View actionRow(String text, View.OnClickListener click) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        b.setTextColor(Color.WHITE);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#1C1C1C"));
        bg.setCornerRadius(dp(12));
        bg.setStroke(dp(1), Color.parseColor("#333333"));
        b.setBackground(bg);
        b.setPadding(dp(14), dp(12), dp(14), dp(12));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(8);
        b.setLayoutParams(lp);
        b.setOnClickListener(click);
        return b;
    }

    private void addToggle(LinearLayout content, String label, String key, boolean def) {
        boolean checked = D0JPrefs.getConfigBoolean(this, key, def);
        Button row = new Button(this);
        row.setAllCaps(false);
        row.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        row.setText(label + "   [" + (checked ? "ON" : "OFF") + "]");
        row.setTextColor(Color.WHITE);
        row.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(checked ? Color.parseColor("#2A2A2A") : Color.parseColor("#191919"));
        bg.setCornerRadius(dp(12));
        bg.setStroke(dp(1), Color.parseColor(checked ? "#FFFFFF" : "#333333"));
        row.setBackground(bg);
        row.setPadding(dp(14), dp(10), dp(14), dp(10));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(8);
        row.setLayoutParams(lp);
        row.setOnClickListener(v -> {
            boolean next = !D0JPrefs.getConfigBoolean(this, key, def);
            D0JPrefs.setString(this, D0JPrefs.CONFIG_PREFIX + key, String.valueOf(next));
            row.setText(label + "   [" + (next ? "ON" : "OFF") + "]");
            GradientDrawable nbg = new GradientDrawable();
            nbg.setColor(next ? Color.parseColor("#2A2A2A") : Color.parseColor("#191919"));
            nbg.setCornerRadius(dp(12));
            nbg.setStroke(dp(1), Color.parseColor(next ? "#FFFFFF" : "#333333"));
            row.setBackground(nbg);
            JSObject patch = new JSObject();
            patch.put(key, next);
            D0JNativePlugin.notifyConfigChanged(patch);
        });
        content.addView(row);
    }

    private void addSeek(LinearLayout content, String label, String key, int min, int max, int def, String suffix) {
        int val = D0JPrefs.getConfigInt(this, key, def);
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.setPadding(dp(12), dp(8), dp(12), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#191919"));
        bg.setCornerRadius(dp(12));
        bg.setStroke(dp(1), Color.parseColor("#333333"));
        wrap.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(8);
        wrap.setLayoutParams(lp);

        TextView head = new TextView(this);
        head.setText(label + ": " + val + suffix);
        head.setTextColor(Color.WHITE);
        head.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        wrap.addView(head);
        SeekBar sb = new SeekBar(this);
        sb.setMax(max - min);
        sb.setProgress(val - min);
        sb.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                int v = min + progress;
                head.setText(label + ": " + v + suffix);
                if (fromUser) {
                    D0JPrefs.setString(D0JOverlayService.this, D0JPrefs.CONFIG_PREFIX + key, String.valueOf(v));
                    JSObject patch = new JSObject();
                    patch.put(key, v);
                    D0JNativePlugin.notifyConfigChanged(patch);
                }
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        wrap.addView(sb);
        content.addView(wrap);
    }

    private void addChoice(LinearLayout content, String label, String key, String[] options) {
        String current = D0JPrefs.getConfigString(this, key, options[0]);
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.setPadding(dp(12), dp(8), dp(12), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#191919"));
        bg.setCornerRadius(dp(12));
        bg.setStroke(dp(1), Color.parseColor("#333333"));
        wrap.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(8);
        wrap.setLayoutParams(lp);
        TextView head = new TextView(this);
        head.setText(label);
        head.setTextColor(Color.WHITE);
        head.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        wrap.addView(head);
        LinearLayout chips = new LinearLayout(this);
        chips.setOrientation(LinearLayout.HORIZONTAL);
        chips.setPadding(0, dp(8), 0, 0);
        wrap.addView(chips);
        Runnable render = new Runnable() {
            @Override public void run() {
                chips.removeAllViews();
                String cur = D0JPrefs.getConfigString(D0JOverlayService.this, key, options[0]);
                for (String opt : options) {
                    Button b = smallBtn(opt);
                    boolean active = opt.equals(cur);
                    GradientDrawable bbg = new GradientDrawable();
                    bbg.setColor(active ? Color.parseColor("#FFFFFF") : Color.parseColor("#222222"));
                    bbg.setCornerRadius(dp(10));
                    bbg.setStroke(dp(1), Color.parseColor(active ? "#FFFFFF" : "#444444"));
                    b.setBackground(bbg);
                    b.setTextColor(active ? Color.BLACK : Color.WHITE);
                    LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                    blp.rightMargin = dp(6);
                    b.setLayoutParams(blp);
                    b.setOnClickListener(v -> {
                        D0JPrefs.setString(D0JOverlayService.this, D0JPrefs.CONFIG_PREFIX + key, opt);
                        JSObject patch = new JSObject();
                        try { patch.put(key, Integer.parseInt(opt)); } catch (Exception e) { patch.put(key, opt); }
                        D0JNativePlugin.notifyConfigChanged(patch);
                        this.run();
                    });
                    chips.addView(b);
                }
            }
        };
        render.run();
        content.addView(wrap);
    }

    private void showToast(String text, String kind) {
        if (text == null || text.trim().isEmpty()) return;
        removeToast();
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#EE101010"));
        bg.setCornerRadius(dp(14));
        String border = "fail".equals(kind) ? "#FF6666" : ("pass".equals(kind) ? "#66FF66" : "#555555");
        bg.setStroke(dp(1), Color.parseColor(border));
        root.setBackground(bg);
        root.setPadding(dp(14), dp(10), dp(14), dp(10));

        TextView t = new TextView(this);
        t.setText("D0J ENGINE");
        t.setTextColor(Color.WHITE);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(t);
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextColor(Color.parseColor("#EAEAEA"));
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        root.addView(b);

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        toastParams = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        toastParams.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        toastParams.y = dp(20);
        toastView = root;
        try { windowManager.addView(toastView, toastParams); } catch (Exception ignored) { toastView = null; }
        main.removeCallbacks(hideToastRunnable);
        main.postDelayed(hideToastRunnable, 4200);
    }

    private void removeToast() {
        if (toastView != null) {
            try { windowManager.removeView(toastView); } catch (Exception ignored) {}
            toastView = null;
        }
    }

    private void openApp() {
        try {
            Intent i = new Intent(this, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            i.putExtra("openMenu", true);
            startActivity(i);
        } catch (Exception ignored) {}
    }

    private void launchPackage(String pkg) {
        try {
            Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
            if (i != null) {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            }
        } catch (Exception ignored) {}
    }

    private boolean hasUsageAccess() {
        try {
            android.app.AppOpsManager appOps = (android.app.AppOpsManager) getSystemService(Context.APP_OPS_SERVICE);
            int mode = appOps.checkOpNoThrow(android.app.AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), getPackageName());
            return mode == android.app.AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) { return false; }
    }

    private String topPackage() {
        try {
            if (!hasUsageAccess()) return null;
            android.app.usage.UsageStatsManager usm = (android.app.usage.UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
            long end = System.currentTimeMillis();
            android.app.usage.UsageEvents events = usm.queryEvents(end - 15000, end);
            android.app.usage.UsageEvents.Event ev = new android.app.usage.UsageEvents.Event();
            String last = null;
            while (events.hasNextEvent()) {
                events.getNextEvent(ev);
                if (ev.getEventType() == android.app.usage.UsageEvents.Event.MOVE_TO_FOREGROUND) {
                    last = ev.getPackageName();
                }
            }
            return last;
        } catch (Exception e) { return null; }
    }

    /**
     * Returns true only when there is positive evidence that the game owned by
     * this session is gone. With no evidence the session is left alone.
     */
    private boolean gameExited() {
        try {
            Bundle args = new Bundle();
            args.putString("op", "sessionWatch");
            Bundle response = getContentResolver().call(
                    SystemCallProvider.uri(this), SystemCallProvider.METHOD, null, args);
            if (response == null) return false;
            String json = response.getString("json", "");
            if (json == null || json.trim().isEmpty()) return false;
            JSONObject value = new JSONObject(json);
            String verdict = value.optString("verdict", "UNKNOWN");
            if ("GAME_ALIVE".equals(verdict)) return false;
            if ("GAME_EXITED".equals(verdict)) return true;

            // Legacy fallback when only Usage access is available.
            String top = topPackage();
            return top != null && !top.equals(getPackageName())
                    && !top.equals(sessionPackage)
                    && !"com.miniclip.eightballpool".equals(top);
        } catch (Exception ignored) {
            return false;
        }
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        if (active) stopSessionInternal("TASK_REMOVED");
        super.onTaskRemoved(rootIntent);
    }

    private void showLines(String json) {
        if (!canOverlay(this)) return;
        main.post(() -> {
            try {
                if (lineView == null) createLineLayer();
                if (lineView instanceof D0JLineLayer) ((D0JLineLayer) lineView).setSpecs(json);
            } catch (Exception ignored) { }
        });
    }

    private void clearLines() {
        main.post(() -> {
            if (lineView instanceof D0JLineLayer) ((D0JLineLayer) lineView).clear();
        });
    }

    private void createLineLayer() {
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        int flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
        lineParams = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                type, flags, PixelFormat.TRANSLUCENT);
        lineParams.gravity = Gravity.TOP | Gravity.START;
        D0JLineLayer layer = new D0JLineLayer(this);
        lineView = layer;
        try { windowManager.addView(lineView, lineParams); } catch (Exception ignored) { lineView = null; }
    }

    private void removeLineLayer() {
        if (lineView != null) {
            try { windowManager.removeView(lineView); } catch (Exception ignored) { }
            lineView = null;
        }
    }

    private void removeMenu() {
        if (menuView != null) {
            try { windowManager.removeView(menuView); } catch (Exception ignored) {}
            menuView = null;
            menuWebView = null;
        }
    }

    private void removeFloat() {
        if (floatButton != null) {
            try { windowManager.removeView(floatButton); } catch (Exception ignored) {}
            floatButton = null;
        }
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    @Override public void onDestroy() {
        main.removeCallbacks(sessionWatchdog);
        main.removeCallbacks(hideToastRunnable);
        removeMenu();
        removeToast();
        removeFloat();
        removeLineLayer();
        active = false;
        super.onDestroy();
    }
}

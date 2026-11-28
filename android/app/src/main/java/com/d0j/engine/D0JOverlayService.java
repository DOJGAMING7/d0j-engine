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
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageView;
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
    private static java.lang.ref.WeakReference<D0JOverlayService> instanceRef =
            new java.lang.ref.WeakReference<>(null);

    static void onConfigChanged(JSObject patch) {
        D0JOverlayService service = instanceRef.get();
        if (service == null) return;
        service.main.post(service::refreshQuickControls);
    }

    public static boolean canOverlay(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
    }

    private final Handler main = new Handler(Looper.getMainLooper());
    private WindowManager windowManager;
    private View floatButton;
    private View menuView;
    private android.webkit.WebView menuWebView;
    private LinearLayout toastView;
    private WindowManager.LayoutParams buttonParams;
    private WindowManager.LayoutParams menuParams;
    private LinearLayout menuContent;
    private String menuTab = "status";
    private TextView menuTimer;
    private long sessionStartedAt;
    private Button floatAutoBtn;
    private Button floatQueueBtn;
    private final java.util.HashMap<String, Button> menuTabButtons = new java.util.HashMap<>();
    private final Runnable menuTimerTick = new Runnable() {
        @Override public void run() {
            if (menuTimer == null) return;
            long elapsed = Math.max(0, System.currentTimeMillis() - sessionStartedAt);
            long h = elapsed / 3600000L;
            long m = (elapsed / 60000L) % 60L;
            long s = (elapsed / 1000L) % 60L;
            long cs = (elapsed / 10L) % 100L;
            menuTimer.setText(String.format(java.util.Locale.US, "%02d : %02d : %02d : %02d", h, m, s, cs));
            main.postDelayed(this, 100);
        }
    };
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
                // Hide the menu on the first positive evidence tick so the UI
                // never lingers after the game is gone. Full teardown waits for
                // a second confirmation.
                if (gameExitTicks == 1) {
                    removeMenu();
                    removeToast();
                }
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
        instanceRef = new java.lang.ref.WeakReference<>(this);
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
        if (!active) sessionStartedAt = System.currentTimeMillis();
        D0JPrefs.setBoolean(this, D0JPrefs.SESSION_ACTIVE, true);
        D0JPrefs.setString(this, D0JPrefs.SESSION_PACKAGE, sessionPackage);
        startForegroundCompat();
        if (floatButton == null) createFloatButton();
        if (lineView == null && canOverlay(this)) createLineLayer();
        active = true;
        gameExitTicks = 0;
        main.removeCallbacks(sessionWatchdog);
        main.postDelayed(sessionWatchdog, 2000);

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
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "SNAKE ENGINE Session", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("SNAKE ENGINE session status and actions");
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
        b.setContentTitle("SNAKE ENGINE active")
                .setContentText(statusText)
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(appPi())
                .addAction(new Notification.Action.Builder(null, "Open Menu", pi(ACTION_OPEN_MENU, 1)).build())
                .addAction(new Notification.Action.Builder(null, "Stop", pi(ACTION_STOP_SESSION, 2)).build());
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, n,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                            | ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    private void createFloatButton() {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int width = dp(66);

        LinearLayout rail = new LinearLayout(this);
        rail.setOrientation(LinearLayout.VERTICAL);
        rail.setGravity(Gravity.CENTER_HORIZONTAL);
        rail.setPadding(dp(4), dp(4), dp(4), dp(4));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#121212"));
        bg.setCornerRadius(dp(18));
        bg.setStroke(dp(1), Color.parseColor("#333333"));
        rail.setBackground(bg);

        TextView handle = new TextView(this);
        handle.setText("SNAKE");
        handle.setGravity(Gravity.CENTER);
        handle.setTextColor(Color.parseColor("#3BD62B"));
        handle.setTypeface(Typeface.DEFAULT_BOLD);
        handle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 8);
        handle.setLetterSpacing(0.08f);
        handle.setBackgroundColor(Color.TRANSPARENT);
        rail.addView(handle, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(20)));

        floatAutoBtn = quickButton("PLAY", "autoPlay");
        floatQueueBtn = quickButton("QUEUE", "autoQueue");
        Button menuBtn = quickButton("MENU", null);
        menuBtn.setOnClickListener(v -> togglePanel());

        LinearLayout.LayoutParams quickLp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(46));
        quickLp.topMargin = dp(3);
        rail.addView(floatAutoBtn, quickLp);
        rail.addView(floatQueueBtn, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(46)));
        rail.addView(menuBtn, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(46)));

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        int flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL;
        buttonParams = new WindowManager.LayoutParams(width, WindowManager.LayoutParams.WRAP_CONTENT, type, flags, PixelFormat.TRANSLUCENT);
        buttonParams.gravity = Gravity.TOP | Gravity.START;
        buttonParams.x = Math.max(0, Math.min(dm.widthPixels - width,
                D0JPrefs.getInt(this, D0JPrefs.FLOAT_X, Math.max(0, dm.widthPixels - width - dp(12)))));
        buttonParams.y = Math.max(0, Math.min(dm.heightPixels - dp(190),
                D0JPrefs.getInt(this, D0JPrefs.FLOAT_Y, dp(120))));

        handle.setOnTouchListener(new View.OnTouchListener() {
            float downX, downY; int startX, startY; boolean moved;
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = e.getRawX(); downY = e.getRawY();
                        startX = buttonParams.x; startY = buttonParams.y;
                        moved = false; return true;
                    case MotionEvent.ACTION_MOVE:
                        int dx = (int) (e.getRawX() - downX); int dy = (int) (e.getRawY() - downY);
                        if (Math.abs(dx) > dp(4) || Math.abs(dy) > dp(4)) moved = true;
                        DisplayMetrics metrics = getResources().getDisplayMetrics();
                        buttonParams.x = Math.max(0, Math.min(metrics.widthPixels - dp(66), startX + dx));
                        buttonParams.y = Math.max(0, Math.min(metrics.heightPixels - dp(190), startY + dy));
                        try { windowManager.updateViewLayout(floatButton, buttonParams); } catch (Exception ignored) {}
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (moved) {
                            D0JPrefs.setInt(D0JOverlayService.this, D0JPrefs.FLOAT_X, buttonParams.x);
                            D0JPrefs.setInt(D0JOverlayService.this, D0JPrefs.FLOAT_Y, buttonParams.y);
                        }
                        return true;
                }
                return false;
            }
        });

        floatButton = rail;
        refreshQuickControls();
        try { windowManager.addView(floatButton, buttonParams); } catch (Exception ignored) { floatButton = null; }
    }

    private Button quickButton(String label, String key) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 9);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setPadding(0, 0, 0, 0);
        b.setMinHeight(0);
        b.setMinimumHeight(0);
        b.setTag(label);
        if (key != null) b.setOnClickListener(v -> toggleQuick(key));
        styleQuickButton(b, label, key);
        return b;
    }

    private void styleQuickButton(Button button, String label, String key) {
        boolean on = key != null && D0JPrefs.getConfigBoolean(this, key, false);
        button.setText(label + "\n" + (key == null ? "OPEN" : (on ? "ON" : "OFF")));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(key != null && on ? "#173A12" : "#1A1A1A"));
        bg.setCornerRadius(dp(12));
        bg.setStroke(dp(1), Color.parseColor(key != null && on ? "#3BD62B" : "#333333"));
        button.setBackground(bg);
        button.setTextColor(Color.parseColor(key != null && on ? "#7CFC3A" : "#A0A0A0"));
    }

    private void refreshQuickControls() {
        if (floatAutoBtn != null) styleQuickButton(floatAutoBtn, "PLAY", "autoPlay");
        if (floatQueueBtn != null) styleQuickButton(floatQueueBtn, "QUEUE", "autoQueue");
    }

    private void toggleQuick(String key) {
        boolean next = !D0JPrefs.getConfigBoolean(this, key, false);
        D0JPrefs.setString(this, D0JPrefs.CONFIG_PREFIX + key, String.valueOf(next));
        refreshQuickControls();
        JSObject patch = new JSObject();
        patch.put(key, next);
        D0JNativePlugin.notifyConfigChanged(patch);
        boolean auto = "autoPlay".equals(key);
        showToast((auto ? "AUTO PLAY " : "AUTO QUEUE ") + (next ? "ON" : "OFF"), next ? "pass" : "info");
    }

    private void togglePanel() {
        if (menuView != null) removeMenu();
        else showMenu();
    }

    private void showMenu() {
        if (menuView != null) return;
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int width = Math.min(dm.widthPixels - dp(16), dp(560));
        int height = Math.min(dm.heightPixels - dp(96), dp(640));

        GradientDrawable shellBg = new GradientDrawable();
        shellBg.setColor(Color.parseColor("#1A1A1A"));
        shellBg.setCornerRadius(dp(24));
        shellBg.setStroke(dp(1), Color.parseColor("#333333"));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.HORIZONTAL);
        root.setBackground(shellBg);
        root.setPadding(dp(8), dp(8), dp(8), dp(8));

        LinearLayout main = new LinearLayout(this);
        main.setOrientation(LinearLayout.VERTICAL);
        main.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f));

        LinearLayout side = new LinearLayout(this);
        side.setOrientation(LinearLayout.VERTICAL);
        side.setGravity(Gravity.CENTER_HORIZONTAL);
        side.setPadding(dp(6), dp(8), dp(6), dp(8));
        side.setLayoutParams(new LinearLayout.LayoutParams(dp(72), LinearLayout.LayoutParams.MATCH_PARENT));
        GradientDrawable sideBg = new GradientDrawable();
        sideBg.setColor(Color.parseColor("#161616"));
        sideBg.setCornerRadius(dp(18));
        sideBg.setStroke(dp(1), Color.parseColor("#333333"));
        side.setBackground(sideBg);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(6), dp(4), dp(6), dp(8));
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.ic_snake_mark);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logo.setPadding(dp(3), dp(3), dp(3), dp(3));
        GradientDrawable logoBg = new GradientDrawable();
        logoBg.setColor(Color.parseColor("#0B0B0D"));
        logoBg.setCornerRadius(dp(14));
        logoBg.setStroke(dp(1), Color.parseColor("#333333"));
        logo.setBackground(logoBg);
        header.addView(logo, new LinearLayout.LayoutParams(dp(44), dp(44)));

        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setPadding(dp(10), 0, 0, 0);
        TextView title = new TextView(this);
        title.setText("SNAKE ENGINE");
        title.setTextColor(Color.parseColor("#3BD62B"));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        copy.addView(title);
        TextView sub = new TextView(this);
        sub.setText("8 Ball Pool · v56.34.0");
        sub.setTextColor(Color.parseColor("#9A9AA0"));
        sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 9);
        copy.addView(sub);
        header.addView(copy, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        menuTimer = new TextView(this);
        menuTimer.setTextColor(Color.parseColor("#F2F2F2"));
        menuTimer.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        menuTimer.setTypeface(Typeface.DEFAULT_BOLD);
        menuTimer.setGravity(Gravity.CENTER);
        menuTimer.setPadding(dp(8), dp(6), dp(8), dp(6));
        GradientDrawable timerBg = new GradientDrawable();
        timerBg.setColor(Color.parseColor("#262626"));
        timerBg.setCornerRadius(dp(10));
        menuTimer.setBackground(timerBg);
        header.addView(menuTimer, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        main.removeCallbacks(menuTimerTick);
        main.post(menuTimerTick);
        main.addView(header);

        ScrollView scroll = new ScrollView(this);
        menuContent = new LinearLayout(this);
        menuContent.setOrientation(LinearLayout.VERTICAL);
        menuContent.setPadding(0, dp(4), 0, dp(8));
        scroll.addView(menuContent);
        scroll.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        main.addView(scroll);

        root.addView(main);
        root.addView(side);

        TextView app = new TextView(this);
        app.setText("8BP");
        app.setGravity(Gravity.CENTER);
        app.setTextColor(Color.parseColor("#7CFC3A"));
        app.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        app.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable appBg = new GradientDrawable();
        appBg.setColor(Color.parseColor("#242424"));
        appBg.setCornerRadius(dp(16));
        appBg.setStroke(dp(1), Color.parseColor("#3A3A3A"));
        app.setBackground(appBg);
        side.addView(app, new LinearLayout.LayoutParams(dp(52), dp(52)));
        side.addView(divider());

        menuTabButtons.clear();
        String[][] tabs = {
                { "status", "◎", "Status" },
                { "lines", "╱", "Lines" },
                { "autoplay", "▶", "Auto" },
                { "queue", "☰", "Queue" },
                { "eightball", "8", "8 Ball" },
                { "settings", "⚙", "Settings" }
        };
        for (String[] item : tabs) {
            Button tab = smallBtn(item[1]);
            tab.setContentDescription(item[2]);
            final String id = item[0];
            tab.setOnClickListener(v -> {
                menuTab = id;
                D0JPrefs.setString(D0JOverlayService.this, "menu_tab", id);
                renderMenuTab(id);
            });
            menuTabButtons.put(id, tab);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(52), dp(52));
            lp.bottomMargin = dp(6);
            side.addView(tab, lp);
        }
        side.addView(divider());
        Button close = smallBtn("X");
        close.setContentDescription("Close menu");
        close.setOnClickListener(v -> removeMenu());
        side.addView(close, new LinearLayout.LayoutParams(dp(52), dp(52)));

        View.OnTouchListener drag = new View.OnTouchListener() {
            float dx, dy; int sx, sy;
            @Override public boolean onTouch(View v, MotionEvent e) {
                if (menuParams == null || menuView == null) return false;
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        dx = e.getRawX(); dy = e.getRawY(); sx = menuParams.x; sy = menuParams.y; return true;
                    case MotionEvent.ACTION_MOVE:
                        menuParams.x = Math.max(0, sx + (int)(e.getRawX() - dx));
                        menuParams.y = Math.max(0, sy + (int)(e.getRawY() - dy));
                        try { windowManager.updateViewLayout(menuView, menuParams); } catch (Exception ignored) { }
                        return true;
                    case MotionEvent.ACTION_UP:
                        D0JPrefs.setInt(D0JOverlayService.this, D0JPrefs.FLOAT_X, menuParams.x);
                        D0JPrefs.setInt(D0JOverlayService.this, D0JPrefs.FLOAT_Y, menuParams.y);
                        return true;
                }
                return false;
            }
        };
        // Drag only from the header: consuming touches on the side rail would
        // swallow tab and close-button clicks.
        header.setOnTouchListener(drag);

        menuTab = D0JPrefs.getString(this, "menu_tab", "status");
        if (!menuTabButtons.containsKey(menuTab)) menuTab = "status";
        renderMenuTab(menuTab);

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        menuParams = new WindowManager.LayoutParams(width, height, type,
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        menuParams.gravity = Gravity.TOP | Gravity.START;
        menuParams.x = D0JPrefs.getInt(this, D0JPrefs.FLOAT_X, dp(10));
        menuParams.y = Math.max(dp(40), D0JPrefs.getInt(this, D0JPrefs.FLOAT_Y, dp(90)));

        menuView = root;
        try { windowManager.addView(menuView, menuParams); } catch (Exception ignored) { menuView = null; }
    }

    private boolean findingShot() {
        String value = String.valueOf(statusState).toLowerCase();
        return value.contains("test") || value.contains("find");
    }

    private View divider() {
        View view = new View(this);
        view.setBackgroundColor(Color.parseColor("#333333"));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(34), dp(1));
        lp.topMargin = dp(8);
        lp.bottomMargin = dp(8);
        view.setLayoutParams(lp);
        return view;
    }

    private void styleMenuTabs(String active) {
        for (java.util.Map.Entry<String, Button> entry : menuTabButtons.entrySet()) {
            boolean on = entry.getKey().equals(active);
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(Color.parseColor(on ? "#232323" : "#1B1B1B"));
            bg.setCornerRadius(dp(16));
            bg.setStroke(dp(1), Color.parseColor(on ? "#7CFC3A" : "#303030"));
            entry.getValue().setBackground(bg);
            entry.getValue().setTextColor(Color.parseColor(on ? "#7CFC3A" : "#F2F2F2"));
        }
    }

    private void renderMenuTab(String id) {
        if (menuContent == null) return;
        menuContent.removeAllViews();
        styleMenuTabs(id);

        if ("status".equals(id)) {
            menuContent.addView(section("Session"));
            menuContent.addView(infoText("Client: " + statusText));
            menuContent.addView(infoText("Target: " + sessionPackage));
            menuContent.addView(infoText("Overlay: active · session-scoped"));
            try {
                org.json.JSONObject hooks = com.d0j.engine.vm.VMHookInstaller.report();
                menuContent.addView(infoText("Hooks: " + hooks.optString("state", "PENDING")
                        + " · redirect=" + hooks.optString("redirect", "UNAVAILABLE")));
            } catch (Exception ignored) { }
            menuContent.addView(section("Quick Actions"));
            menuContent.addView(actionRow("Run Quick Test", v -> D0JNativePlugin.notifyMenuCommand("runTest")));
            menuContent.addView(actionRow("Open App / Export Probe", v -> D0JNativePlugin.notifyMenuCommand("openMenu")));
            menuContent.addView(actionRow("Launch 8BP", v -> D0JNativePlugin.notifyMenuCommand("launch8bp")));
            menuContent.addView(actionRow("Stop Session", v -> { D0JNativePlugin.notifyMenuCommand("stop"); stopSessionInternal(); }));
            menuContent.addView(section("VM Host"));
            menuContent.addView(actionRow("VM Host Status", v -> D0JNativePlugin.notifyMenuCommand("vmStatus")));
            menuContent.addView(actionRow("Start VM Host", v -> D0JNativePlugin.notifyMenuCommand("vmStart")));
            menuContent.addView(actionRow("VM Hook Status", v -> D0JNativePlugin.notifyMenuCommand("vmHooks")));
            menuContent.addView(actionRow("Attach VM Hooks", v -> D0JNativePlugin.notifyMenuCommand("vmAttach")));
            menuContent.addView(actionRow("Session Guard Check", v -> D0JNativePlugin.notifyMenuCommand("sessionGuard")));
            menuContent.addView(infoText("Quick test never blocks launch. Hook detail appears as a temp notification and in Settings."));
            return;
        }

        if ("lines".equals(id)) {
            menuContent.addView(section("Line Prediction"));
            addToggle(menuContent, "Show lines", "showLines", true);
            addToggle(menuContent, "Keep lines after shot", "keepLines", true);
            addToggle(menuContent, "Power lock", "powerLock", false);
            addSeek(menuContent, "Default power", "power", 0, 100, 74, "%");
            addToggle(menuContent, "Show pockets", "showPockets", true);
            addSeek(menuContent, "Spin", "lineSpin", -100, 100, 0, "");
            addSeek(menuContent, "Line opacity", "lineOpacity", 10, 100, 85, "%");
            addSeek(menuContent, "Guide opacity", "guideOpacity", 10, 100, 70, "%");
            menuContent.addView(actionRow("Run All Prediction Lines", v -> D0JNativePlugin.notifyMenuCommand("runLineTest")));
            menuContent.addView(actionRow("Run Lines From State", v -> D0JNativePlugin.notifyMenuCommand("runLiveLines")));
            menuContent.addView(actionRow("Start Live Overlay Lines", v -> D0JNativePlugin.notifyMenuCommand("liveStart")));
            menuContent.addView(actionRow("Stop Live Overlay Lines", v -> D0JNativePlugin.notifyMenuCommand("liveStop")));
            menuContent.addView(actionRow("Open Line Prediction Test", v -> D0JNativePlugin.notifyMenuCommand("openTable")));
            menuContent.addView(infoText("Live lines stay simulated until real state is measured on your device."));
            return;
        }

        if ("autoplay".equals(id)) {
            menuContent.addView(section("Auto Play"));
            addToggle(menuContent, "Enable auto play", "autoPlay", false);
            addChoice(menuContent, "Auto play mode", "autoPlayMode", new String[]{"Pro Fast","Pro Player","Fast Mode"});
            addToggle(menuContent, "Failed break", "failedBreak", false);
            menuContent.addView(actionRow("Run Ratimoda", v -> D0JNativePlugin.notifyMenuCommand("autoplay")));
            menuContent.addView(actionRow("Attach Live Input", v -> D0JNativePlugin.notifyMenuCommand("inputAttach")));
            menuContent.addView(actionRow("Start Live Auto", v -> D0JNativePlugin.notifyMenuCommand("autoLiveStart")));
            menuContent.addView(actionRow("Stop Live Auto", v -> D0JNativePlugin.notifyMenuCommand("autoLiveStop")));
            menuContent.addView(infoText("Finding-shot indicator and temp notifications are enabled by default."));
            return;
        }

        if ("queue".equals(id)) {
            menuContent.addView(section("Auto Queue"));
            addToggle(menuContent, "Auto queue", "autoQueue", false);
            addChoice(menuContent, "Queue mode", "queueMode", new String[]{"ONE","SESSION","INFINITE"});
            addSeek(menuContent, "Match limit", "matchLimit", 1, 20, 3, "");
            addSeek(menuContent, "Delay", "queueDelay", 1, 10, 2, "s");
            addSeek(menuContent, "Jitter", "jitter", 0, 20, 4, "x0.1s");
            addSeek(menuContent, "Retries", "retries", 0, 5, 2, "");
            addToggle(menuContent, "Stop on manual input", "stopOnManual", true);
            addChoice(menuContent, "Queue table (coins)", "queueTable", new String[]{"London","Moscow","Beijing","Barcelona"});
            return;
        }

        if ("eightball".equals(id)) {
            menuContent.addView(section("8 Ball Play"));
            addToggle(menuContent, "Prioritize 9th ball", "prioritize9", false);
            addToggle(menuContent, "Paralysis opponent turn", "paralysisOpponent", false);
            addToggle(menuContent, "Clean up shot", "cleanUpShot", false);
            menuContent.addView(section("Golden Shot"));
            addChoice(menuContent, "Golden shot target", "goldenTarget", new String[]{"1","2","3","4"});
            menuContent.addView(infoText("Golden target: center [1] to last ring [4]."));
            return;
        }

        menuContent.addView(section("Session"));
        addToggle(menuContent, "Auto-stop when 8BP closes", "autoStopOnGameExit", false);
        menuContent.addView(infoText("Auto-stop needs Usage access permission (optional)."));
        menuContent.addView(section("Live Feedback"));
        addToggle(menuContent, "Persistent notification", "notificationsEnabled", true);
        addToggle(menuContent, "Temp cheat notifications", "tempNotifications", true);
        addToggle(menuContent, "Run quick test on launch", "runTestOnLaunch", true);
        menuContent.addView(actionRow("Notification Permission", v -> D0JNativePlugin.notifyMenuCommand("requestNotifications")));
        menuContent.addView(actionRow("Usage Access", v -> D0JNativePlugin.notifyMenuCommand("requestUsage")));
        menuContent.addView(section("Device Setup"));
        menuContent.addView(actionRow("Open App / Export Probe", v -> D0JNativePlugin.notifyMenuCommand("openMenu")));
        menuContent.addView(infoText("Copy probe JSON in Settings after Capture A, Capture B and Diff."));
        menuContent.addView(section("Notes"));
        menuContent.addView(infoText("A1: no accessibility / no auto-back."));
        menuContent.addView(infoText("Real 8BP live lines need measured state and an attached hosted activity."));
    }

    private TextView section(String text) {
        TextView tv = new TextView(this);
        tv.setText("▍ " + text.toUpperCase());
        tv.setTextColor(Color.parseColor("#F2F2F2"));
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        tv.setTypeface(Typeface.DEFAULT_BOLD);
        tv.setPadding(dp(10), dp(10), dp(10), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#232323"));
        bg.setCornerRadius(dp(10));
        bg.setStroke(dp(1), Color.parseColor("#333333"));
        tv.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(10);
        lp.bottomMargin = dp(4);
        tv.setLayoutParams(lp);
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
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(14), dp(9), dp(14), dp(9));
        styleToggleRow(row, checked);

        TextView text = new TextView(this);
        text.setText(label);
        text.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        text.setTextColor(Color.parseColor(checked ? "#FFD400" : "#F2F2F2"));
        row.addView(text, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        Switch toggle = new Switch(this);
        toggle.setChecked(checked);
        toggle.setShowText(false);
        styleToggleSwitch(toggle, checked);
        toggle.setOnCheckedChangeListener((buttonView, isChecked) -> {
            D0JPrefs.setString(D0JOverlayService.this, D0JPrefs.CONFIG_PREFIX + key, String.valueOf(isChecked));
            styleToggleRow(row, isChecked);
            text.setTextColor(Color.parseColor(isChecked ? "#FFD400" : "#F2F2F2"));
            styleToggleSwitch(toggle, isChecked);
            JSObject patch = new JSObject();
            patch.put(key, isChecked);
            D0JNativePlugin.notifyConfigChanged(patch);
        });
        row.addView(toggle, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(8);
        row.setLayoutParams(lp);
        content.addView(row);
    }

    private void styleToggleRow(LinearLayout row, boolean checked) {
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(checked ? Color.parseColor("#332E10") : Color.parseColor("#191919"));
        bg.setCornerRadius(dp(12));
        bg.setStroke(dp(1), Color.parseColor(checked ? "#FFD400" : "#333333"));
        row.setBackground(bg);
    }

    private void styleToggleSwitch(Switch toggle, boolean checked) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            toggle.setThumbTintList(android.content.res.ColorStateList.valueOf(
                    Color.parseColor(checked ? "#FFF8D6" : "#C9C9C9")));
            toggle.setTrackTintList(android.content.res.ColorStateList.valueOf(
                    Color.parseColor(checked ? "#FFD400" : "#3A3A3A")));
        }
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
        head.setTextColor(Color.parseColor("#F2F2F2"));
        head.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        wrap.addView(head);
        SeekBar sb = new SeekBar(this);
        sb.setMax(max - min);
        sb.setProgress(val - min);
        try {
            android.content.res.ColorStateList yellow =
                    android.content.res.ColorStateList.valueOf(Color.parseColor("#FFD400"));
            sb.setProgressTintList(yellow);
            sb.setThumbTintList(yellow);
        } catch (Exception ignored) { }
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
                    bbg.setColor(active ? Color.parseColor("#2E2E2E") : Color.parseColor("#222222"));
                    bbg.setCornerRadius(dp(10));
                    bbg.setStroke(dp(1), Color.parseColor(active ? "#7CFC3A" : "#444444"));
                    b.setBackground(bbg);
                    b.setTextColor(Color.parseColor(active ? "#7CFC3A" : "#F2F2F2"));
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
        t.setText("SNAKE ENGINE");
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
        main.removeCallbacks(menuTimerTick);
        if (menuView != null) {
            try { windowManager.removeView(menuView); } catch (Exception ignored) {}
            menuView = null;
            menuWebView = null;
        }
        menuContent = null;
        menuTimer = null;
        menuTabButtons.clear();
    }

    private void removeFloat() {
        if (floatButton != null) {
            try { windowManager.removeView(floatButton); } catch (Exception ignored) {}
            floatButton = null;
        }
        floatAutoBtn = null;
        floatQueueBtn = null;
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    @Override public void onDestroy() {
        instanceRef = new java.lang.ref.WeakReference<>(null);
        main.removeCallbacks(menuTimerTick);
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

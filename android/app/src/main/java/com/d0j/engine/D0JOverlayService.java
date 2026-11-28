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

import com.getcapacitor.JSObject;

public class D0JOverlayService extends Service {
    public static final String ACTION_START_SESSION = "com.d0j.engine.action.START_SESSION";
    public static final String ACTION_STOP_SESSION = "com.d0j.engine.action.STOP_SESSION";
    public static final String ACTION_UPDATE_STATUS = "com.d0j.engine.action.UPDATE_STATUS";
    public static final String ACTION_OPEN_MENU = "com.d0j.engine.action.OPEN_MENU";
    public static final String ACTION_OPEN_APP = "com.d0j.engine.action.OPEN_APP";

    private static final String CHANNEL_ID = "d0j_session";
    private static final int NOTIFICATION_ID = 7701;
    private static volatile boolean active = false;

    private final Handler main = new Handler(Looper.getMainLooper());
    private WindowManager windowManager;
    private View floatButton;
    private LinearLayout panelView;
    private WindowManager.LayoutParams buttonParams;
    private WindowManager.LayoutParams panelParams;
    private String sessionPackage = "com.miniclip.eightballpool";
    private String statusText = "Session active";
    private String statusState = "running";
    private TextView statusLabel;
    private TextView statusDot;
    private final Runnable sessionWatchdog = new Runnable() {
        @Override public void run() {
            if (!active) return;
            // Failsafe: if session flag was cleared externally, stop.
            if (!D0JPrefs.getBoolean(D0JOverlayService.this, D0JPrefs.SESSION_ACTIVE, false)) {
                stopSessionInternal();
                return;
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
                showPanel();
                return START_STICKY;
            case ACTION_OPEN_APP:
                openApp();
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
        active = true;
        updateStatusUi();
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
            updateStatusUi();
        }
    }

    private void stopSessionInternal() {
        active = false;
        D0JPrefs.setBoolean(this, D0JPrefs.SESSION_ACTIVE, false);
        D0JPrefs.setString(this, D0JPrefs.SESSION_STATUS, "stopped");
        D0JPrefs.setString(this, D0JPrefs.SESSION_STATUS_TEXT, "Session stopped");
        main.removeCallbacks(sessionWatchdog);
        removePanel();
        removeFloat();
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
        if (panelView != null) removePanel();
        else showPanel();
    }

    private void showPanel() {
        if (panelView != null) { updateStatusUi(); return; }
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int width = Math.min(dm.widthPixels - dp(24), dp(420));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#121212"));
        bg.setCornerRadius(dp(20));
        bg.setStroke(dp(1), Color.parseColor("#343434"));
        root.setBackground(bg);
        root.setPadding(dp(14), dp(12), dp(14), dp(14));

        // Header
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = new TextView(this);
        title.setText("D0J ENGINE");
        title.setTextColor(Color.WHITE);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        LinearLayout.LayoutParams tLp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        header.addView(title, tLp);
        Button close = smallBtn("X");
        close.setOnClickListener(v -> removePanel());
        header.addView(close);
        root.addView(header);

        statusLabel = new TextView(this);
        statusLabel.setTextColor(Color.parseColor("#D0D0D0"));
        statusLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        statusLabel.setPadding(0, dp(4), 0, dp(10));
        root.addView(statusLabel);

        ScrollView scroll = new ScrollView(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content);
        LinearLayout.LayoutParams scrollLp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, Math.min(dm.heightPixels - dp(180), dp(520)));
        root.addView(scroll, scrollLp);

        content.addView(section("Session"));
        content.addView(actionRow("Open App", v -> openApp()));
        content.addView(actionRow("Launch 8BP", v -> launchPackage(sessionPackage)));
        content.addView(actionRow("Stop Session", v -> {
            D0JNativePlugin.notifyMenuCommand("stop");
            stopSessionInternal();
        }));

        content.addView(section("Actions"));
        content.addView(actionRow("Run Quick Test", v -> D0JNativePlugin.notifyMenuCommand("runTest")));
        content.addView(actionRow("Toggle Auto Play", v -> D0JNativePlugin.notifyMenuCommand("toggleAutoPlay")));
        content.addView(actionRow("Open Mod Menu", v -> { openApp(); removePanel(); }));

        content.addView(section("Info"));
        content.addView(infoText("Home screen is clean. Cheats are in mod menu during session."));
        content.addView(infoText("Live 8BP lines need in-game bridge/patch. Overlay shows session controls only."));

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        panelParams = new WindowManager.LayoutParams(width, WindowManager.LayoutParams.WRAP_CONTENT, type,
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        panelParams.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        panelParams.y = dp(80);
        panelView = root;
        try { windowManager.addView(panelView, panelParams); } catch (Exception ignored) { panelView = null; }
        updateStatusUi();
    }

    private TextView section(String text) {
        TextView tv = new TextView(this);
        tv.setText(text.toUpperCase());
        tv.setTextColor(Color.parseColor("#FFFFFF"));
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        tv.setTypeface(Typeface.DEFAULT_BOLD);
        tv.setPadding(0, dp(10), 0, dp(6));
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

    private void updateStatusUi() {
        if (statusLabel != null) statusLabel.setText(statusText + " • " + sessionPackage);
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

    private void removePanel() {
        if (panelView != null) {
            try { windowManager.removeView(panelView); } catch (Exception ignored) {}
            panelView = null;
            statusLabel = null;
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
        removePanel();
        removeFloat();
        active = false;
        super.onDestroy();
    }
}

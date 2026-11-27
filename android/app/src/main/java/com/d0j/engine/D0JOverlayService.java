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
import android.os.IBinder;
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
    private static final String CHANNEL_ID = "d0j_floating";
    private static final int NOTIFICATION_ID = 9101;
    private static volatile boolean active = false;

    private WindowManager windowManager;
    private View floatingButton;
    private View menuPanel;
    private WindowManager.LayoutParams buttonParams;
    private WindowManager.LayoutParams panelParams;

    public static boolean isActive() {
        return active;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        startAsForeground();
        addFloatingButton();
        active = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        removeView(floatingButton);
        removeView(menuPanel);
        floatingButton = null;
        menuPanel = null;
        active = false;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startAsForeground() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "D0J Floating", NotificationManager.IMPORTANCE_LOW);
                channel.setDescription("Draggable D0J mod menu button");
                manager.createNotificationChannel(channel);
            }
        }

        Intent open = new Intent(this, MainActivity.class);
        open.putExtra("openMenu", true);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending = PendingIntent.getActivity(this, 0, open, flags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        Notification notification = builder
                .setContentTitle("D0J EnGine")
                .setContentText("Floating D0J button is active")
                .setSmallIcon(android.R.drawable.stat_notify_more)
                .setOngoing(true)
                .setContentIntent(pending)
                .build();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, 0);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception ignored) {}
    }

    private void addFloatingButton() {
        TextView button = new TextView(this);
        button.setText("D0J");
        button.setTextColor(Color.parseColor("#39FF14"));
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setPadding(dp(15), dp(10), dp(15), dp(10));
        button.setBackground(rounded("#080D08", "#39FF14", 22));

        int x = D0JPrefs.getInt(this, D0JPrefs.FLOAT_X, 24);
        int y = D0JPrefs.getInt(this, D0JPrefs.FLOAT_Y, dp(210));
        buttonParams = overlayParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, x, y, false);
        windowManager.addView(button, buttonParams);
        floatingButton = button;

        final int[] start = new int[2];
        final int[] origin = new int[2];
        final boolean[] moved = new boolean[1];
        final long[] downAt = new long[1];

        button.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    start[0] = (int) event.getRawX();
                    start[1] = (int) event.getRawY();
                    origin[0] = buttonParams.x;
                    origin[1] = buttonParams.y;
                    moved[0] = false;
                    downAt[0] = System.currentTimeMillis();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    int dx = (int) (event.getRawX() - start[0]);
                    int dy = (int) (event.getRawY() - start[1]);
                    if (Math.abs(dx) > 7 || Math.abs(dy) > 7) moved[0] = true;
                    buttonParams.x = origin[0] + dx;
                    buttonParams.y = origin[1] + dy;
                    try { windowManager.updateViewLayout(button, buttonParams); } catch (Exception ignored) {}
                    return true;
                case MotionEvent.ACTION_UP:
                    if (!moved[0] && System.currentTimeMillis() - downAt[0] < 600) togglePanel();
                    D0JPrefs.setInt(this, D0JPrefs.FLOAT_X, buttonParams.x);
                    D0JPrefs.setInt(this, D0JPrefs.FLOAT_Y, buttonParams.y);
                    return true;
                default:
                    return false;
            }
        });
    }

    private void togglePanel() {
        if (menuPanel != null) {
            removeView(menuPanel);
            menuPanel = null;
            return;
        }
        menuPanel = buildPanel();
        windowManager.addView(menuPanel, panelParams);
        D0JNativePlugin.notifyFloatingTap();
    }

    private View buildPanel() {
        DisplayMetrics metrics = new DisplayMetrics();
        windowManager.getDefaultDisplay().getMetrics(metrics);
        int width = Math.min(metrics.widthPixels - dp(24), dp(380));
        int height = Math.min(metrics.heightPixels - dp(80), dp(700));
        int x = clamp(buttonParams.x - dp(10), dp(8), Math.max(dp(8), metrics.widthPixels - width - dp(8)));
        int y = clamp(buttonParams.y + dp(62), dp(8), Math.max(dp(8), metrics.heightPixels - height - dp(8)));
        panelParams = overlayParams(width, height, x, y, true);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackground(rounded("#080D08", "#1F4A1F", 14));
        root.setPadding(dp(10), dp(8), dp(10), dp(8));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("D0J · HOME MENU", 13, "#39FF14", true);
        title.setPadding(dp(4), dp(4), dp(4), dp(6));
        title.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        final int[] start = new int[2];
        final int[] origin = new int[2];
        title.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    start[0] = (int) event.getRawX(); start[1] = (int) event.getRawY();
                    origin[0] = panelParams.x; origin[1] = panelParams.y;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    panelParams.x = origin[0] + (int) (event.getRawX() - start[0]);
                    panelParams.y = origin[1] + (int) (event.getRawY() - start[1]);
                    try { windowManager.updateViewLayout(menuPanel, panelParams); } catch (Exception ignored) {}
                    return true;
                default:
                    return false;
            }
        });
        Button close = smallButton("✕", "#FF4D4D");
        close.setOnClickListener(v -> togglePanel());
        header.addView(title);
        header.addView(close);
        root.addView(header);

        ScrollView scroll = new ScrollView(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content, new ScrollView.LayoutParams(ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        addActions(content);
        addSection(content, "BASIC SETTINGS");
        addToggle(content, "Show lines", "showLines", true);
        addToggle(content, "Keep lines after shot", "keepLines", true);
        addToggle(content, "Power lock", "powerLock", false);

        addSection(content, "OTHER SETTINGS");
        addPower(content);
        addToggle(content, "Show pockets", "showPockets", true);
        addToggle(content, "Purchase guard", "purchaseGuard", true);

        addSection(content, "AUTO PLAY SETTINGS");
        addToggle(content, "Enable auto play", "autoPlay", false);
        addChoice(content, "Auto play mode", "autoPlayMode", new String[]{"Pro Fast", "Pro Player", "Fast Mode"}, "Pro Fast");
        addToggle(content, "Failed break", "failedBreak", false);

        addSection(content, "8 BALL PLAY SETTINGS");
        addToggle(content, "Prioritize 9th ball", "prioritize9", false);
        addToggle(content, "Paralysis opponent turn", "paralysisOpponent", false);
        addToggle(content, "Clean up shot", "cleanUpShot", false);

        addSection(content, "GOLDEN SHOT SETTINGS");
        addChoice(content, "Golden shot target", "goldenTarget", new String[]{"1", "2", "3", "4"}, "1");

        addSection(content, "D0J AUTO QUEUE");
        addToggle(content, "Auto queue", "autoQueue", false);
        addChoice(content, "Queue count", "queueMode", new String[]{"ONE", "SESSION", "INFINITE"}, "ONE");

        addSection(content, "TABLE / STATE");
        addChoice(content, "Table profile", "tableProfile", new String[]{"London", "Moscow", "Beijing", "Barcelona"}, "London");

        addSection(content, "D0J CONTROLS");
        addCommandButton(content, "OPEN FULL MENU", "openFullMenu", "#39FF14");
        addCommandButton(content, "LINE TEST", "openTable", "#B6FF9E");
        addCommandButton(content, "STOP ALL", "stop", "#FF4D4D");

        return root;
    }

    private void addActions(LinearLayout parent) {
        LinearLayout row = row();
        addCommandButton(row, "PLAY", "play", "#F5FFF5");
        addCommandButton(row, "START", "start", "#F5FFF5");
        addCommandButton(row, "AUTOPLAY", "autoplay", "#39FF14");
        addCommandButton(row, "STOP", "stop", "#FF4D4D");
        parent.addView(row);
    }

    private void addSection(LinearLayout parent, String title) {
        TextView view = text(title, 11, "#B6FF9E", true);
        view.setBackground(rounded("#102010", "#1F4A1F", 8));
        view.setPadding(dp(8), dp(6), dp(8), dp(6));
        parent.addView(view, rowParams());
    }

    private void addToggle(LinearLayout parent, String label, String key, boolean fallback) {
        LinearLayout row = row();
        TextView name = text(label, 11, "#F5FFF5", false);
        name.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        Switch toggle = new Switch(this);
        toggle.setChecked(D0JPrefs.getConfigBoolean(this, key, fallback));
        toggle.setTextColor(Color.parseColor("#39FF14"));
        toggle.setOnCheckedChangeListener((buttonView, checked) -> {
            D0JPrefs.setString(this, D0JPrefs.CONFIG_PREFIX + key, String.valueOf(checked));
            JSObject patch = new JSObject();
            patch.put(key, checked);
            D0JNativePlugin.notifyConfigChanged(patch);
        });
        row.addView(name);
        row.addView(toggle);
        parent.addView(row);
    }

    private void addChoice(LinearLayout parent, String label, String key, String[] options, String fallback) {
        addSection(parent, label);
        LinearLayout row = row();
        String current = D0JPrefs.getConfigString(this, key, fallback);
        for (String option : options) {
            Button button = smallButton(option, current.equals(option) ? "#39FF14" : "#F5FFF5");
            button.setOnClickListener(v -> {
                D0JPrefs.setString(this, D0JPrefs.CONFIG_PREFIX + key, option);
                JSObject patch = new JSObject();
                patch.put(key, option);
                D0JNativePlugin.notifyConfigChanged(patch);
            });
            row.addView(button);
        }
        parent.addView(row);
    }

    private void addPower(LinearLayout parent) {
        TextView label = text("Default power " + D0JPrefs.getConfigInt(this, "power", 74) + "%", 11, "#F5FFF5", false);
        parent.addView(label);
        SeekBar seek = new SeekBar(this);
        seek.setMax(100);
        seek.setProgress(D0JPrefs.getConfigInt(this, "power", 74));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser) label.setText("Default power " + progress + "%");
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {
                D0JPrefs.setString(D0JOverlayService.this, D0JPrefs.CONFIG_PREFIX + "power", String.valueOf(seekBar.getProgress()));
                JSObject patch = new JSObject();
                patch.put("power", seekBar.getProgress());
                D0JNativePlugin.notifyConfigChanged(patch);
            }
        });
        parent.addView(seek, rowParams());
    }

    private void addCommandButton(LinearLayout parent, String label, String command, String colour) {
        Button button = smallButton(label, colour);
        button.setOnClickListener(v -> D0JNativePlugin.notifyMenuCommand(command));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        params.setMargins(dp(2), dp(2), dp(2), dp(2));
        button.setLayoutParams(params);
        parent.addView(button);
    }

    private LinearLayout row() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setBackground(rounded("#0D160D", "#1F4A1F", 10));
        row.setPadding(dp(8), dp(6), dp(8), dp(6));
        return row;
    }

    private LinearLayout.LayoutParams rowParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, dp(4), 0, dp(4));
        return params;
    }

    private TextView text(String value, int sizeSp, String colour, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextColor(Color.parseColor(colour));
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp);
        view.setTypeface(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL);
        return view;
    }

    private Button smallButton(String label, String colour) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(Color.parseColor(colour));
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        button.setAllCaps(false);
        button.setBackground(rounded("#0D160D", "#1F4A1F", 8));
        button.setPadding(dp(6), dp(4), dp(6), dp(4));
        button.setMinimumHeight(dp(34));
        return button;
    }

    private GradientDrawable rounded(String background, String stroke, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(Color.parseColor(background));
        drawable.setCornerRadius(dp(radiusDp));
        drawable.setStroke(Math.max(1, dp(1)), Color.parseColor(stroke));
        return drawable;
    }

    private WindowManager.LayoutParams overlayParams(int width, int height, int x, int y, boolean focusable) {
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        int flags = WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL;
        if (!focusable) flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(width, height, type, flags, PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = x;
        params.y = y;
        return params;
    }

    private void removeView(View view) {
        if (view == null) return;
        try { windowManager.removeView(view); } catch (Exception ignored) {}
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }
}

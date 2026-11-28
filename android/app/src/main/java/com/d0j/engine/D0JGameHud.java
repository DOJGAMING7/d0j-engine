package com.d0j.engine;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.os.Build;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

/**
 * Controls and prediction lines drawn inside the hosted game window.
 * This is an ordinary child view of the Activity decor, not a system overlay:
 * no SYSTEM_ALERT_WINDOW, no MediaProjection, no Accessibility service.
 */
public final class D0JGameHud {
    /** Local, same-app broadcast: the service runs in :main, the HUD in :pN. */
    public static final String ACTION_LINES = "com.d0j.engine.action.GAME_LINES";

    private static java.lang.ref.WeakReference<Activity> hostRef = new java.lang.ref.WeakReference<>(null);
    private static java.lang.ref.WeakReference<D0JGameHud> currentRef = new java.lang.ref.WeakReference<>(null);

    private final Activity activity;
    private final ViewGroup decor;
    private final FrameLayout container;
    private D0JLineLayer lines;
    private View rail;
    private View menu;
    private LinearLayout menuContent;
    private Button playButton;
    private Button queueButton;
    private String menuTab = "status";
    private String sessionPackage = "com.miniclip.eightballpool";
    private BroadcastReceiver lineReceiver;

    private D0JGameHud(Activity activity, String packageName) {
        this.activity = activity;
        this.decor = (ViewGroup) activity.getWindow().getDecorView();
        if (packageName != null && !packageName.trim().isEmpty()) this.sessionPackage = packageName.trim();
        container = new FrameLayout(activity);
        container.setClipChildren(false);
        container.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        decor.addView(container);
        installLines();
        installRail();
        installReceiver();
    }

    private void installReceiver() {
        lineReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if (intent == null) return;
                lines.setSpecs(intent.getStringExtra("json"));
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_LINES);
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                activity.registerReceiver(lineReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                activity.registerReceiver(lineReceiver, filter);
            }
        } catch (Exception ignored) {
            lineReceiver = null;
        }
    }

    public static synchronized void attach(Activity activity, String packageName) {
        if (activity == null) return;
        D0JGameHud existing = currentRef.get();
        Activity oldHost = hostRef.get();
        if (existing != null && oldHost == activity) return;
        if (existing != null) existing.removeViews();
        hostRef = new java.lang.ref.WeakReference<>(activity);
        D0JGameHud next = new D0JGameHud(activity, packageName);
        currentRef = new java.lang.ref.WeakReference<>(next);
    }

    public static synchronized void detach(Activity activity) {
        Activity host = hostRef.get();
        if (activity != null && host != null && host != activity) return;
        D0JGameHud current = currentRef.get();
        if (current != null) current.removeViews();
        hostRef = new java.lang.ref.WeakReference<>(null);
        currentRef = new java.lang.ref.WeakReference<>(null);
    }

    public static boolean isAttached() { return currentRef.get() != null; }

    /** Delivers line specs from any process of this app to the hosted HUD. */
    public static void pushLines(Context context, String json) {
        if (context == null) return;
        try {
            Intent intent = new Intent(ACTION_LINES)
                    .setPackage(context.getPackageName())
                    .putExtra("json", json == null ? "{}" : json);
            context.sendBroadcast(intent);
        } catch (Exception ignored) { }
        setLines(json);
    }

    public static void setLines(String json) {
        D0JGameHud hud = currentRef.get();
        if (hud != null) hud.lines.setSpecs(json);
    }

    public static void clearLines() {
        D0JGameHud hud = currentRef.get();
        if (hud != null) hud.lines.clear();
    }

    public static void refreshQuickControls() {
        D0JGameHud hud = currentRef.get();
        if (hud != null) hud.styleQuickButtons();
    }

    private void removeViews() {
        if (lineReceiver != null) {
            try { activity.unregisterReceiver(lineReceiver); } catch (Exception ignored) { }
            lineReceiver = null;
        }
        try {
            container.removeAllViews();
            decor.removeView(container);
        } catch (Exception ignored) { }
    }

    private void installLines() {
        lines = new D0JLineLayer(activity);
        lines.setWillNotDraw(false);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        container.addView(lines, 0, lp);
    }

    private void installRail() {
        LinearLayout railView = new LinearLayout(activity);
        railView.setOrientation(LinearLayout.VERTICAL);
        railView.setGravity(Gravity.CENTER_HORIZONTAL);
        railView.setPadding(dp(4), dp(4), dp(4), dp(4));
        railView.setBackground(box("#121215", "#303038", 18));

        TextView handle = new TextView(activity);
        handle.setText("SNAKE");
        handle.setGravity(Gravity.CENTER);
        handle.setTextColor(Color.parseColor("#3BD62B"));
        handle.setTypeface(Typeface.DEFAULT_BOLD);
        handle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 8);
        handle.setLetterSpacing(0.08f);
        railView.addView(handle, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(20)));

        playButton = quickButton("PLAY", "autoPlay");
        queueButton = quickButton("QUEUE", "autoQueue");
        Button menuButton = quickButton("MENU", null);
        menuButton.setOnClickListener(v -> toggleMenu());

        railView.addView(playButton, rowParams());
        railView.addView(queueButton, rowParams());
        railView.addView(menuButton, rowParams());

        TextView marker = new TextView(activity);
        marker.setText("LOCAL PREVIEW\nSIMULATED");
        marker.setGravity(Gravity.CENTER);
        marker.setTextSize(TypedValue.COMPLEX_UNIT_SP, 7);
        marker.setTextColor(Color.parseColor("#9A9AA2"));
        railView.addView(marker, rowParams());

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                dp(66), ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.leftMargin = D0JPrefs.getInt(activity, D0JPrefs.FLOAT_X, dp(8));
        lp.topMargin = D0JPrefs.getInt(activity, D0JPrefs.FLOAT_Y, dp(70));
        railView.setLayoutParams(lp);
        handle.setOnTouchListener(new RailTouch(railView, lp));
        container.addView(railView);
        rail = railView;
        styleQuickButtons();
    }

    private LinearLayout.LayoutParams rowParams() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(42));
        lp.topMargin = dp(3);
        return lp;
    }

    private Button quickButton(String label, String key) {
        Button button = new Button(activity);
        button.setAllCaps(false);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 9);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setPadding(0, 0, 0, 0);
        button.setMinHeight(0);
        button.setMinimumHeight(0);
        button.setTag(key == null ? label : key);
        if (key != null) button.setOnClickListener(v -> toggleQuick(key));
        return button;
    }

    private void styleQuickButtons() {
        styleQuickButton(playButton, "PLAY", "autoPlay");
        styleQuickButton(queueButton, "QUEUE", "autoQueue");
    }

    private void styleQuickButton(Button button, String label, String key) {
        if (button == null) return;
        boolean on = key != null && D0JPrefs.getConfigBoolean(activity, key, false);
        button.setText(label + "\n" + (key == null ? "OPEN" : (on ? "ON" : "OFF")));
        button.setBackground(box(on ? "#173A12" : "#1A1A1E", on ? "#3BD62B" : "#33333A", 12));
        button.setTextColor(Color.parseColor(on ? "#7CFC3A" : "#B0B0B8"));
    }

    private void toggleQuick(String key) {
        boolean next = !D0JPrefs.getConfigBoolean(activity, key, false);
        D0JPrefs.setString(activity, D0JPrefs.CONFIG_PREFIX + key, String.valueOf(next));
        styleQuickButtons();
        JSObject patch = new JSObject();
        try {
            patch.put(key, next);
        } catch (Exception ignored) { }
        D0JNativePlugin.notifyConfigChanged(patch);
        String label = "autoPlay".equals(key) ? "AUTO PLAY " : "AUTO QUEUE ";
        D0JNativePlugin.notifyMenuCommand(label + (next ? "ON" : "OFF"));
        Toast.makeText(activity, label + (next ? "ON" : "OFF"), Toast.LENGTH_SHORT).show();
    }

    private void toggleMenu() {
        if (menu != null) removeMenu();
        else showMenu();
    }

    private void removeMenu() {
        if (menu == null) return;
        container.removeView(menu);
        menu = null;
        menuContent = null;
    }

    private void showMenu() {
        if (menu != null) return;
        int width = Math.min(dp(560), activity.getResources().getDisplayMetrics().widthPixels - dp(20));
        int height = Math.min(dp(620), activity.getResources().getDisplayMetrics().heightPixels - dp(100));

        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.HORIZONTAL);
        root.setBackground(box("#0E0E11", "#303038", 22));
        root.setPadding(dp(7), dp(7), dp(7), dp(7));

        LinearLayout main = new LinearLayout(activity);
        main.setOrientation(LinearLayout.VERTICAL);
        main.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));
        main.setBackground(box("#101013", "#24242A", 18));

        LinearLayout header = new LinearLayout(activity);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(8), dp(6), dp(8), dp(8));
        ImageView logo = new ImageView(activity);
        logo.setImageResource(R.drawable.ic_snake_badge);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logo.setPadding(dp(3), dp(3), dp(3), dp(3));
        logo.setBackground(box("#08080A", "#303038", 14));
        header.addView(logo, new LinearLayout.LayoutParams(dp(42), dp(42)));

        LinearLayout copy = new LinearLayout(activity);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setPadding(dp(10), 0, 0, 0);
        TextView title = new TextView(activity);
        title.setText("SNAKE ENGINE");
        title.setTextColor(Color.parseColor("#3BD62B"));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        copy.addView(title);
        TextView sub = new TextView(activity);
        sub.setText("In-window controls · " + sessionPackage);
        sub.setTextColor(Color.parseColor("#9A9AA2"));
        sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 9);
        copy.addView(sub);
        header.addView(copy, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        main.addView(header);

        ScrollView scroll = new ScrollView(activity);
        menuContent = new LinearLayout(activity);
        menuContent.setOrientation(LinearLayout.VERTICAL);
        menuContent.setPadding(0, dp(4), 0, dp(8));
        scroll.addView(menuContent);
        scroll.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        main.addView(scroll);
        root.addView(main);

        LinearLayout side = new LinearLayout(activity);
        side.setOrientation(LinearLayout.VERTICAL);
        side.setGravity(Gravity.CENTER_HORIZONTAL);
        side.setPadding(dp(5), dp(7), dp(5), dp(7));
        side.setBackground(box("#151518", "#2C2C31", 18));
        side.setLayoutParams(new LinearLayout.LayoutParams(dp(68),
                ViewGroup.LayoutParams.MATCH_PARENT));
        TextView app = new TextView(activity);
        app.setText("8BP");
        app.setGravity(Gravity.CENTER);
        app.setTextColor(Color.parseColor("#7CFC3A"));
        app.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        app.setTypeface(Typeface.DEFAULT_BOLD);
        app.setBackground(box("#202024", "#34343A", 14));
        side.addView(app, squareParams(48));

        String[][] tabs = {
                { "status", "STATUS", "Status" },
                { "lines", "LINES", "Lines" },
                { "autoplay", "AUTO", "Auto Play" },
                { "queue", "QUEUE", "Auto Queue" },
                { "settings", "SET", "Settings" }
        };
        for (String[] tab : tabs) {
            Button button = tabButton(tab[1], tab[2], tab[0]);
            LinearLayout.LayoutParams lp = squareParams(46);
            lp.bottomMargin = dp(5);
            side.addView(button, lp);
        }
        Button close = tabButton("X", "Close menu", null);
        close.setOnClickListener(v -> removeMenu());
        side.addView(close, squareParams(46));
        root.addView(side);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(width, height);
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.leftMargin = D0JPrefs.getInt(activity, D0JPrefs.FLOAT_X, dp(8));
        lp.topMargin = Math.max(dp(40), D0JPrefs.getInt(activity, D0JPrefs.FLOAT_Y, dp(70)));
        root.setLayoutParams(lp);
        header.setOnTouchListener(new RailTouch(root, lp));
        container.addView(root);
        menu = root;
        renderMenuTab(D0JPrefs.getString(activity, "menu_tab", "status"));
    }

    private LinearLayout.LayoutParams squareParams(int size) {
        return new LinearLayout.LayoutParams(dp(size), dp(size));
    }

    private Button tabButton(String text, String description, String tab) {
        Button button = new Button(activity);
        button.setAllCaps(false);
        button.setMinimumHeight(0);
        button.setMinHeight(0);
        button.setPadding(0, 0, 0, 0);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 8);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setText(text);
        button.setContentDescription(description);
        button.setTag(tab == null ? "close" : tab);
        button.setBackground(box("#1B1B1F", "#303036", 12));
        button.setTextColor(Color.parseColor("#D8D8DE"));
        if (tab != null) button.setOnClickListener(v -> {
            menuTab = tab;
            D0JPrefs.setString(activity, "menu_tab", tab);
            renderMenuTab(tab);
            styleTabs();
        });
        return button;
    }

    private void styleTabs() {
        if (menu == null) return;
        for (int i = 0; i < ((ViewGroup) menu).getChildCount(); i++) {
            View child = ((ViewGroup) menu).getChildAt(i);
            if (!(child instanceof ViewGroup)) continue;
            ViewGroup group = (ViewGroup) child;
            for (int j = 0; j < group.getChildCount(); j++) {
                View view = group.getChildAt(j);
                if (!(view instanceof Button)) continue;
                Object tag = view.getTag();
                boolean active = tag != null && tag.equals(menuTab);
                Button button = (Button) view;
                button.setBackground(box(active ? "#232326" : "#1B1B1F",
                        active ? "#3BD62B" : "#303036", 12));
                button.setTextColor(Color.parseColor(active ? "#7CFC3A" : "#D8D8DE"));
            }
        }
    }

    private void renderMenuTab(String tab) {
        if (menuContent == null) return;
        menuTab = tab;
        menuContent.removeAllViews();
        styleTabs();
        if ("status".equals(tab)) {
            addSection("SESSION");
            addInfo("Target: " + sessionPackage);
            addInfo("Controls: in-window · no system overlay");
            addInfo("Lines: LOCAL PREVIEW · SIMULATED");
            addAction("RUN QUICK TEST", "non-blocking", "runTest");
            addAction("VM HOST STATUS", "read-only status", "vmStatus");
            addAction("START VM HOST", "daemon", "vmStart");
            addAction("ATTACH VM HOOKS", "attemptable, not device verified", "vmAttach");
            addAction("VM HOOK STATUS", "per-hook detail", "vmHooks");
            addAction("STOP SESSION", "safe halt", "stop");
            addAction("OPEN CLIENT MENU", "probe / settings", "openMenu");
            addInfo("Quick test never blocks launch.");
            return;
        }
        if ("lines".equals(tab)) {
            addSection("LINE PREDICTION");
            addToggle("Show lines", "showLines", true);
            addToggle("Keep lines after shot", "keepLines", true);
            addToggle("Show pockets", "showPockets", true);
            addSeek("Default power", "power", 0, 100, 74, "%");
            addSeek("Line opacity", "lineOpacity", 10, 100, 85, "%");
            addAction("RUN LINES FROM STATE", "measured state only", "runLiveLines");
            addAction("RUN ALL PREDICTION LINES", "local script", "runLineTest");
            addAction("START LIVE LINES", "local preview", "liveStart");
            addAction("STOP LIVE LINES", "safe halt", "liveStop");
            addAction("LINE DEMO", "local table", "openTable");
            addInfo("Endpoint colours are local previews. Live state is not measured.");
            return;
        }
        if ("autoplay".equals(tab)) {
            addSection("AUTO PLAY");
            addToggle("Auto play", "autoPlay", false);
            addChoice("Mode", "autoPlayMode", new String[] { "Pro Player", "Pro Fast", "Fast Mode" });
            addToggle("Failed break", "failedBreak", false);
            addAction("RUN RATIMODA", "local script", "autoplay");
            addAction("START LIVE AUTO", "measured state only", "autoLiveStart");
            addAction("STOP LIVE AUTO", "safe halt", "autoLiveStop");
            addInfo("Pro Player shapes input like a human. No blind taps.");
            return;
        }
        if ("queue".equals(tab)) {
            addSection("AUTO QUEUE");
            addToggle("Auto queue", "autoQueue", false);
            addChoice("Queue mode", "queueMode", new String[] { "ONE", "SESSION", "INFINITE" });
            addSeek("Match limit", "matchLimit", 1, 20, 3, "");
            addSeek("Delay", "queueDelay", 1, 10, 2, "s");
            addAction("STOP SESSION", "safe halt", "stop");
            addInfo("Queue navigation requires measured in-game state.");
            return;
        }
        addSection("SETTINGS");
        addToggle("Persistent notification", "notificationsEnabled", true);
        addToggle("Temp notifications", "tempNotifications", true);
        addToggle("Run test on launch", "runTestOnLaunch", true);
        addAction("NOTIFICATION PERM", "Android 13+", "requestNotifications");
        addAction("USAGE ACCESS", "optional auto-stop", "requestUsage");
        addInfo("A1: no accessibility, no auto-back, no key server.");
    }

    private void addSection(String title) {
        TextView view = new TextView(activity);
        view.setText("▍ " + title);
        view.setTextColor(Color.parseColor("#F2F2F5"));
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        view.setPadding(dp(10), dp(9), dp(10), dp(9));
        view.setBackground(box("#202024", "#303036", 10));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        lp.bottomMargin = dp(4);
        view.setLayoutParams(lp);
        menuContent.addView(view);
    }

    private void addInfo(String text) {
        TextView view = new TextView(activity);
        view.setText(text);
        view.setTextColor(Color.parseColor("#B4B4BC"));
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        view.setPadding(dp(10), dp(7), dp(10), dp(7));
        view.setBackground(box("#19191D", "#292930", 10));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(4);
        view.setLayoutParams(lp);
        menuContent.addView(view);
    }

    private void addAction(String title, String hint, String command) {
        Button button = new Button(activity);
        button.setAllCaps(false);
        button.setPadding(dp(10), dp(7), dp(10), dp(7));
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setText(title + "\n" + hint);
        button.setBackground(box("#1B1B1F", "#3BD62B", 10));
        button.setTextColor(Color.parseColor("#7CFC3A"));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(4);
        button.setLayoutParams(lp);
        button.setOnClickListener(v -> {
            D0JNativePlugin.notifyMenuCommand(command);
            if ("stop".equals(command)) {
                try {
                    activity.startService(new Intent(activity, D0JSessionService.class)
                            .setAction(D0JSessionService.ACTION_STOP_SESSION));
                } catch (Exception ignored) { }
            }
        });
        menuContent.addView(button);
    }

    private void addToggle(String label, String key, boolean fallback) {
        LinearLayout row = row();
        TextView text = new TextView(activity);
        text.setText(label);
        text.setTextColor(Color.parseColor("#F2F2F5"));
        text.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        row.addView(text, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Switch toggle = new Switch(activity);
        toggle.setChecked(D0JPrefs.getConfigBoolean(activity, key, fallback));
        toggle.setOnCheckedChangeListener((button, checked) -> {
            D0JPrefs.setString(activity, D0JPrefs.CONFIG_PREFIX + key, String.valueOf(checked));
            JSObject patch = new JSObject();
            try {
                patch.put(key, checked);
            } catch (Exception ignored) { }
            D0JNativePlugin.notifyConfigChanged(patch);
            if ("autoPlay".equals(key) || "autoQueue".equals(key)) styleQuickButtons();
        });
        row.addView(toggle);
        menuContent.addView(row);
    }

    private void addChoice(String label, String key, String[] options) {
        LinearLayout wrap = row();
        wrap.setOrientation(LinearLayout.VERTICAL);
        TextView text = new TextView(activity);
        text.setText(label);
        text.setTextColor(Color.parseColor("#F2F2F5"));
        text.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        wrap.addView(text);
        LinearLayout chips = new LinearLayout(activity);
        chips.setOrientation(LinearLayout.HORIZONTAL);
        String current = D0JPrefs.getConfigString(activity, key, options[0]);
        for (String option : options) {
            Button chip = new Button(activity);
            chip.setAllCaps(false);
            chip.setMinimumHeight(0);
            chip.setMinHeight(0);
            chip.setPadding(dp(7), dp(3), dp(7), dp(3));
            chip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 9);
            chip.setText(option);
            boolean on = option.equals(current);
            chip.setBackground(box(on ? "#232326" : "#1D1D21", on ? "#3BD62B" : "#303036", 8));
            chip.setTextColor(Color.parseColor(on ? "#7CFC3A" : "#D8D8DE"));
            chip.setOnClickListener(v -> {
                D0JPrefs.setString(activity, D0JPrefs.CONFIG_PREFIX + key, option);
                JSObject patch = new JSObject();
                try {
                    patch.put(key, option);
                } catch (Exception ignored) { }
                D0JNativePlugin.notifyConfigChanged(patch);
                renderMenuTab(menuTab);
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.rightMargin = dp(5);
            chips.addView(chip, lp);
        }
        wrap.addView(chips);
        menuContent.addView(wrap);
    }

    private void addSeek(String label, String key, int min, int max, int fallback, String suffix) {
        LinearLayout wrap = row();
        wrap.setOrientation(LinearLayout.VERTICAL);
        TextView text = new TextView(activity);
        String raw = D0JPrefs.getConfigString(activity, key, String.valueOf(fallback));
        int value = fallback;
        try {
            value = Integer.parseInt(raw);
        } catch (Exception ignored) { }
        text.setText(label + " · " + value + suffix);
        text.setTextColor(Color.parseColor("#F2F2F5"));
        text.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        wrap.addView(text);
        SeekBar seek = new SeekBar(activity);
        seek.setMax(max - min);
        seek.setProgress(Math.max(0, Math.min(max - min, value - min)));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                if (!fromUser) return;
                int next = min + progress;
                text.setText(label + " · " + next + suffix);
                D0JPrefs.setString(activity, D0JPrefs.CONFIG_PREFIX + key, String.valueOf(next));
                JSObject patch = new JSObject();
                try {
                    patch.put(key, next);
                } catch (Exception ignored) { }
                D0JNativePlugin.notifyConfigChanged(patch);
            }
            @Override public void onStartTrackingTouch(SeekBar bar) { }
            @Override public void onStopTrackingTouch(SeekBar bar) { }
        });
        wrap.addView(seek, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        menuContent.addView(wrap);
    }

    private LinearLayout row() {
        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(10), dp(8), dp(10), dp(8));
        row.setBackground(box("#19191D", "#292930", 10));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(4);
        row.setLayoutParams(lp);
        return row;
    }

    private GradientDrawable box(String fill, String stroke, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(Color.parseColor(fill));
        drawable.setCornerRadius(dp(radius));
        drawable.setStroke(Math.max(1, dp(1)), Color.parseColor(stroke));
        return drawable;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value,
                activity.getResources().getDisplayMetrics()));
    }

    private final class RailTouch implements View.OnTouchListener {
        private final View target;
        private final FrameLayout.LayoutParams params;
        private float downX;
        private float downY;
        private int startX;
        private int startY;

        /** The draggable target must be a direct child of the FrameLayout decor. */
        RailTouch(View target, FrameLayout.LayoutParams params) {
            this.target = target;
            this.params = params;
        }

        @Override public boolean onTouch(View view, MotionEvent event) {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downX = event.getRawX();
                    downY = event.getRawY();
                    startX = params.leftMargin;
                    startY = params.topMargin;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    int maxX = Math.max(0, decor.getWidth() - target.getWidth());
                    int maxY = Math.max(0, decor.getHeight() - target.getHeight());
                    params.leftMargin = Math.max(0, Math.min(maxX, startX + (int) (event.getRawX() - downX)));
                    params.topMargin = Math.max(0, Math.min(maxY, startY + (int) (event.getRawY() - downY)));
                    target.setLayoutParams(params);
                    return true;
                case MotionEvent.ACTION_UP:
                    D0JPrefs.setInt(activity, D0JPrefs.FLOAT_X, params.leftMargin);
                    D0JPrefs.setInt(activity, D0JPrefs.FLOAT_Y, params.topMargin);
                    return true;
                default:
                    return false;
            }
        }
    }
}

package com.d0j.engine;

import android.accessibilityservice.AccessibilityService;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.Locale;
import java.util.regex.Pattern;

public class D0JGuardService extends AccessibilityService {
    private static final String TARGET_PACKAGE = "com.miniclip.eightballpool";
    private static final Pattern STRONG = Pattern.compile(
            "(?i)(buy|purchase|checkout|payment|pay now|top.?up|insufficient coins|not enough coins|coins package)"
    );
    private long lastBack = 0;

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
    }

    @Override
    public void onInterrupt() {}

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        try {
            if (event == null || event.getPackageName() == null) return;
            if (!TARGET_PACKAGE.contentEquals(event.getPackageName())) return;
            if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                    && event.getEventType() != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) return;
            if (!D0JPrefs.getBoolean(this, D0JPrefs.PURCHASE_GUARD, true)) return;

            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) return;

            String text = collect(root, 0).trim();
            if (text.isEmpty()) return;

            String lower = text.toLowerCase(Locale.ROOT);
            boolean strong = STRONG.matcher(text).find();
            boolean weakStore = (lower.contains("store") || lower.contains("shop")) && lower.contains("coin");

            if (!strong && !weakStore) return;

            String summary = text.length() > 90 ? text.substring(0, 90).replace('\n', ' ') : text.replace('\n', ' ');
            D0JNativePlugin.notifyPurchaseGuard(summary);

            long now = SystemClock.elapsedRealtime();
            if (now - lastBack > 3000) {
                lastBack = now;
                performGlobalAction(GLOBAL_ACTION_BACK);
            }
        } catch (Exception ignored) {}
    }

    private String collect(AccessibilityNodeInfo node, int depth) {
        if (node == null || depth > 12) return "";
        StringBuilder builder = new StringBuilder();
        CharSequence text = node.getText();
        CharSequence description = node.getContentDescription();
        if (text != null && text.length() > 0) builder.append(text).append(' ');
        if (description != null && description.length() > 0) builder.append(description).append(' ');

        int count = node.getChildCount();
        for (int i = 0; i < count; i++) {
            builder.append(collect(node.getChild(i), depth + 1)).append(' ');
        }
        return builder.toString();
    }
}

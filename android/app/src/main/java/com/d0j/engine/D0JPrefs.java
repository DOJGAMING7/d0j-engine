package com.d0j.engine;

import android.content.Context;
import android.content.SharedPreferences;

public final class D0JPrefs {
    public static final String PREF_NAME = "d0j_native";
    public static final String UNLOCKED = "unlocked";
    public static final String FLOAT_X = "float_x";
    public static final String FLOAT_Y = "float_y";
    public static final String CONFIG_PREFIX = "config_";
    public static final String SESSION_ACTIVE = "session_active";
    public static final String SESSION_PACKAGE = "session_package";
    public static final String SESSION_STATUS = "session_status";
    public static final String SESSION_STATUS_TEXT = "session_status_text";
    public static final String LAST_CRASH = "last_crash";

    private D0JPrefs() {}

    public static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public static boolean getBoolean(Context context, String key, boolean fallback) {
        return prefs(context).getBoolean(key, fallback);
    }

    public static void setBoolean(Context context, String key, boolean value) {
        prefs(context).edit().putBoolean(key, value).apply();
    }

    public static int getInt(Context context, String key, int fallback) {
        return prefs(context).getInt(key, fallback);
    }

    public static void setInt(Context context, String key, int value) {
        prefs(context).edit().putInt(key, value).apply();
    }

    public static void setString(Context context, String key, String value) {
        prefs(context).edit().putString(key, value).apply();
    }

    /** Synchronous write for crash paths where the process dies immediately. */
    public static void setStringSync(Context context, String key, String value) {
        prefs(context).edit().putString(key, value).commit();
    }

    public static String getString(Context context, String key, String fallback) {
        return prefs(context).getString(key, fallback);
    }

    public static String getConfigString(Context context, String key, String fallback) {
        String raw = prefs(context).getString(CONFIG_PREFIX + key, null);
        return raw == null ? fallback : raw;
    }

    public static boolean getConfigBoolean(Context context, String key, boolean fallback) {
        String raw = getConfigString(context, key, null);
        if (raw == null) return fallback;
        return Boolean.parseBoolean(raw);
    }

    public static int getConfigInt(Context context, String key, int fallback) {
        String raw = getConfigString(context, key, null);
        if (raw == null) return fallback;
        try {
            return (int) Double.parseDouble(raw);
        } catch (Exception ignored) {
            return fallback;
        }
    }
}

package com.d0j.engine.vm;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;

import org.json.JSONObject;

/** Local-only input RPC inside each hosted process (:p0 .. :p3). */
public final class VMInputProvider extends ContentProvider {
    public static final String AUTHORITY_PREFIX = ".vminput.p";
    private static VMActivityInputInjector injector;

    @Override public boolean onCreate() {
        injector = new VMActivityInputInjector();
        VMLifecycleMonitor.install(getContext(), processIndex());
        return true;
    }

    @Override public Bundle call(String method, String arg, Bundle extras) {
        Bundle out = new Bundle();
        Bundle args = extras == null ? new Bundle() : extras;
        try {
            if (!"INPUT".equals(method)) {
                out.putBoolean("ok", false);
                out.putString("code", "UNSUPPORTED_METHOD");
                return out;
            }
            if (injector == null) injector = new VMActivityInputInjector();
            String op = args.getString("op", "status");
            if ("ping".equals(op) || "status".equals(op)) {
                JSONObject value = new JSONObject();
                value.put("ready", injector.isReady());
                value.put("reason", injector.reason());
                value.put("boundActivity", VMActivityInputInjector.boundActivity());
                value.put("process", processIndex());
                value.put("state", injector.isReady() ? "INPUT_READY" : "INPUT_PENDING");
                putJson(out, value);
            } else if ("tap".equals(op)) {
                boolean done = injector.tap(args.getFloat("x", 0), args.getFloat("y", 0));
                out.putBoolean("injected", done);
                if (!done) out.putString("reason", injector.reason());
            } else if ("path".equals(op)) {
                boolean done = injector.path(args.getString("json", "{}"));
                out.putBoolean("injected", done);
                if (!done) out.putString("reason", injector.reason());
            } else if ("swipe".equals(op)) {
                boolean done = injector.swipe(args.getFloat("x1", 0), args.getFloat("y1", 0),
                        args.getFloat("x2", 0), args.getFloat("y2", 0), args.getLong("duration", 180));
                out.putBoolean("injected", done);
                if (!done) out.putString("reason", injector.reason());
            } else {
                out.putBoolean("ok", false);
                out.putString("code", "UNKNOWN_OP");
                return out;
            }
            out.putBoolean("ok", true);
        } catch (Exception e) {
            out.putBoolean("ok", false);
            out.putString("code", "INPUT_ERROR");
            out.putString("message", e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage()));
        }
        return out;
    }

    private int processIndex() {
        try {
            android.content.ComponentName component =
                    new android.content.ComponentName(getContext(), getClass());
            android.content.pm.ProviderInfo info =
                    getContext().getPackageManager().getProviderInfo(component, 0);
            if (info != null && info.metaData != null) {
                String label = info.metaData.getString("vm.process", "");
                if (label.length() > 1 && label.charAt(0) == 'p') {
                    int index = Character.digit(label.charAt(1), 10);
                    if (index >= 0 && index <= 3) return index;
                }
            }
            return 0;
        } catch (Exception ignored) {
            return 0;
        }
    }

    private static void putJson(Bundle out, JSONObject value) {
        out.putString("json", value.toString());
        out.putString("state", value.optString("state", ""));
        out.putString("reason", value.optString("reason", ""));
        out.putBoolean("ready", value.optBoolean("ready", false));
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection,
                                  String[] selectionArgs, String sortOrder) { return null; }

    @Override public String getType(Uri uri) { return null; }

    @Override public Uri insert(Uri uri, ContentValues values) { return null; }

    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }

    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
}

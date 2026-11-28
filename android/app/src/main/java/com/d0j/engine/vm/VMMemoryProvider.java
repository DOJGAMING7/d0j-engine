package com.d0j.engine.vm;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Process;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.FileReader;
import java.util.Map;

/**
 * One local-only provider instance per hosted process (:p0 .. :p3). It reads
 * that process's own memory. No data is invented when pread is unavailable.
 */
public final class VMMemoryProvider extends ContentProvider {
    public static final String AUTHORITY_PREFIX = ".vmmem.p";
    private static VMProcMemoryReader reader;
    private static String reason = "NOT_ATTACHED";

    @Override public boolean onCreate() {
        VMLifecycleMonitor.install(getContext(), processIndex());
        return true;
    }

    @Override public Bundle call(String method, String arg, Bundle extras) {
        Bundle out = new Bundle();
        Bundle args = extras == null ? new Bundle() : extras;
        int process = processIndex();
        try {
            if (!"MEM".equals(method)) {
                out.putBoolean("ok", false);
                out.putString("code", "UNSUPPORTED_METHOD");
                return out;
            }
            String op = args.getString("op", "ping");
            if ("ping".equals(op)) {
                ensureReader();
                JSONObject value = new JSONObject();
                value.put("process", process);
                value.put("pid", Process.myPid());
                value.put("ready", reader != null && reader.isReady());
                value.put("reason", reader == null ? reason : reader.reason());
                value.put("state", reader != null && reader.isReady() ? "READER_READY" : "READER_PENDING");
                putJson(out, value);
            } else if ("mapBase".equals(op)) {
                ensureReader();
                requireReader();
                out.putLong("base", reader.moduleBase(args.getString("name", "")));
            } else if ("maps".equals(op)) {
                ensureReader();
                requireReader();
                out.putString("maps", readMaps(args.getInt("limit", 120)));
            } else if ("readFloat".equals(op)) {
                ensureReader();
                requireReader();
                out.putDouble("value", reader.readFloat(args.getLong("address", 0)));
            } else if ("readInt".equals(op)) {
                ensureReader();
                requireReader();
                out.putInt("value", reader.readInt(args.getLong("address", 0)));
            } else if ("readPointer".equals(op)) {
                ensureReader();
                requireReader();
                out.putLong("value", reader.readPointer(args.getLong("address", 0)));
            } else if ("read".equals(op)) {
                ensureReader();
                requireReader();
                byte[] bytes = reader.read(args.getLong("address", 0), args.getInt("length", 0));
                out.putString("hex", hex(bytes));
            } else if ("window".equals(op)) {
                ensureReader();
                requireReader();
                Map<Long, Float> values = reader.window(args.getLong("base", 0),
                        args.getInt("length", 0), args.getInt("stride", 4));
                JSONArray array = new JSONArray();
                for (Map.Entry<Long, Float> entry : values.entrySet()) {
                    JSONObject item = new JSONObject();
                    item.put("address", entry.getKey().longValue());
                    item.put("value", entry.getValue().floatValue());
                    array.put(item);
                }
                out.putString("values", array.toString());
            } else {
                out.putBoolean("ok", false);
                out.putString("code", "UNKNOWN_OP");
                out.putString("message", "Unknown memory op: " + op);
                return out;
            }
            out.putBoolean("ok", true);
        } catch (VMCore.VMException e) {
            out.putBoolean("ok", false);
            out.putString("code", e.code);
            out.putString("message", String.valueOf(e.getMessage()));
        } catch (Exception e) {
            out.putBoolean("ok", false);
            out.putString("code", "MEM_ERROR");
            out.putString("message", e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage()));
        }
        return out;
    }

    /** Real /proc/self/maps regions from this hosted process. No addresses are guessed. */
    private static String readMaps(int limit) throws Exception {
        JSONArray array = new JSONArray();
        BufferedReader reader = new BufferedReader(new FileReader("/proc/self/maps"));
        try {
            String line;
            while ((line = reader.readLine()) != null && array.length() < limit) {
                String[] parts = line.trim().split("\\s+");
                if (parts.length < 2) continue;
                String range = parts[0];
                int dash = range.indexOf('-');
                if (dash <= 0) continue;
                String start = range.substring(0, dash);
                String end = range.substring(dash + 1);
                String perms = parts[1];
                if (!perms.contains("r")) continue;
                long size;
                try {
                    size = Long.parseUnsignedLong(end, 16) - Long.parseUnsignedLong(start, 16);
                } catch (Exception ignored) {
                    continue;
                }
                if (size < 4096) continue;
                StringBuilder path = new StringBuilder();
                for (int i = 5; i < parts.length; i++) {
                    if (i > 5) path.append(' ');
                    path.append(parts[i]);
                }
                JSONObject item = new JSONObject();
                item.put("start", start);
                item.put("end", end);
                item.put("perms", perms);
                item.put("size", size);
                item.put("path", path.toString());
                array.put(item);
            }
        } finally {
            reader.close();
        }
        return array.toString();
    }

    private static void ensureReader() throws VMCore.VMException {
        if (reader != null) return;
        try {
            reader = new VMProcMemoryReader();
            reason = "";
        } catch (Exception e) {
            reason = e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage());
            throw new VMCore.VMException("READER_UNAVAILABLE", reason);
        }
    }

    private static void requireReader() throws VMCore.VMException {
        if (reader == null) throw new VMCore.VMException("READER_UNAVAILABLE", reason);
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
            return processFromAuthority(info == null ? "" : info.authority);
        } catch (Exception ignored) {
            return 0;
        }
    }

    static int processFromAuthority(String authority) {
        int at = authority == null ? -1 : authority.lastIndexOf(AUTHORITY_PREFIX);
        if (at < 0) return 0;
        String tail = authority.substring(at + AUTHORITY_PREFIX.length());
        try {
            return Math.max(0, Math.min(3, Integer.parseInt(tail)));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private static void putJson(Bundle out, JSONObject value) {
        out.putString("json", value.toString());
        out.putString("state", value.optString("state", ""));
        out.putString("reason", value.optString("reason", ""));
        out.putBoolean("ready", value.optBoolean("ready", false));
    }

    private static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            value.append(Character.forDigit((b >> 4) & 0xF, 16));
            value.append(Character.forDigit(b & 0xF, 16));
        }
        return value.toString();
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection,
                                  String[] selectionArgs, String sortOrder) { return null; }

    @Override public String getType(Uri uri) { return null; }

    @Override public Uri insert(Uri uri, ContentValues values) { return null; }

    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }

    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
}

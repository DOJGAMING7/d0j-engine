package com.d0j.engine.vm;

import android.content.Context;
import android.net.Uri;
import android.os.Bundle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;

/** Delegates reads to the per-child VMMemoryProvider in the selected :p slot. */
public final class VMRemoteMemoryReader implements VMMemoryReader {
    private final Context app;
    private final int process;
    private String reason = "NOT_PROBED";

    public VMRemoteMemoryReader(Context context, int process) {
        this.app = context.getApplicationContext();
        this.process = Math.max(0, Math.min(3, process));
    }

    public int process() {
        return process;
    }

    private Uri uri() {
        return Uri.parse("content://" + app.getPackageName() + ".vmmem.p" + process);
    }

    private Bundle call(String op, Bundle args) {
        Bundle payload = args == null ? new Bundle() : new Bundle(args);
        try {
            Bundle response = app.getContentResolver().call(uri(), op, null, payload);
            if (response == null) {
                reason = "NO_PROVIDER";
                return new Bundle();
            }
            return response;
        } catch (Exception e) {
            reason = e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage());
            return new Bundle();
        }
    }

    private void check(Bundle response) {
        if (!response.getBoolean("ok", false)) {
            String code = response.getString("code", "READ_FAILED");
            String message = response.getString("message", "");
            reason = code + (message.isEmpty() ? "" : ": " + message);
        } else {
            reason = "";
        }
    }

    @Override public boolean isReady() {
        Bundle response = call("ping", new Bundle());
        check(response);
        return response.getBoolean("ready", false) && reason.isEmpty();
    }

    @Override public String reason() {
        return reason;
    }

    @Override public long moduleBase(String moduleName) {
        Bundle args = new Bundle();
        args.putString("name", moduleName == null ? "" : moduleName);
        Bundle response = call("mapBase", args);
        check(response);
        return response.getLong("base", 0);
    }

    /** JSON array of real readable regions in the selected hosted process. */
    public String maps() {
        Bundle response = call("maps", new Bundle());
        check(response);
        return response.getString("maps", "[]");
    }

    @Override public float readFloat(long address) {
        Bundle args = new Bundle();
        args.putLong("address", address);
        Bundle response = call("readFloat", args);
        check(response);
        return (float) response.getDouble("value", Double.NaN);
    }

    @Override public int readInt(long address) {
        Bundle args = new Bundle();
        args.putLong("address", address);
        Bundle response = call("readInt", args);
        check(response);
        return response.getInt("value", 0);
    }

    @Override public long readPointer(long address) {
        Bundle args = new Bundle();
        args.putLong("address", address);
        Bundle response = call("readPointer", args);
        check(response);
        return response.getLong("value", 0);
    }

    @Override public byte[] read(long address, int length) {
        Bundle args = new Bundle();
        args.putLong("address", address);
        args.putInt("length", length);
        Bundle response = call("read", args);
        check(response);
        String hex = response.getString("hex", "");
        if (hex.length() != length * 2) return new byte[0];
        byte[] value = new byte[length];
        for (int i = 0; i < length; i++) {
            int high = Character.digit(hex.charAt(i * 2), 16);
            int low = Character.digit(hex.charAt(i * 2 + 1), 16);
            if (high < 0 || low < 0) return new byte[0];
            value[i] = (byte) ((high << 4) | low);
        }
        return value;
    }

    @Override public Map<Long, Float> window(long base, int length, int stride) {
        Map<Long, Float> values = new LinkedHashMap<Long, Float>();
        Bundle args = new Bundle();
        args.putLong("base", base);
        args.putInt("length", length);
        args.putInt("stride", stride);
        Bundle response = call("window", args);
        check(response);
        try {
            JSONArray array = new JSONArray(response.getString("values", "[]"));
            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.optJSONObject(i);
                if (item == null) continue;
                values.put(Long.valueOf(item.optLong("address", 0)),
                        Float.valueOf((float) item.optDouble("value", 0)));
            }
        } catch (Exception ignored) { }
        return values;
    }
}

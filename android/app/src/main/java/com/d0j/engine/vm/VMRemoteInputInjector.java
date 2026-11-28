package com.d0j.engine.vm;

import android.content.Context;
import android.net.Uri;
import android.os.Bundle;

/** Delegates touch injection to the selected hosted process. */
public final class VMRemoteInputInjector implements VMInputInjector {
    private final Context app;
    private final int process;
    private String reason = "NOT_PROBED";

    public VMRemoteInputInjector(Context context, int process) {
        this.app = context.getApplicationContext();
        this.process = Math.max(0, Math.min(3, process));
    }

    public int process() {
        return process;
    }

    public String boundActivity() {
        Bundle response = call("status", new Bundle());
        check(response);
        return response.getString("boundActivity", "");
    }

    private Uri uri() {
        return Uri.parse("content://" + app.getPackageName() + ".vminput.p" + process);
    }

    private Bundle call(String op, Bundle args) {
        Bundle payload = args == null ? new Bundle() : new Bundle(args);
        payload.putString("op", op);
        try {
            Bundle response = app.getContentResolver().call(uri(), "INPUT", null, payload);
            if (response == null) {
                reason = "NO_INPUT_PROVIDER";
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
            String code = response.getString("code", "INPUT_FAILED");
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

    @Override public boolean tap(float x, float y) {
        Bundle args = new Bundle();
        args.putFloat("x", x);
        args.putFloat("y", y);
        Bundle response = call("tap", args);
        check(response);
        return response.getBoolean("injected", false);
    }

    @Override public boolean path(String json) {
        Bundle args = new Bundle();
        args.putString("json", json == null ? "{}" : json);
        Bundle response = call("path", args);
        check(response);
        return response.getBoolean("injected", false);
    }

    @Override public boolean swipe(float x1, float y1, float x2, float y2, long durationMs) {
        Bundle args = new Bundle();
        args.putFloat("x1", x1);
        args.putFloat("y1", y1);
        args.putFloat("x2", x2);
        args.putFloat("y2", y2);
        args.putLong("duration", durationMs);
        Bundle response = call("swipe", args);
        check(response);
        return response.getBoolean("injected", false);
    }
}

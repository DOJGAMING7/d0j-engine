package com.d0j.engine.vm;

import android.content.Context;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;

/**
 * Cross-process state for in-window hosting. Stored as files in app-private
 * storage so every VM process sees the same values even after a crash.
 */
public final class VMHosting {
    private static final String DISABLED_FILE = "vm_hosting_disabled.txt";
    private static final String STAGE_FILE = "vm_hosting_stage.txt";
    private static final int MAX_BYTES = 8192;

    private VMHosting() { }

    public static boolean isDisabled(Context context) {
        return file(context, DISABLED_FILE).isFile();
    }

    public static void markDisabled(Context context, String reason) {
        write(context, DISABLED_FILE, reason == null ? "UNKNOWN" : reason);
    }

    public static String reason(Context context) {
        return read(context, DISABLED_FILE);
    }

    public static void reset(Context context) {
        try { file(context, DISABLED_FILE).delete(); } catch (Throwable ignored) { }
        write(context, STAGE_FILE, "HOSTING_RESET");
    }

    /** Last completed hosting preparation stage, visible in Settings. */
    public static void markStage(Context context, String stage) {
        write(context, STAGE_FILE, stage == null ? "UNKNOWN_STAGE" : stage);
    }

    public static String stage(Context context) {
        return read(context, STAGE_FILE);
    }

    private static void write(Context context, String name, String text) {
        File target = file(context, name);
        try {
            File parent = target.getParentFile();
            if (parent != null && !parent.isDirectory()) parent.mkdirs();
            FileOutputStream out = new FileOutputStream(target, false);
            try {
                String value = text.length() > MAX_BYTES ? text.substring(0, MAX_BYTES) : text;
                out.write(value.getBytes("UTF-8"));
                out.flush();
                out.getFD().sync();
            } finally {
                out.close();
            }
        } catch (Throwable ignored) { }
    }

    private static String read(Context context, String name) {
        try {
            File target = file(context, name);
            if (!target.isFile()) return "";
            byte[] bytes = new byte[(int) Math.min(target.length(), MAX_BYTES)];
            FileInputStream in = new FileInputStream(target);
            try {
                int count = in.read(bytes);
                return count > 0 ? new String(bytes, 0, count, "UTF-8") : "";
            } finally {
                in.close();
            }
        } catch (Throwable ignored) {
            return "";
        }
    }

    private static File file(Context context, String name) {
        Context app = context == null ? null : context.getApplicationContext();
        File dir = app == null ? new File("/data/local/tmp") : app.getFilesDir();
        return new File(dir, name);
    }
}

package com.d0j.engine.vm;

import android.content.Context;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;

/**
 * One-shot, cross-process marker for a failed in-window hosting attempt.
 * Stored as a file in app-private storage so every VM process sees it even
 * after the process that failed has already died.
 */
public final class VMHosting {
    private static final String FILE_NAME = "vm_hosting_disabled.txt";

    private VMHosting() { }

    public static boolean isDisabled(Context context) {
        return file(context).isFile();
    }

    public static void markDisabled(Context context, String reason) {
        File target = file(context);
        try {
            File parent = target.getParentFile();
            if (parent != null && !parent.isDirectory()) parent.mkdirs();
            FileOutputStream out = new FileOutputStream(target, false);
            try {
                String text = reason == null ? "UNKNOWN" : reason;
                if (text.length() > 4096) text = text.substring(0, 4096);
                out.write(text.getBytes("UTF-8"));
                out.flush();
                out.getFD().sync();
            } finally {
                out.close();
            }
        } catch (Throwable ignored) { }
    }

    public static String reason(Context context) {
        try {
            File target = file(context);
            if (!target.isFile()) return "";
            byte[] bytes = new byte[(int) Math.min(target.length(), 4096)];
            FileInputStream in = new FileInputStream(target);
            try {
                int read = in.read(bytes);
                return read > 0 ? new String(bytes, 0, read, "UTF-8") : "";
            } finally {
                in.close();
            }
        } catch (Throwable ignored) {
            return "";
        }
    }

    public static void reset(Context context) {
        try { file(context).delete(); } catch (Throwable ignored) { }
    }

    private static File file(Context context) {
        Context app = context == null ? null : context.getApplicationContext();
        File dir = app == null ? new File("/data/local/tmp") : app.getFilesDir();
        return new File(dir, FILE_NAME);
    }
}

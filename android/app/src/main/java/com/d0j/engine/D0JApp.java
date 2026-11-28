package com.d0j.engine;

import android.app.Application;
import android.content.pm.PackageInfo;
import android.os.Build;

import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;

/** Saves the last crash stack trace durably so it survives a child-process crash. */
public final class D0JApp extends Application {
    private static final String CRASH_FILE = "last_crash.txt";

    @Override public void onCreate() {
        super.onCreate();
        Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                StringWriter sw = new StringWriter();
                PrintWriter out = new PrintWriter(sw);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    out.println("process=" + Application.getProcessName());
                }
                out.println("thread=" + (thread == null ? "?" : thread.getName()));
                out.println("device=" + Build.MANUFACTURER + " " + Build.MODEL + " SDK" + Build.VERSION.SDK_INT);
                PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                out.println("version=" + info.versionName + " (" + info.versionCode + ")");
                error.printStackTrace(out);
                out.flush();
                String text = sw.toString();
                if (text.length() > 65536) text = text.substring(0, 65536);
                D0JPrefs.setStringSync(this, D0JPrefs.LAST_CRASH, text);
                writeCrashFile(text);
            } catch (Throwable ignored) { }
            if (previous != null) previous.uncaughtException(thread, error);
            else Runtime.getRuntime().exit(1);
        });
    }

    private void writeCrashFile(String text) {
        File dir = getFilesDir();
        File tmp = new File(dir, "last_crash.tmp");
        File target = new File(dir, CRASH_FILE);
        FileOutputStream out = null;
        try {
            out = new FileOutputStream(tmp, false);
            out.write(text.getBytes("UTF-8"));
            out.flush();
            out.getFD().sync();
        } catch (Throwable ignored) {
            return;
        } finally {
            if (out != null) {
                try { out.close(); } catch (Throwable ignored) { }
            }
        }
        try { tmp.renameTo(target); } catch (Throwable ignored) { }
    }
}

package com.d0j.engine;

import android.app.Application;

import java.io.PrintWriter;
import java.io.StringWriter;

/** Saves the last crash stack trace locally so it can be copied after restart. */
public final class D0JApp extends Application {
    @Override public void onCreate() {
        super.onCreate();
        Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                StringWriter sw = new StringWriter();
                error.printStackTrace(new PrintWriter(sw));
                D0JPrefs.setString(this, D0JPrefs.LAST_CRASH, sw.toString());
            } catch (Throwable ignored) { }
            if (previous != null) previous.uncaughtException(thread, error);
            else Runtime.getRuntime().exit(1);
        });
    }
}

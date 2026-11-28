package com.d0j.engine.vm;

import android.app.Activity;
import android.app.Application;
import android.content.ContentResolver;
import android.content.Context;
import android.os.Bundle;

/**
 * Watches activities inside a hosted process (:p0 .. :p3). It never uses
 * Accessibility and never reads another app's task stack: the report is sent
 * from the process that actually owns the activity.
 */
public final class VMLifecycleMonitor implements Application.ActivityLifecycleCallbacks {
    private static final java.util.Set<Integer> INSTALLED =
            java.util.Collections.synchronizedSet(new java.util.HashSet<Integer>());

    private final Context app;
    private final int process;
    private int resumed;

    private VMLifecycleMonitor(Context context, int process) {
        this.app = context.getApplicationContext();
        this.process = process;
    }

    public static void install(Context context, int process) {
        final int slot = Math.max(0, Math.min(3, process));
        synchronized (INSTALLED) {
            if (INSTALLED.contains(slot)) return;
            INSTALLED.add(slot);
        }
        try {
            Application application = (Application) context.getApplicationContext();
            application.registerActivityLifecycleCallbacks(new VMLifecycleMonitor(application, slot));
        } catch (Throwable ignored) {
            synchronized (INSTALLED) { INSTALLED.remove(slot); }
        }
    }

    @Override public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
        report("create", activity);
    }

    @Override public void onActivityStarted(Activity activity) {
        report("start", activity);
    }

    @Override public void onActivityResumed(Activity activity) {
        resumed = Math.max(0, resumed) + 1;
        report("resume", activity);
    }

    @Override public void onActivityPaused(Activity activity) {
        resumed = Math.max(0, resumed - 1);
        report("pause", activity);
    }

    @Override public void onActivityStopped(Activity activity) {
        report("stop", activity);
    }

    @Override public void onActivitySaveInstanceState(Activity activity, Bundle outState) { }

    @Override public void onActivityDestroyed(Activity activity) {
        report("destroy", activity);
    }

    private void report(String event, Activity activity) {
        try {
            String activityPackage = activity == null ? "" : activity.getPackageName();
            // The client WebView activity lives in :p0's parent process. It is
            // not the game and must never be reported as game foreground.
            if (process == 0 && app != null && activityPackage.equals(app.getPackageName())) return;
            Bundle args = new Bundle();
            args.putString("op", "hostActivity");
            args.putString("event", event);
            args.putString("packageName", activityPackage);
            args.putString("activityName", activity == null ? "" : activity.getClass().getName());
            args.putInt("process", process);
            args.putInt("resumed", Math.max(0, resumed));
            ContentResolver resolver = app.getContentResolver();
            if (resolver != null) resolver.call(SystemCallProvider.uri(app), SystemCallProvider.METHOD, null, args);
        } catch (Throwable ignored) { }
    }
}

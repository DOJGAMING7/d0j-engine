package com.d0j.engine.vm;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import com.d0j.engine.D0JGameHud;
import com.d0j.engine.D0JPrefs;
import com.d0j.engine.D0JSessionService;

/**
 * Attempts to instantiate the real installed game Activity from our hosted
 * classloader. Any failure is contained: the app never dies for a game crash,
 * and the failure is persisted so START SESSION will not retry in a loop.
 */
public final class HookInstrumentation extends Instrumentation {
    private static final String TAG = "D0JVM";
    private static volatile boolean noticeSent = false;
    private final Instrumentation base;

    public HookInstrumentation(Instrumentation base) {
        this.base = base;
    }

    public Instrumentation base() {
        return base;
    }

    private static int proxyIndex(String className) {
        if (className == null) return 0;
        try {
            String tail = className.substring(className.length() - 1);
            int value = Integer.parseInt(tail);
            if (value >= 0 && value <= 3) return value;
        } catch (Exception ignored) { }
        return 0;
    }

    @Override public Activity newActivity(ClassLoader cl, String className, Intent intent)
            throws InstantiationException, IllegalAccessException, ClassNotFoundException {
        String pkg = intent == null ? null : intent.getStringExtra("vmPackage");
        String target = intent == null ? null : intent.getStringExtra("vmActivity");
        boolean substitute = intent != null && intent.getBooleanExtra("vmSubstitute", false);
        if (substitute && pkg != null && target != null && className != null) {
            VMCore core = VMCore.peek();
            if (core != null) {
                String proxy = VMHookInstaller.proxyActivity(proxyIndex(className));
                boolean redirected = className.equals(proxy) || className.equals(target);
                if (redirected) {
                    ClassLoader loader = core.getLoader(pkg);
                    if (loader != null) {
                        try {
                            return (Activity) super.newActivity(loader, target, intent);
                        } catch (ClassNotFoundException e) {
                            Log.w(TAG, "Game activity class missing: " + target, e);
                            hostingFailed(core.context(), pkg, "CLASS_MISSING: " + target);
                        } catch (Throwable e) {
                            hostingFailed(core.context(), pkg, "newActivity: " + e);
                        }
                    } else {
                        hostingFailed(core.context(), pkg, "NO_GAME_LOADER: " + pkg);
                    }
                }
            }
        }
        return super.newActivity(cl, className, intent);
    }

    @Override public void callActivityOnCreate(Activity activity, Bundle icicle) {
        Intent intent = activity == null ? null : activity.getIntent();
        boolean gameHost = intent != null && intent.getBooleanExtra("vmSubstitute", false);
        boolean created = false;
        try {
            super.callActivityOnCreate(activity, icicle);
            created = true;
        } catch (Throwable e) {
            VMCore core = VMCore.peek();
            Context context = core == null ? (activity == null ? null : activity.getApplicationContext()) : core.context();
            String pkg = intent == null ? null : intent.getStringExtra("vmPackage");
            Log.e(TAG, "Hosted activity onCreate failed: " + e, e);
            if (gameHost) hostingFailed(context, pkg, "callActivityOnCreate: " + e);
            if (activity != null) {
                try { activity.finish(); } catch (Throwable ignored) { }
            }
        }
        if (!created || activity == null) return;
        try {
            int process = intent == null ? 0 : intent.getIntExtra("processIndex", 0);
            VMLifecycleMonitor.install(activity, process);
            VMActivityInputInjector.bind(activity);
            if (intent != null && intent.getStringExtra("vmPackage") != null) {
                D0JGameHud.attach(activity, intent.getStringExtra("vmPackage"));
            }
        } catch (Throwable e) {
            Log.e(TAG, "Hosted HUD attach failed: " + e, e);
        }
    }

    /* The game can fail after onCreate as well. Contain those failures too so a
       half-initialised hosted Activity never kills the app process. */
    @Override public void callActivityOnPostCreate(Activity activity, Bundle icicle) {
        try { super.callActivityOnPostCreate(activity, icicle); }
        catch (Throwable e) { hostedLifecycleFailed(activity, e); }
    }

    @Override public void callActivityOnStart(Activity activity) {
        try { super.callActivityOnStart(activity); }
        catch (Throwable e) { hostedLifecycleFailed(activity, e); }
    }

    @Override public void callActivityOnResume(Activity activity) {
        try { super.callActivityOnResume(activity); }
        catch (Throwable e) { hostedLifecycleFailed(activity, e); }
    }

    @Override public void callActivityOnPause(Activity activity) {
        try { super.callActivityOnPause(activity); }
        catch (Throwable e) { hostedLifecycleFailed(activity, e); }
    }

    @Override public void callActivityOnStop(Activity activity) {
        try { super.callActivityOnStop(activity); }
        catch (Throwable e) { hostedLifecycleFailed(activity, e); }
    }

    @Override public void callActivityOnRestart(Activity activity) {
        try { super.callActivityOnRestart(activity); }
        catch (Throwable e) { hostedLifecycleFailed(activity, e); }
    }

    @Override public void callActivityOnDestroy(Activity activity) {
        try { D0JGameHud.detach(activity); } catch (Throwable ignored) { }
        try { super.callActivityOnDestroy(activity); }
        catch (Throwable e) { hostedLifecycleFailed(activity, e); }
    }

    /** Only swallow failures for a hosted game; our own UI failures stay visible. */
    private static void hostedLifecycleFailed(Activity activity, Throwable e) {
        Intent intent = activity == null ? null : activity.getIntent();
        if (intent == null || !intent.getBooleanExtra("vmSubstitute", false)) {
            if (e instanceof RuntimeException) throw (RuntimeException) e;
            if (e instanceof Error) throw (Error) e;
            throw new RuntimeException(e);
        }
        VMCore core = VMCore.peek();
        hostingFailed(core == null ? (activity == null ? null : activity.getApplicationContext()) : core.context(),
                intent.getStringExtra("vmPackage"), "lifecycle: " + e);
        Log.e(TAG, "Hosted lifecycle failed: " + e, e);
        try { activity.finish(); } catch (Throwable ignored) { }
    }

    /** Persist once and tell the client process so it can fall back honestly. */
    private static void hostingFailed(Context context, String pkg, String detail) {
        VMHosting.markDisabled(context, detail);
        if (noticeSent) return;
        noticeSent = true;
        try {
            if (context == null) return;
            String sessionPkg = D0JPrefs.getString(context, D0JPrefs.SESSION_PACKAGE, "");
            String selected = pkg == null || pkg.trim().isEmpty() ? sessionPkg : pkg;
            Intent intent = new Intent(context, D0JSessionService.class)
                    .setAction(D0JSessionService.ACTION_HOSTING_FAILED)
                    .putExtra("reason", detail == null ? "UNKNOWN" : detail)
                    .putExtra("packageName", selected == null ? "" : selected);
            context.startService(intent);
        } catch (Throwable e) {
            Log.w(TAG, "Could not report hosting failure: " + e);
        }
    }
}

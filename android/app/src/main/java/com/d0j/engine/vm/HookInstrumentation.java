package com.d0j.engine.vm;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import com.d0j.engine.D0JGameHud;

/**
 * When ActivityManager redirects a game start to one of our proxy activities,
 * create the real game Activity from the hosted APK classloader instead of the
 * green placeholder. Falls back to the original class when no loader exists.
 */
public final class HookInstrumentation extends Instrumentation {
    private static final String TAG = "D0JVM";
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
                        } catch (Exception e) {
                            Log.w(TAG, "Game activity instantiation failed: " + target, e);
                        }
                    }
                }
            }
        }
        return super.newActivity(cl, className, intent);
    }

    @Override public void callActivityOnCreate(Activity activity, Bundle icicle) {
        super.callActivityOnCreate(activity, icicle);
        if (activity == null) return;
        Intent intent = activity.getIntent();
        int process = intent == null ? 0 : intent.getIntExtra("processIndex", 0);
        VMLifecycleMonitor.install(activity, process);
        VMActivityInputInjector.bind(activity);
        if (intent != null && intent.getStringExtra("vmPackage") != null) {
            D0JGameHud.attach(activity, intent.getStringExtra("vmPackage"));
        }
    }

    @Override public void callActivityOnDestroy(Activity activity) {
        D0JGameHud.detach(activity);
        super.callActivityOnDestroy(activity);
    }
}

package com.d0j.engine.vm;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.util.Log;

/** Redirects a proxy Activity to the cloned class from the hosted APK's loader. */
public final class HookInstrumentation extends Instrumentation {
    private static final String TAG = "D0JVM";
    private final Instrumentation base;

    public HookInstrumentation(Instrumentation base) {
        this.base = base;
    }

    public Instrumentation base() {
        return base;
    }

    @Override public Activity newActivity(ClassLoader cl, String className, Intent intent)
            throws InstantiationException, IllegalAccessException, ClassNotFoundException {
        String pkg = intent == null ? null : intent.getStringExtra("vmPackage");
        String target = intent == null ? null : intent.getStringExtra("vmActivity");
        if (pkg != null && target != null && className != null && className.equals(target)) {
            ClassLoader loader = VMCore.get(getContext()).getLoader(pkg);
            if (loader != null) {
                try {
                    Activity hosted = (Activity) loader.loadClass(target).newInstance();
                    VMActivityInputInjector.bind(hosted);
                    VMLifecycleMonitor.install(getContext(), 0);
                    return hosted;
                } catch (Throwable e) {
                    Log.w(TAG, "Cannot instantiate hosted activity " + target, e);
                }
            }
        }
        return super.newActivity(cl, className, intent);
    }
}

package com.d0j.engine.vm;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

/** Used only after VMHookInstaller confirms that framework hooks attached. */
public final class AttachedInstrumentation implements VMInstrumentation {
    @Override public boolean isReady() { return true; }

    @Override public String missingReason() { return ""; }

    @Override public boolean startActivity(Context context, VMRegisteredApp app, String activityName, int processIndex) {
        Intent intent = new Intent();
        intent.setComponent(new ComponentName(context.getPackageName(), VMHookInstaller.proxyActivity(processIndex)));
        intent.putExtra("vmPackage", app.packageName);
        intent.putExtra("vmActivity", activityName);
        intent.putExtra("processIndex", processIndex);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(intent);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    @Override public void stop(String packageName) { }
}

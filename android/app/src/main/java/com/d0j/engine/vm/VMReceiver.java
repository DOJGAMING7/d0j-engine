package com.d0j.engine.vm;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Stub receiver: records broadcasts for future replay into hosted apps. */
public final class VMReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        try {
            VMCore.get(context).noteBroadcast(intent == null ? null : intent.getAction());
        } catch (Exception ignored) { }
    }
}

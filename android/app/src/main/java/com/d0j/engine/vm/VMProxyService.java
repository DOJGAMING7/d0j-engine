package com.d0j.engine.vm;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

import androidx.annotation.Nullable;

/** One bound child process slot (:p0 .. :p3). */
public abstract class VMProxyService extends Service {
    protected abstract int processIndex();

    @Nullable @Override public IBinder onBind(Intent intent) {
        return new android.os.Binder();
    }

    @Override public void onCreate() {
        super.onCreate();
        VMCore.get(this).onChildProcessReady(processIndex());
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        VMCore.get(this).onChildProcessReady(processIndex());
        return START_STICKY;
    }
}

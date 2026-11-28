package com.d0j.engine.vm;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;

/** Keeps the four hosted processes bound and alive for the duration of a VM session. */
public class VMDaemonService extends Service {
    public static final String ACTION_START = "com.d0j.engine.vm.START_DAEMON";
    public static final String ACTION_STOP = "com.d0j.engine.vm.STOP_DAEMON";
    private static final String CHANNEL_ID = "d0j_vm";
    private static final int NOTIFICATION_ID = 7702;
    private static final String TAG = "D0JVM";

    private final ServiceConnection[] connections = new ServiceConnection[4];
    private boolean bound;

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            unbindChildren();
            stopSelf();
            return START_NOT_STICKY;
        }

        startForegroundCompat();
        bindChildren();
        VMCore.get(this).onChildProcessReady(-1);
        return START_STICKY;
    }

    @Override public void onDestroy() {
        unbindChildren();
        super.onDestroy();
    }

    private void bindChildren() {
        if (bound) return;
        bound = true;
        Class<?>[] types = {
                VMProxyService0.class, VMProxyService1.class,
                VMProxyService2.class, VMProxyService3.class
        };
        for (int i = 0; i < types.length; i++) {
            final int index = i;
            connections[i] = new ServiceConnection() {
                @Override public void onServiceConnected(ComponentName name, IBinder service) {
                    VMCore.get(VMDaemonService.this).onChildProcessReady(index);
                }

                @Override public void onServiceDisconnected(ComponentName name) {
                    VMCore.get(VMDaemonService.this).onChildProcessLost(index);
                }
            };
            try {
                bindService(new Intent(this, types[i]), connections[i], Context.BIND_AUTO_CREATE);
            } catch (Exception e) {
                Log.w(TAG, "Cannot bind VM process :p" + index, e);
                VMCore.get(this).onChildProcessLost(index);
            }
        }
    }

    private void unbindChildren() {
        if (!bound) return;
        bound = false;
        for (int i = 0; i < connections.length; i++) {
            if (connections[i] == null) continue;
            try {
                unbindService(connections[i]);
            } catch (Exception ignored) { }
            connections[i] = null;
        }
        for (int i = 0; i < connections.length; i++) VMCore.get(this).onChildProcessLost(i);
        VMCore.get(this).onChildProcessLost(-1);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "D0J VM host", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Personal rootless game-host substrate");
        manager.createNotificationChannel(channel);
    }

    private void startForegroundCompat() {
        Intent open = new Intent(this, com.d0j.engine.MainActivity.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending = PendingIntent.getActivity(this, 0, open, flags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        Notification notification = builder
                .setContentTitle("D0J VM host")
                .setContentText("Rootless substrate · " + VMRuntime.get().missingReason())
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pending)
                .setOngoing(true)
                .build();
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            Log.w(TAG, "Foreground start failed", e);
        }
    }
}

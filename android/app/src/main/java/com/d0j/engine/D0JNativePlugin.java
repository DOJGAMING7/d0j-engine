package com.d0j.engine;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Iterator;

@CapacitorPlugin(name = "D0JNative")
public class D0JNativePlugin extends Plugin {
    private static volatile D0JNativePlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    @PluginMethod
    public void ping(PluginCall call) {
        JSObject res = new JSObject();
        res.put("ok", true);
        res.put("native", true);
        call.resolve(res);
    }

    @PluginMethod
    public void hasOverlayPermission(PluginCall call) {
        JSObject res = new JSObject();
        res.put("granted", canOverlay(getContext()));
        call.resolve(res);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !canOverlay(getContext())) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(intent);
            } catch (Exception e) {
                call.reject("OVERLAY_SETTINGS_FAILED");
                return;
            }
        }
        JSObject res = new JSObject();
        res.put("ok", true);
        call.resolve(res);
    }

    @PluginMethod
    public void startFloating(PluginCall call) {
        startSessionOverlay(call);
    }

    @PluginMethod
    public void startSession(PluginCall call) {
        startSessionOverlay(call);
    }

    private void startSessionOverlay(PluginCall call) {
        if (!D0JPrefs.getBoolean(getContext(), D0JPrefs.UNLOCKED, false)) {
            call.reject("LOCKED");
            return;
        }
        if (!canOverlay(getContext())) {
            call.reject("OVERLAY_PERMISSION_REQUIRED");
            return;
        }

        String packageName = call.getString("packageName", "com.miniclip.eightballpool");
        boolean launchGame = Boolean.TRUE.equals(call.getBoolean("launchGame", false));

        D0JPrefs.setBoolean(getContext(), D0JPrefs.SESSION_ACTIVE, true);
        D0JPrefs.setString(getContext(), D0JPrefs.SESSION_PACKAGE, packageName);

        Intent intent = new Intent(getContext(), D0JOverlayService.class);
        intent.setAction(D0JOverlayService.ACTION_START_SESSION);
        intent.putExtra("packageName", packageName);
        intent.putExtra("launchGame", launchGame);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
        } catch (Exception e) {
            call.reject("SESSION_START_FAILED");
            return;
        }

        JSObject res = new JSObject();
        res.put("ok", true);
        res.put("sessionActive", true);
        res.put("packageName", packageName);
        call.resolve(res);
    }

    @PluginMethod
    public void stopFloating(PluginCall call) {
        stopSession(call);
    }

    @PluginMethod
    public void stopSession(PluginCall call) {
        D0JPrefs.setBoolean(getContext(), D0JPrefs.SESSION_ACTIVE, false);
        try {
            Intent intent = new Intent(getContext(), D0JOverlayService.class);
            intent.setAction(D0JOverlayService.ACTION_STOP_SESSION);
            getContext().startService(intent);
        } catch (Exception ignored) {
            try { getContext().stopService(new Intent(getContext(), D0JOverlayService.class)); } catch (Exception ignored2) {}
        }
        JSObject res = new JSObject();
        res.put("ok", true);
        res.put("sessionActive", false);
        call.resolve(res);
    }

    @PluginMethod
    public void isFloatingActive(PluginCall call) {
        JSObject res = new JSObject();
        res.put("active", D0JOverlayService.isActive());
        res.put("sessionActive", D0JPrefs.getBoolean(getContext(), D0JPrefs.SESSION_ACTIVE, false));
        call.resolve(res);
    }

    @PluginMethod
    public void getSessionStatus(PluginCall call) {
        JSObject res = new JSObject();
        res.put("active", D0JOverlayService.isActive());
        res.put("sessionActive", D0JPrefs.getBoolean(getContext(), D0JPrefs.SESSION_ACTIVE, false));
        res.put("packageName", D0JPrefs.getString(getContext(), D0JPrefs.SESSION_PACKAGE, "com.miniclip.eightballpool"));
        call.resolve(res);
    }

    @PluginMethod
    public void launchGame(PluginCall call) {
        String packageName = call.getString("packageName", "");
        if (packageName == null || packageName.trim().isEmpty()) {
            call.reject("NO_PACKAGE");
            return;
        }
        Intent launch = getContext().getPackageManager().getLaunchIntentForPackage(packageName);
        if (launch == null) {
            call.reject("NOT_INSTALLED");
            return;
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(launch);
        } catch (Exception e) {
            call.reject("LAUNCH_FAILED");
            return;
        }
        JSObject res = new JSObject();
        res.put("ok", true);
        res.put("packageName", packageName);
        call.resolve(res);
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("openMenu", true);
        try {
            getContext().startActivity(intent);
        } catch (Exception e) {
            call.reject("OPEN_APP_FAILED");
            return;
        }
        JSObject res = new JSObject();
        res.put("ok", true);
        call.resolve(res);
    }

    @PluginMethod
    public void syncConfig(PluginCall call) {
        JSObject options = call.getObject("config");
        if (options == null) options = call.getObject("value");
        if (options == null) options = call.getData();
        if (options != null) {
            Iterator<String> keys = options.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                try {
                    D0JPrefs.setString(getContext(), D0JPrefs.CONFIG_PREFIX + key, String.valueOf(options.get(key)));
                } catch (Exception ignored) {}
            }
        }
        notifyConfigChanged(options == null ? new JSObject() : options);
        JSObject res = new JSObject();
        res.put("ok", true);
        call.resolve(res);
    }

    @PluginMethod
    public void isUnlocked(PluginCall call) {
        JSObject res = new JSObject();
        res.put("unlocked", D0JPrefs.getBoolean(getContext(), D0JPrefs.UNLOCKED, false));
        call.resolve(res);
    }

    @PluginMethod
    public void setUnlocked(PluginCall call) {
        boolean unlocked = call.getBoolean("value", false);
        D0JPrefs.setBoolean(getContext(), D0JPrefs.UNLOCKED, unlocked);
        JSObject res = new JSObject();
        res.put("ok", true);
        res.put("unlocked", unlocked);
        call.resolve(res);
    }

    @PluginMethod
    public void showNotification(PluginCall call) {
        String title = call.getString("title", "D0J EnGine");
        String text = call.getString("text", "Session active");
        String status = call.getString("status", "running");
        D0JPrefs.setString(getContext(), D0JPrefs.SESSION_STATUS, status);
        D0JPrefs.setString(getContext(), D0JPrefs.SESSION_STATUS_TEXT, text);
        try {
            Intent intent = new Intent(getContext(), D0JOverlayService.class);
            intent.setAction(D0JOverlayService.ACTION_UPDATE_STATUS);
            intent.putExtra("title", title);
            intent.putExtra("text", text);
            intent.putExtra("status", status);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(intent);
            else getContext().startService(intent);
        } catch (Exception ignored) {}
        JSObject res = new JSObject();
        res.put("ok", true);
        call.resolve(res);
    }

    private static boolean canOverlay(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
    }

    static void notifyFloatingTap() {
        notify("floatingTap", new JSObject().put("event", "floatingTap"));
    }

    static void notifyMenuCommand(String command) {
        JSObject data = new JSObject();
        data.put("command", command);
        notify("menuCommand", data);
    }

    static void notifyConfigChanged(JSObject patch) {
        notify("configChanged", patch == null ? new JSObject() : patch);
    }

    private static void notify(String name, JSObject data) {
        D0JNativePlugin plugin = instance;
        if (plugin != null) {
            try {
                plugin.notifyListeners(name, data);
            } catch (Exception ignored) {}
        }
    }
}

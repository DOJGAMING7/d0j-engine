package com.d0j.engine;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;

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
        if (!D0JPrefs.getBoolean(getContext(), D0JPrefs.UNLOCKED, false)) {
            call.reject("LOCKED");
            return;
        }
        if (!canOverlay(getContext())) {
            call.reject("OVERLAY_PERMISSION_REQUIRED");
            return;
        }
        Intent intent = new Intent(getContext(), D0JOverlayService.class);
        intent.putExtra("start", true);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
        } catch (Exception e) {
            call.reject("FLOAT_START_FAILED");
            return;
        }
        JSObject res = new JSObject();
        res.put("ok", true);
        call.resolve(res);
    }

    @PluginMethod
    public void stopFloating(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), D0JOverlayService.class));
        } catch (Exception ignored) {}
        JSObject res = new JSObject();
        res.put("ok", true);
        call.resolve(res);
    }

    @PluginMethod
    public void isFloatingActive(PluginCall call) {
        JSObject res = new JSObject();
        res.put("active", D0JOverlayService.isActive());
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
    public void isAccessibilityEnabled(PluginCall call) {
        JSObject res = new JSObject();
        res.put("enabled", isAccessibilityServiceEnabled(getContext()));
        call.resolve(res);
    }

    @PluginMethod
    public void requestAccessibility(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (Exception e) {
            call.reject("ACCESSIBILITY_SETTINGS_FAILED");
            return;
        }
        JSObject res = new JSObject();
        res.put("ok", true);
        call.resolve(res);
    }

    @PluginMethod
    public void setGuards(PluginCall call) {
        boolean purchase = call.getBoolean("purchaseGuard", true);
        boolean overlay = call.getBoolean("overlayGuard", true);
        D0JPrefs.setBoolean(getContext(), D0JPrefs.PURCHASE_GUARD, purchase);
        D0JPrefs.setBoolean(getContext(), D0JPrefs.OVERLAY_GUARD, overlay);
        JSObject res = new JSObject();
        res.put("ok", true);
        call.resolve(res);
    }

    @PluginMethod
    public void getGuards(PluginCall call) {
        JSObject res = new JSObject();
        res.put("purchaseGuard", D0JPrefs.getBoolean(getContext(), D0JPrefs.PURCHASE_GUARD, true));
        res.put("overlayGuard", D0JPrefs.getBoolean(getContext(), D0JPrefs.OVERLAY_GUARD, true));
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

    private static boolean canOverlay(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
    }

    private static boolean isAccessibilityServiceEnabled(Context context) {
        try {
            String enabled = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            if (enabled == null) return false;
            String target = new ComponentName(context, D0JGuardService.class).flattenToString();
            return enabled.contains(target);
        } catch (Exception ignored) {
            return false;
        }
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
        notify("configChanged", patch);
    }

    static void notifyPurchaseGuard(String text) {
        JSObject data = new JSObject();
        data.put("text", text == null ? "" : text);
        notify("purchaseBlocked", data);
        D0JNativePlugin plugin = instance;
        if (plugin == null) return;
        Context context = plugin.getContext();
        if (context == null) return;
        try {
            Toast.makeText(context, "D0J: purchase screen blocked · pressing BACK", Toast.LENGTH_SHORT).show();
        } catch (Exception ignored) {}
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

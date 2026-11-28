package com.d0j.engine;

import android.Manifest;
import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Iterator;

@CapacitorPlugin(
    name = "D0JNative",
    permissions = {
        @com.getcapacitor.annotation.Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
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
    public void hasNotificationPermission(PluginCall call) {
        JSObject res = new JSObject();
        res.put("granted", hasNotificationPerm());
        call.resolve(res);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissionForAlias("notifications", call, "notificationsCallback");
                return;
            }
        }
        JSObject res = new JSObject();
        res.put("granted", true);
        call.resolve(res);
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void notificationsCallback(PluginCall call) {
        JSObject res = new JSObject();
        res.put("granted", hasNotificationPerm());
        call.resolve(res);
    }

    @PluginMethod
    public void hasUsageAccess(PluginCall call) {
        JSObject res = new JSObject();
        res.put("granted", hasUsageStatsPermission());
        call.resolve(res);
    }

    @PluginMethod
    public void requestUsageAccess(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception ignored) {}
        JSObject res = new JSObject();
        res.put("ok", true);
        call.resolve(res);
    }

    private boolean hasNotificationPerm() {
        if (Build.VERSION.SDK_INT < 33) return true;
        return getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasUsageStatsPermission() {
        try {
            AppOpsManager appOps = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
            int mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName());
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            return false;
        }
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
        String title = call.getString("title", "SNAKE ENGINE");
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

    @PluginMethod
    public void showToast(PluginCall call) {
        String text = call.getString("text", "");
        String kind = call.getString("kind", "info");
        if (text == null || text.trim().isEmpty()) {
            call.reject("NO_TEXT");
            return;
        }
        try {
            Intent intent = new Intent(getContext(), D0JOverlayService.class);
            intent.setAction(D0JOverlayService.ACTION_SHOW_TOAST);
            intent.putExtra("text", text);
            intent.putExtra("kind", kind);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(intent);
            else getContext().startService(intent);
        } catch (Exception ignored) {}
        JSObject res = new JSObject();
        res.put("ok", true);
        call.resolve(res);
    }

    @PluginMethod
    public void vmState(PluginCall call) {
        call.resolve(vmResult(vmCall("state", new Bundle())));
    }

    @PluginMethod
    public void vmStateProvider(PluginCall call) {
        Bundle args = new Bundle();
        args.putString("name", call.getString("name", "demo"));
        call.resolve(vmResult(vmCall("stateProvider", args)));
    }

    @PluginMethod
    public void vmBindings(PluginCall call) {
        call.resolve(vmResult(vmCall("bindings", new Bundle())));
    }

    @PluginMethod
    public void vmSaveBindings(PluginCall call) {
        Bundle args = new Bundle();
        args.putString("json", call.getString("json", "{}"));
        call.resolve(vmResult(vmCall("saveBindings", args)));
    }

    @PluginMethod
    public void vmProbe(PluginCall call) {
        String action = call.getString("action", "status");
        String op;
        if ("capture".equals(action)) op = "probeCapture";
        else if ("diff".equals(action)) op = "probeDiff";
        else if ("clear".equals(action)) op = "probeClear";
        else op = "probeStatus";

        Bundle args = new Bundle();
        args.putString("label", call.getString("label", "before"));
        args.putString("before", call.getString("before", "before"));
        args.putString("after", call.getString("after", "after"));
        args.putLong("base", call.getLong("base", 0L));
        args.putInt("length", call.getInt("length", 0));
        args.putInt("stride", call.getInt("stride", 4));
        args.putInt("limit", call.getInt("limit", 32));
        call.resolve(vmResult(vmCall(op, args)));
    }

    @PluginMethod
    public void setOverlayLines(PluginCall call) {
        Intent intent = new Intent(getContext(), D0JOverlayService.class)
                .setAction(D0JOverlayService.ACTION_UPDATE_LINES)
                .putExtra("json", call.getString("json", "{}"));
        startOverlayService(intent);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void clearOverlayLines(PluginCall call) {
        Intent intent = new Intent(getContext(), D0JOverlayService.class)
                .setAction(D0JOverlayService.ACTION_CLEAR_LINES);
        startOverlayService(intent);
        call.resolve(new JSObject().put("ok", true));
    }

    private void startOverlayService(Intent intent) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(intent);
            else getContext().startService(intent);
        } catch (Exception ignored) { }
    }

    @PluginMethod
    public void vmAttachInput(PluginCall call) {
        Bundle args = new Bundle();
        args.putInt("process", call.getInt("process", 0));
        call.resolve(vmResult(vmCall("attachInput", args)));
    }

    @PluginMethod
    public void vmInputStatus(PluginCall call) {
        call.resolve(vmResult(vmCall("inputStatus", new Bundle())));
    }

    @PluginMethod
    public void vmInputTap(PluginCall call) {
        Bundle args = new Bundle();
        args.putFloat("x", call.getDouble("x", 0d).floatValue());
        args.putFloat("y", call.getDouble("y", 0d).floatValue());
        call.resolve(vmResult(vmCall("inputTap", args)));
    }

    @PluginMethod
    public void vmInputPath(PluginCall call) {
        Bundle args = new Bundle();
        args.putString("json", call.getString("json", "{}"));
        call.resolve(vmResult(vmCall("inputPath", args)));
    }

    @PluginMethod
    public void vmInputSwipe(PluginCall call) {
        Bundle args = new Bundle();
        args.putFloat("x1", call.getDouble("x1", 0d).floatValue());
        args.putFloat("y1", call.getDouble("y1", 0d).floatValue());
        args.putFloat("x2", call.getDouble("x2", 0d).floatValue());
        args.putFloat("y2", call.getDouble("y2", 0d).floatValue());
        args.putLong("duration", call.getDouble("duration", 180d).longValue());
        call.resolve(vmResult(vmCall("inputSwipe", args)));
    }

    @PluginMethod
    public void vmAttachReader(PluginCall call) {
        Bundle args = new Bundle();
        args.putInt("process", call.getInt("process", 0));
        call.resolve(vmResult(vmCall("attachReader", args)));
    }

    @PluginMethod
    public void vmSessionWatch(PluginCall call) {
        call.resolve(vmResult(vmCall("sessionWatch", new Bundle())));
    }

    @PluginMethod
    public void vmHooks(PluginCall call) {
        call.resolve(vmResult(vmCall("hooks", new Bundle())));
    }

    @PluginMethod
    public void vmAttach(PluginCall call) {
        call.resolve(vmResult(vmCall("attach", new Bundle())));
    }

    @PluginMethod
    public void vmStatus(PluginCall call) {
        call.resolve(vmResult(vmCall("status", new Bundle())));
    }

    @PluginMethod
    public void vmList(PluginCall call) {
        call.resolve(vmResult(vmCall("list", new Bundle())));
    }

    @PluginMethod
    public void vmInstall(PluginCall call) {
        Bundle args = new Bundle();
        args.putString("apkPath", call.getString("apkPath", ""));
        call.resolve(vmResult(vmCall("install", args)));
    }

    // Scoped storage blocks a plain File path to shared storage on Android 11+.
    // Use the system file picker and copy the chosen document into app-private
    // cache, then vmInstall() can read it without requesting storage access.
    @PluginMethod
    public void pickApk(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivityForResult(call, intent, "handleApkPicked");
        } catch (Exception e) {
            call.reject("PICK_FAILED", String.valueOf(e.getMessage()));
        }
    }

    @ActivityCallback
    private void handleApkPicked(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            call.reject("PICK_CANCELLED");
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("NO_URI");
            return;
        }
        try {
            java.io.File target = new java.io.File(getContext().getCacheDir(), "vm-incoming.apk");
            try (java.io.InputStream in = getContext().getContentResolver().openInputStream(uri);
                 java.io.OutputStream out = new java.io.FileOutputStream(target)) {
                if (in == null) throw new java.io.IOException("OPEN_FAILED");
                byte[] buffer = new byte[16384];
                int read;
                while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
            }
            String name = "";
            try (android.database.Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int index = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                    if (index >= 0) name = cursor.getString(index);
                }
            } catch (Exception ignored) { }
            JSObject res = new JSObject();
            res.put("ok", true);
            res.put("path", target.getAbsolutePath());
            res.put("name", name);
            res.put("size", target.length());
            call.resolve(res);
        } catch (Exception e) {
            call.reject("COPY_FAILED", String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void vmLaunch(PluginCall call) {
        Bundle args = new Bundle();
        args.putString("packageName", call.getString("packageName", ""));
        args.putString("activityName", call.getString("activityName", ""));
        call.resolve(vmResult(vmCall("launch", args)));
    }

    @PluginMethod
    public void vmStopApp(PluginCall call) {
        Bundle args = new Bundle();
        args.putString("packageName", call.getString("packageName", ""));
        call.resolve(vmResult(vmCall("stop", args)));
    }

    @PluginMethod
    public void vmDaemon(PluginCall call) {
        Bundle args = new Bundle();
        args.putBoolean("start", call.getBoolean("start", true));
        call.resolve(vmResult(vmCall("daemon", args)));
    }

    private Bundle vmCall(String op, Bundle extras) {
        Bundle args = extras == null ? new Bundle() : new Bundle(extras);
        args.putString("op", op);
        try {
            Uri uri = Uri.parse("content://" + getContext().getPackageName() + ".vmcall");
            Bundle response = getContext().getContentResolver().call(uri, "VM", null, args);
            if (response != null) return response;
            Bundle error = new Bundle();
            error.putBoolean("ok", false);
            error.putString("code", "NO_VM_PROVIDER");
            error.putString("message", "VM provider did not answer");
            return error;
        } catch (Exception e) {
            Bundle error = new Bundle();
            error.putBoolean("ok", false);
            error.putString("code", "VM_CALL_FAILED");
            error.putString("message", String.valueOf(e.getMessage()));
            return error;
        }
    }

    private JSObject vmResult(Bundle response) {
        JSObject result = new JSObject();
        result.put("ok", response.getBoolean("ok", false));
        result.put("code", response.getString("code", ""));
        result.put("message", response.getString("message", ""));
        result.put("state", response.getString("state", ""));
        result.put("reason", response.getString("reason", ""));
        result.put("ready", response.getBoolean("ready", false));
        String json = response.getString("json", null);
        if (json != null && !json.isEmpty()) {
            try {
                JSONObject parsed = new JSONObject(json);
                Iterator<String> keys = parsed.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    result.put(key, jsValue(parsed.opt(key)));
                }
            } catch (Exception ignored) { }
        }
        return result;
    }

    /** Preserve arrays/objects so ball and probe lists reach JS as real arrays. */
    private static Object jsValue(Object value) throws Exception {
        if (value == null || value == JSONObject.NULL) return null;
        if (value instanceof JSONObject) {
            JSObject object = new JSObject();
            JSONObject source = (JSONObject) value;
            Iterator<String> keys = source.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                object.put(key, jsValue(source.opt(key)));
            }
            return object;
        }
        if (value instanceof JSONArray) {
            JSArray array = new JSArray();
            JSONArray source = (JSONArray) value;
            for (int i = 0; i < source.length(); i++) array.put(jsValue(source.opt(i)));
            return array;
        }
        if (value instanceof Boolean) return value;
        if (value instanceof Number) return ((Number) value).doubleValue();
        return String.valueOf(value);
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
        D0JOverlayService.onConfigChanged(patch);
    }

    static void notifySessionEnded(String reason) {
        notify("sessionEnded", new JSObject().put("reason", reason == null ? "manual" : reason));
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

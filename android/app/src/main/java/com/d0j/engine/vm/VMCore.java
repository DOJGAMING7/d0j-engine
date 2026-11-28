package com.d0j.engine.vm;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Host-side registry and loader. APK parsing, DEX classloader creation and
 * native library extraction are real; starting the hosted Activity is gated
 * behind VMInstrumentation, which ships as an honest stub.
 */
public final class VMCore {
    private static final String TAG = "D0JVM";
    private static final String PREFS_NAME = "d0j_vm";
    private static final String KEY_REGISTRY = "registry";
    private static final int PROCESS_COUNT = 4;
    private static volatile VMCore instance;

    private final Context app;
    private final File root;
    private final File dexDir;
    private final File libsDir;
    private final Map<String, VMRegisteredApp> apps = new ConcurrentHashMap<String, VMRegisteredApp>();
    private final Map<String, ClassLoader> loaders = new ConcurrentHashMap<String, ClassLoader>();
    private final Set<String> liveProcesses = Collections.synchronizedSet(new HashSet<String>());
    private final List<String> recentBroadcasts = Collections.synchronizedList(new ArrayList<String>());

    private VMCore(Context context) {
        this.app = context.getApplicationContext();
        this.root = new File(app.getFilesDir(), "vm");
        this.dexDir = new File(root, "dex");
        this.libsDir = new File(root, "libs");
        mkdir(root);
        mkdir(dexDir);
        mkdir(libsDir);
        loadRegistry();
    }

    public static VMCore get(Context context) {
        VMCore value = instance;
        if (value == null) {
            synchronized (VMCore.class) {
                value = instance;
                if (value == null) {
                    value = new VMCore(context);
                    instance = value;
                }
            }
        }
        return value;
    }

    private static void mkdir(File dir) {
        if (!dir.isDirectory() && !dir.mkdirs()) Log.w(TAG, "Cannot create " + dir);
    }

    public VMRegisteredApp install(String apkPath) throws VMException {
        if (apkPath == null || apkPath.trim().isEmpty()) {
            throw new VMException("NO_APK_PATH", "APK path is empty");
        }
        File file = new File(apkPath.trim());
        if (!file.isFile() || !file.canRead()) {
            throw new VMException("APK_NOT_READABLE", "Cannot read APK: " + file.getAbsolutePath());
        }

        PackageManager pm = app.getPackageManager();
        PackageInfo info = pm.getPackageArchiveInfo(file.getAbsolutePath(),
                PackageManager.GET_ACTIVITIES | PackageManager.GET_META_DATA);
        if (info == null || info.applicationInfo == null || info.packageName == null) {
            throw new VMException("INVALID_APK", "Package archive could not be parsed");
        }

        VMRegisteredApp entry = new VMRegisteredApp();
        entry.packageName = info.packageName;
        entry.apkPath = file.getAbsolutePath();
        entry.versionName = info.versionName == null ? "" : info.versionName;
        entry.versionCode = info.versionCode;
        entry.processIndex = Math.abs(info.packageName.hashCode()) % PROCESS_COUNT;
        try {
            entry.label = String.valueOf(pm.getApplicationLabel(info.applicationInfo));
        } catch (Exception ignored) {
            entry.label = info.packageName;
        }
        if (info.activities != null) {
            for (ActivityInfo activity : info.activities) {
                if (activity.name == null || activity.name.trim().isEmpty()) continue;
                entry.activities.add(activity.name);
                String lower = activity.name.toLowerCase();
                if (entry.launchActivity.isEmpty()
                        && (lower.contains("main") || lower.contains("launch") || lower.contains("splash"))) {
                    entry.launchActivity = activity.name;
                }
            }
        }
        if (entry.launchActivity.isEmpty() && !entry.activities.isEmpty()) {
            entry.launchActivity = entry.activities.get(0);
        }

        apps.put(entry.packageName, entry);
        saveRegistry();
        return entry;
    }

    public JSONObject launch(String packageName, String activityName) throws VMException {
        VMRegisteredApp entry = apps.get(packageName);
        if (entry == null) throw new VMException("NOT_INSTALLED", "Not installed in VM: " + packageName);

        String target = activityName == null || activityName.trim().isEmpty()
                ? entry.launchActivity : activityName.trim();
        if (target.isEmpty()) throw new VMException("NO_ACTIVITY", "No launch activity recorded for " + packageName);

        File outDex = new File(dexDir, safe(packageName));
        File outLibs = new File(libsDir, safe(packageName));
        mkdir(outDex);
        mkdir(outLibs);

        int libs;
        try {
            libs = VMNativeLibs.extract(entry.apkPath, outLibs);
        } catch (Exception e) {
            throw new VMException("LIB_EXTRACT_FAILED", String.valueOf(e.getMessage()));
        }

        ClassLoader loader = new dalvik.system.DexClassLoader(
                entry.apkPath, outDex.getAbsolutePath(), outLibs.getAbsolutePath(), app.getClassLoader());
        loaders.put(packageName, loader);

        VMInstrumentation instrumentation = VMRuntime.get();
        JSONObject result = new JSONObject();
        try {
            result.put("packageName", packageName);
            result.put("activity", target);
            result.put("process", ":p" + entry.processIndex);
            result.put("nativeLibraries", libs);
            result.put("classLoaderReady", true);
            result.put("instrumentationReady", instrumentation.isReady());
            result.put("reason", instrumentation.isReady() ? "" : instrumentation.missingReason());
            result.put("state", instrumentation.isReady() ? "LAUNCH_ATTEMPTED" : "CLASSLOADER_ONLY");
            if (instrumentation.isReady()) {
                boolean started = instrumentation.startActivity(app, entry, target, entry.processIndex);
                result.put("started", started);
                if (!started) result.put("state", "START_FAILED");
            } else {
                result.put("started", false);
            }
        } catch (Exception e) {
            throw new VMException("RESULT_FAILED", String.valueOf(e.getMessage()));
        }
        return result;
    }

    public JSONObject status() throws VMException {
        VMInstrumentation instrumentation = VMRuntime.get();
        JSONObject result = new JSONObject();
        try {
            result.put("engine", "skeleton");
            result.put("ready", instrumentation.isReady());
            result.put("instrumentationReady", instrumentation.isReady());
            result.put("reason", instrumentation.isReady() ? "" : instrumentation.missingReason());
            result.put("apps", apps.size());
            result.put("classLoaders", loaders.size());
            result.put("processes", new JSONArray(new ArrayList<String>(liveProcesses)));
            result.put("root", root.getAbsolutePath());
        } catch (Exception e) {
            throw new VMException("RESULT_FAILED", String.valueOf(e.getMessage()));
        }
        return result;
    }

    public JSONArray list() throws VMException {
        JSONArray result = new JSONArray();
        for (VMRegisteredApp entry : apps.values()) {
            try {
                JSONObject value = entry.toJson();
                value.put("loaded", loaders.containsKey(entry.packageName));
                result.put(value);
            } catch (Exception ignored) { }
        }
        return result;
    }

    public VMRegisteredApp getApp(String packageName) {
        return packageName == null ? null : apps.get(packageName);
    }

    public ClassLoader getLoader(String packageName) {
        return packageName == null ? null : loaders.get(packageName);
    }

    public boolean stop(String packageName) {
        VMRuntime.get().stop(packageName);
        loaders.remove(packageName);
        return true;
    }

    public void onChildProcessReady(int index) {
        liveProcesses.add(index < 0 ? ":vmdaemon" : ":p" + index);
    }

    public void onChildProcessLost(int index) {
        liveProcesses.remove(index < 0 ? ":vmdaemon" : ":p" + index);
    }

    public void noteBroadcast(String action) {
        if (action == null) return;
        if (recentBroadcasts.size() >= 32) recentBroadcasts.remove(0);
        recentBroadcasts.add(action);
    }

    private SharedPreferences prefs() {
        return app.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private void saveRegistry() {
        try {
            JSONArray array = new JSONArray();
            for (VMRegisteredApp entry : apps.values()) {
                JSONObject value = entry.toJson();
                value.put("processIndex", entry.processIndex);
                array.put(value);
            }
            prefs().edit().putString(KEY_REGISTRY, array.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "registry save failed", e);
        }
    }

    private void loadRegistry() {
        String raw = prefs().getString(KEY_REGISTRY, null);
        if (raw == null) return;
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                VMRegisteredApp entry = VMRegisteredApp.fromJson(array.getJSONObject(i));
                if (!entry.packageName.isEmpty()) apps.put(entry.packageName, entry);
            }
        } catch (Exception e) {
            Log.w(TAG, "registry load failed", e);
        }
    }

    private static String safe(String value) {
        return value == null ? "app" : value.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    public static final class VMException extends RuntimeException {
        public final String code;

        public VMException(String code, String message) {
            super(message);
            this.code = code;
        }
    }
}

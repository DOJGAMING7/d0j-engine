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
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
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
    private final File apkDir;
    private final Map<String, VMRegisteredApp> apps = new ConcurrentHashMap<String, VMRegisteredApp>();
    private final Map<String, ClassLoader> loaders = new ConcurrentHashMap<String, ClassLoader>();
    private final Set<String> liveProcesses = Collections.synchronizedSet(new HashSet<String>());
    private final List<String> recentBroadcasts = Collections.synchronizedList(new ArrayList<String>());

    private VMCore(Context context) {
        this.app = context.getApplicationContext();
        this.root = new File(app.getFilesDir(), "vm");
        this.dexDir = new File(root, "dex");
        this.libsDir = new File(root, "libs");
        this.apkDir = new File(root, "apk");
        mkdir(root);
        mkdir(dexDir);
        mkdir(libsDir);
        mkdir(apkDir);
        loadRegistry();
    }

    /** Instance already created on this process, or null before bootstrap. */
    public static VMCore peek() { return instance; }

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

    /**
     * Android 10+ refuses to classload a DEX/APK from a writable directory
     * ("Writable dex file ... is not allowed"). Keep a private, read-only copy
     * for DexClassLoader. The user's selected file is never modified.
     */
    private String stageApk(File source, String packageName) throws VMException {
        File target = new File(apkDir, safe(packageName) + ".apk");
        try {
            if (target.getCanonicalPath().equals(source.getCanonicalPath())) {
                makeReadOnly(target);
                return target.getAbsolutePath();
            }
            if (target.exists()) target.setWritable(true, false);
            try (InputStream in = new FileInputStream(source);
                 OutputStream out = new FileOutputStream(target, false)) {
                byte[] buffer = new byte[16384];
                int read;
                while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
            }
            makeReadOnly(target);
        } catch (IOException e) {
            throw new VMException("STAGE_FAILED", String.valueOf(e.getMessage()));
        }
        return target.getAbsolutePath();
    }

    private static void makeReadOnly(File file) {
        try {
            file.setWritable(false, false);
            android.system.Os.chmod(file.getAbsolutePath(), 0444);
        } catch (Throwable ignored) {
            try { file.setWritable(false, false); } catch (Throwable ignored2) { }
        }
    }

    /**
     * Never pick a helper activity (Facebook tabs, login, ads, settings) just
     * because its name contains "main". Prefer explicit launcher names and let
     * the user override the result from Settings.
     */
    private static String chooseLaunchActivity(List<String> activities) {
        if (activities == null || activities.isEmpty()) return "";
        String[] rejected = {
                "facebook", "customtab", "custom_tab", "login", "auth", "web", "browser",
                "advert", "ads", "analytics", "privacy", "policy", "terms", "settings",
                "crash", "debug", "test", "deeplink", "deep_link", "share", "invite",
                "billing", "purchase", "notification", "gauth", "google"
        };
        String[] preferred = {
                "launcheractivity", "splashactivity", "startactivity", "mainactivity",
                "gameactivity", "lobbyactivity", "eightballpoolactivity"
        };
        List<String> candidates = new ArrayList<String>();
        for (String name : activities) {
            if (name == null || name.trim().isEmpty()) continue;
            String lower = name.toLowerCase();
            boolean bad = false;
            for (String word : rejected) {
                if (lower.contains(word)) { bad = true; break; }
            }
            if (!bad) candidates.add(name);
        }
        if (candidates.isEmpty()) return activities.get(0);
        for (String good : preferred) {
            for (String name : candidates) {
                if (name.toLowerCase().endsWith(good)) return name;
            }
        }
        for (String name : candidates) {
            String lower = name.toLowerCase();
            if (lower.contains("main") || lower.contains("launch") || lower.contains("splash")
                    || lower.contains("game")) return name;
        }
        return candidates.get(0);
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
        entry.apkPath = stageApk(file, info.packageName);
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
            }
        }
        entry.launchActivity = chooseLaunchActivity(entry.activities);

        apps.put(entry.packageName, entry);
        saveRegistry();
        return entry;
    }

    /** Builds the game classloader inside a hosted child process without starting an Activity. */
    public boolean prepare(String packageName) throws VMException {
        VMRegisteredApp entry = apps.get(packageName == null ? "" : packageName);
        if (entry == null) return false;
        File outDex = new File(dexDir, safe(packageName));
        File outLibs = new File(libsDir, safe(packageName));
        mkdir(outDex);
        mkdir(outLibs);
        try {
            List<String> sources = new ArrayList<String>();
            sources.add(entry.apkPath);
            sources.addAll(entry.splitApkPaths);
            VMNativeLibs.extract(sources.toArray(new String[0]), outLibs);
        } catch (Exception e) {
            throw new VMException("LIB_EXTRACT_FAILED", String.valueOf(e.getMessage()));
        }
        ClassLoader loader = new dalvik.system.DexClassLoader(
                entry.apkClassPath(), outDex.getAbsolutePath(), outLibs.getAbsolutePath(), app.getClassLoader());
        loaders.put(packageName, loader);
        return true;
    }

    public JSONObject launch(String packageName, String activityName) throws VMException {
        VMRegisteredApp entry = apps.get(packageName);
        if (entry == null) throw new VMException("NOT_INSTALLED", "Not installed in VM: " + packageName);

        String target = activityName == null || activityName.trim().isEmpty()
                ? entry.launchActivity : activityName.trim();
        if (target.isEmpty()) throw new VMException("NO_ACTIVITY", "No launch activity recorded for " + packageName);

        // Entries installed by older builds may still point at a writable cache
        // file. Restage them so the classloader never sees a writable dex.
        File installedApk = new File(entry.apkPath);
        if (!installedApk.isFile() || installedApk.canWrite()) {
            entry.apkPath = stageApk(installedApk, packageName);
            saveRegistry();
        }

        File outDex = new File(dexDir, safe(packageName));
        File outLibs = new File(libsDir, safe(packageName));
        mkdir(outDex);
        mkdir(outLibs);

        int libs;
        try {
            java.util.List<String> sources = new ArrayList<String>();
            sources.add(entry.apkPath);
            sources.addAll(entry.splitApkPaths);
            libs = VMNativeLibs.extract(sources.toArray(new String[0]), outLibs);
        } catch (Exception e) {
            throw new VMException("LIB_EXTRACT_FAILED", String.valueOf(e.getMessage()));
        }

        ClassLoader loader = new dalvik.system.DexClassLoader(
                entry.apkClassPath(), outDex.getAbsolutePath(), outLibs.getAbsolutePath(), app.getClassLoader());
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

    /**
     * Read-only discovery of a Play Store installed game. The APK is never
     * copied, patched, re-signed or modified here.
     */
    public JSONObject discoverInstalled(String packageName) throws VMException {
        if (packageName == null || packageName.trim().isEmpty()) {
            throw new VMException("NO_PACKAGE", "Package name is empty");
        }
        String pkg = packageName.trim();
        try {
            PackageInfo info = app.getPackageManager().getPackageInfo(pkg,
                    PackageManager.GET_ACTIVITIES | PackageManager.GET_META_DATA);
            if (info == null || info.applicationInfo == null) {
                throw new VMException("NOT_INSTALLED", "Not installed: " + pkg);
            }
            android.content.pm.ApplicationInfo application = info.applicationInfo;
            java.util.List<String> activityNames = new ArrayList<String>();
            if (info.activities != null) {
                for (ActivityInfo activity : info.activities) {
                    if (activity.name != null && !activity.name.trim().isEmpty()) {
                        activityNames.add(activity.name);
                    }
                }
            }
            String[] splits = application.splitSourceDirs;
            JSONArray splitPaths = new JSONArray();
            if (splits != null) {
                for (String split : splits) splitPaths.put(split == null ? "" : split);
            }
            JSONObject value = new JSONObject();
            value.put("ok", true);
            value.put("installed", true);
            value.put("source", "PLAY_STORE");
            value.put("modified", false);
            value.put("packageName", pkg);
            value.put("label", String.valueOf(app.getPackageManager().getApplicationLabel(application)));
            value.put("versionName", info.versionName == null ? "" : info.versionName);
            value.put("versionCode", info.versionCode);
            value.put("sourceDir", application.sourceDir == null ? "" : application.sourceDir);
            value.put("splitSourceDirs", splitPaths);
            value.put("splitCount", splits == null ? 0 : splits.length);
            value.put("nativeLibraryDir", application.nativeLibraryDir == null ? "" : application.nativeLibraryDir);
            value.put("launchActivity", chooseLaunchActivity(activityNames));
            value.put("activities", new JSONArray(activityNames));
            value.put("activityCount", activityNames.size());
            value.put("state", "DISCOVERED");
            return value;
        } catch (VMException e) {
            throw e;
        } catch (Exception e) {
            throw new VMException("DISCOVER_FAILED", String.valueOf(e.getMessage()));
        }
    }

    /**
     * Registers an already installed game by pointing at the Play Store paths.
     * Unlike install(), this never copies, patches or re-signs the game APK.
     */
    public VMRegisteredApp registerInstalled(String packageName) throws VMException {
        if (packageName == null || packageName.trim().isEmpty()) {
            throw new VMException("NO_PACKAGE", "Package name is empty");
        }
        String pkg = packageName.trim();
        try {
            PackageInfo info = app.getPackageManager().getPackageInfo(pkg,
                    PackageManager.GET_ACTIVITIES | PackageManager.GET_META_DATA);
            if (info == null || info.applicationInfo == null) {
                throw new VMException("NOT_INSTALLED", "Not installed: " + pkg);
            }
            android.content.pm.ApplicationInfo application = info.applicationInfo;
            VMRegisteredApp entry = new VMRegisteredApp();
            entry.packageName = pkg;
            entry.apkPath = application.sourceDir == null ? "" : application.sourceDir;
            entry.nativeLibraryDir = application.nativeLibraryDir == null ? "" : application.nativeLibraryDir;
            entry.versionName = info.versionName == null ? "" : info.versionName;
            entry.versionCode = info.versionCode;
            entry.processIndex = Math.abs(pkg.hashCode()) % PROCESS_COUNT;
            if (application.splitSourceDirs != null) {
                for (String split : application.splitSourceDirs) {
                    if (split != null && !split.trim().isEmpty()) entry.splitApkPaths.add(split);
                }
            }
            if (info.activities != null) {
                for (ActivityInfo activity : info.activities) {
                    if (activity.name != null && !activity.name.trim().isEmpty()) {
                        entry.activities.add(activity.name);
                    }
                }
            }
            entry.launchActivity = chooseLaunchActivity(entry.activities);
            try {
                entry.label = String.valueOf(app.getPackageManager().getApplicationLabel(application));
            } catch (Exception ignored) {
                entry.label = pkg;
            }
            apps.put(pkg, entry);
            saveRegistry();
            return entry;
        } catch (VMException e) {
            throw e;
        } catch (Exception e) {
            throw new VMException("REGISTER_FAILED", String.valueOf(e.getMessage()));
        }
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
            prefs().edit().putString(KEY_REGISTRY, array.toString()).commit();
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

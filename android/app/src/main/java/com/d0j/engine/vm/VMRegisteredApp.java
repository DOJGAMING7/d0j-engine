package com.d0j.engine.vm;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** One APK registered in the D0J virtual host. */
public final class VMRegisteredApp {
    public String packageName = "";
    public String label = "";
    public String apkPath = "";
    public final List<String> splitApkPaths = new ArrayList<String>();
    public String nativeLibraryDir = "";
    public String versionName = "";
    public long versionCode = 0;
    public int processIndex = 0;
    public String launchActivity = "";
    public final List<String> activities = new ArrayList<String>();

    public JSONObject toJson() throws Exception {
        JSONObject value = new JSONObject();
        value.put("packageName", packageName);
        value.put("label", label);
        value.put("apkPath", apkPath);
        value.put("splitApkPaths", new JSONArray(splitApkPaths));
        value.put("nativeLibraryDir", nativeLibraryDir);
        value.put("versionName", versionName);
        value.put("versionCode", versionCode);
        value.put("processIndex", processIndex);
        value.put("process", ":p" + processIndex);
        value.put("launchActivity", launchActivity);
        value.put("activities", new JSONArray(activities));
        return value;
    }

    /** DexClassLoader accepts a colon-separated list of installed APK paths. */
    public String apkClassPath() {
        StringBuilder builder = new StringBuilder(apkPath == null ? "" : apkPath);
        for (String split : splitApkPaths) {
            if (split == null || split.trim().isEmpty()) continue;
            builder.append(':').append(split);
        }
        return builder.toString();
    }

    public static VMRegisteredApp fromJson(JSONObject value) throws Exception {
        VMRegisteredApp entry = new VMRegisteredApp();
        entry.packageName = value.optString("packageName", "");
        entry.label = value.optString("label", "");
        entry.apkPath = value.optString("apkPath", "");
        entry.nativeLibraryDir = value.optString("nativeLibraryDir", "");
        JSONArray splits = value.optJSONArray("splitApkPaths");
        if (splits != null) {
            for (int i = 0; i < splits.length(); i++) entry.splitApkPaths.add(splits.optString(i, ""));
        }
        entry.versionName = value.optString("versionName", "");
        entry.versionCode = value.optLong("versionCode", 0);
        entry.processIndex = value.optInt("processIndex", 0);
        entry.launchActivity = value.optString("launchActivity", "");
        JSONArray array = value.optJSONArray("activities");
        if (array != null) {
            for (int i = 0; i < array.length(); i++) entry.activities.add(array.optString(i, ""));
        }
        return entry;
    }
}

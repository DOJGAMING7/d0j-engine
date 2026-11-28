package com.d0j.engine.vm;

import org.json.JSONObject;

/**
 * Version-tagged offsets for one game build. The shipped file is UNMEASURED:
 * every offset is null and no address is guessed.
 */
public final class VMPointerBinding {
    public static final String STATUS_UNMEASURED = "UNMEASURED";
    public static final String STATUS_MEASURED = "MEASURED";

    public String packageName = "com.miniclip.eightballpool";
    public String versionName = "56.34.0";
    public int versionCode = 4064;
    public String status = STATUS_UNMEASURED;
    public String moduleName = "";
    public String ballIdSource = "UNMAPPED";

    public Long cueXOffset;
    public Long cueYOffset;
    public Long ballsArrayOffset;
    public Long ballStride;
    public Long ballXOffset;
    public Long ballYOffset;
    public Long ballActiveOffset;
    public Long pocketsArrayOffset;
    public Long pocketStride;
    public Long pocketXOffset;
    public Long pocketYOffset;
    public Long turnOffset;
    public Long powerOffset;
    public Long aimXOffset;
    public Long aimYOffset;

    public boolean isUsable() {
        return STATUS_MEASURED.equals(status)
                && cueXOffset != null && cueYOffset != null
                && ballsArrayOffset != null && ballStride != null
                && ballXOffset != null && ballYOffset != null;
    }

    public String unusableReason() {
        if (!STATUS_MEASURED.equals(status)) return "BINDINGS_UNMEASURED";
        if (cueXOffset == null || cueYOffset == null) return "CUE_OFFSETS_MISSING";
        if (ballsArrayOffset == null || ballStride == null) return "BALL_ARRAY_MISSING";
        if (ballXOffset == null || ballYOffset == null) return "BALL_COORDS_MISSING";
        return "";
    }

    public static VMPointerBinding unmeasured(String versionName, int versionCode) {
        VMPointerBinding value = new VMPointerBinding();
        if (versionName != null && !versionName.isEmpty()) value.versionName = versionName;
        value.versionCode = versionCode;
        value.status = STATUS_UNMEASURED;
        return value;
    }

    public JSONObject toJson() throws Exception {
        JSONObject value = new JSONObject();
        value.put("packageName", packageName);
        value.put("versionName", versionName);
        value.put("versionCode", versionCode);
        value.put("status", status);
        value.put("moduleName", moduleName);
        value.put("ballIdSource", ballIdSource);
        value.put("usable", isUsable());
        putNullable(value, "cueXOffset", cueXOffset);
        putNullable(value, "cueYOffset", cueYOffset);
        putNullable(value, "ballsArrayOffset", ballsArrayOffset);
        putNullable(value, "ballStride", ballStride);
        putNullable(value, "ballXOffset", ballXOffset);
        putNullable(value, "ballYOffset", ballYOffset);
        putNullable(value, "ballActiveOffset", ballActiveOffset);
        putNullable(value, "pocketsArrayOffset", pocketsArrayOffset);
        putNullable(value, "pocketStride", pocketStride);
        putNullable(value, "pocketXOffset", pocketXOffset);
        putNullable(value, "pocketYOffset", pocketYOffset);
        putNullable(value, "turnOffset", turnOffset);
        putNullable(value, "powerOffset", powerOffset);
        putNullable(value, "aimXOffset", aimXOffset);
        putNullable(value, "aimYOffset", aimYOffset);
        return value;
    }

    public static VMPointerBinding fromJson(JSONObject value) {
        VMPointerBinding binding = new VMPointerBinding();
        binding.packageName = value.optString("packageName", binding.packageName);
        binding.versionName = value.optString("versionName", binding.versionName);
        binding.versionCode = value.optInt("versionCode", binding.versionCode);
        binding.status = value.optString("status", STATUS_UNMEASURED);
        binding.moduleName = value.optString("moduleName", "");
        binding.ballIdSource = value.optString("ballIdSource", "UNMAPPED");
        binding.cueXOffset = readNullable(value, "cueXOffset");
        binding.cueYOffset = readNullable(value, "cueYOffset");
        binding.ballsArrayOffset = readNullable(value, "ballsArrayOffset");
        binding.ballStride = readNullable(value, "ballStride");
        binding.ballXOffset = readNullable(value, "ballXOffset");
        binding.ballYOffset = readNullable(value, "ballYOffset");
        binding.ballActiveOffset = readNullable(value, "ballActiveOffset");
        binding.pocketsArrayOffset = readNullable(value, "pocketsArrayOffset");
        binding.pocketStride = readNullable(value, "pocketStride");
        binding.pocketXOffset = readNullable(value, "pocketXOffset");
        binding.pocketYOffset = readNullable(value, "pocketYOffset");
        binding.turnOffset = readNullable(value, "turnOffset");
        binding.powerOffset = readNullable(value, "powerOffset");
        binding.aimXOffset = readNullable(value, "aimXOffset");
        binding.aimYOffset = readNullable(value, "aimYOffset");
        return binding;
    }

    private static void putNullable(JSONObject value, String key, Long number) throws Exception {
        if (number == null) value.put(key, JSONObject.NULL);
        else value.put(key, number.longValue());
    }

    private static Long readNullable(JSONObject value, String key) {
        Object raw = value.opt(key);
        if (raw == null || raw == JSONObject.NULL || !(raw instanceof Number)) return null;
        return Long.valueOf(((Number) raw).longValue());
    }
}

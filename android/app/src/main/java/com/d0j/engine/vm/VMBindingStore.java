package com.d0j.engine.vm;

import android.content.Context;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.Charset;

/** Persists version-tagged bindings. Missing file means UNMEASURED, never guessed. */
public final class VMBindingStore {
    private static final String TARGET_VERSION = "56.34.0";
    private static final int TARGET_CODE = 4064;
    private final Context app;
    private final File file;

    public VMBindingStore(Context context) {
        this.app = context.getApplicationContext();
        this.file = new File(app.getFilesDir(), "vm/bindings/8bp-56.34.0.json");
    }

    public String path() {
        return file.getAbsolutePath();
    }

    public static String targetVersion() {
        return TARGET_VERSION;
    }

    public static int targetCode() {
        return TARGET_CODE;
    }

    public VMPointerBinding load() {
        if (!file.isFile()) return VMPointerBinding.unmeasured(TARGET_VERSION, TARGET_CODE);
        try {
            byte[] raw = readAll(file);
            JSONObject value = new JSONObject(new String(raw, Charset.forName("UTF-8")));
            return VMPointerBinding.fromJson(value);
        } catch (Exception ignored) {
            return VMPointerBinding.unmeasured(TARGET_VERSION, TARGET_CODE);
        }
    }

    public boolean save(VMPointerBinding binding) throws Exception {
        File parent = file.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) return false;
        JSONObject value = binding.toJson();
        FileOutputStream stream = new FileOutputStream(file);
        try {
            stream.write(value.toString().getBytes(Charset.forName("UTF-8")));
        } finally {
            stream.close();
        }
        return true;
    }

    private static byte[] readAll(File file) throws Exception {
        java.io.FileInputStream stream = new java.io.FileInputStream(file);
        try {
            byte[] buffer = new byte[(int) file.length()];
            int offset = 0;
            while (offset < buffer.length) {
                int count = stream.read(buffer, offset, buffer.length - offset);
                if (count < 0) break;
                offset += count;
            }
            return buffer;
        } finally {
            stream.close();
        }
    }
}

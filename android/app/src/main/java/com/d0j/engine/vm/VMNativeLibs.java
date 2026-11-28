package com.d0j.engine.vm;

import android.os.Build;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Extracts the first supported ABI's native libraries from a hosted APK. */
public final class VMNativeLibs {
    private VMNativeLibs() {}

    public static int extract(String apkPath, File destDir) throws IOException {
        File target = destDir;
        if (!target.isDirectory() && !target.mkdirs()) throw new IOException("Cannot create " + target);

        String[] abis;
        if (Build.VERSION.SDK_INT >= 21) abis = Build.SUPPORTED_ABIS;
        else abis = new String[] { Build.CPU_ABI };

        ZipFile zip = new ZipFile(apkPath);
        try {
            Map<String, List<ZipEntry>> byAbi = new LinkedHashMap<String, List<ZipEntry>>();
            Enumeration<? extends ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                String name = entry.getName();
                if (entry.isDirectory() || !name.startsWith("lib/")) continue;
                String[] parts = name.split("/");
                if (parts.length != 3 || parts[2].length() == 0) continue;
                List<ZipEntry> bucket = byAbi.get(parts[1]);
                if (bucket == null) {
                    bucket = new ArrayList<ZipEntry>();
                    byAbi.put(parts[1], bucket);
                }
                bucket.add(entry);
            }

            for (String abi : abis) {
                List<ZipEntry> bucket = byAbi.get(abi);
                if (bucket == null) continue;
                for (ZipEntry entry : bucket) {
                    String[] parts = entry.getName().split("/");
                    File out = new File(target, parts[2]);
                    InputStream in = zip.getInputStream(entry);
                    try {
                        copy(in, out);
                    } finally {
                        in.close();
                    }
                    try {
                        out.setExecutable(true, false);
                    } catch (SecurityException ignored) { }
                }
                return bucket.size();
            }
            return 0;
        } finally {
            zip.close();
        }
    }

    private static void copy(InputStream in, File out) throws IOException {
        FileOutputStream stream = new FileOutputStream(out);
        try {
            byte[] buffer = new byte[16384];
            int count;
            while ((count = in.read(buffer)) != -1) stream.write(buffer, 0, count);
        } finally {
            stream.close();
        }
    }
}

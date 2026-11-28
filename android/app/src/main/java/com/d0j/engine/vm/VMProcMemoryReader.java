package com.d0j.engine.vm;

import java.io.BufferedReader;
import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.FileReader;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Real /proc/self/mem reader for the process it is constructed in. Module bases
 * come from /proc/self/maps. Nothing is assumed and hidden-API failure is reported.
 */
public final class VMProcMemoryReader implements VMMemoryReader {
    private final FileInputStream stream;
    private final FileDescriptor fd;
    private final Method pread;
    private final Object os;
    private String reason = "NOT_SELF_TESTED";
    private boolean selfTested;

    public VMProcMemoryReader() throws Exception {
        Class<?> libcore = Class.forName("libcore.io.Libcore");
        Field osField = libcore.getField("os");
        os = osField.get(null);
        pread = os.getClass().getMethod("pread", FileDescriptor.class, byte[].class,
                int.class, int.class, long.class);
        stream = new FileInputStream("/proc/self/mem");
        fd = stream.getFD();
    }

    @Override public boolean isReady() {
        if (selfTested) return reason.isEmpty();
        try {
            long region = firstReadableRegion();
            if (region == 0) {
                reason = "NO_READABLE_MAP";
            } else {
                byte[] one = new byte[1];
                Object result = pread.invoke(os, fd, one, 0, 1, region);
                int count = result instanceof Integer ? ((Integer) result).intValue() : 0;
                reason = count == 1 ? "" : "PREAD_BLOCKED";
            }
        } catch (Throwable e) {
            reason = e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage());
        }
        selfTested = true;
        return reason.isEmpty();
    }

    @Override public String reason() {
        return reason;
    }

    @Override public long moduleBase(String moduleName) {
        if (moduleName == null || moduleName.isEmpty()) return 0;
        try {
            BufferedReader reader = new BufferedReader(new FileReader("/proc/self/maps"));
            try {
                String line;
                while ((line = reader.readLine()) != null) {
                    int slash = line.indexOf('/');
                    if (slash < 0) continue;
                    String path = line.substring(slash).trim();
                    if (!path.endsWith("/" + moduleName) && !path.equals(moduleName)) continue;
                    return parseStart(line);
                }
            } finally {
                reader.close();
            }
        } catch (Throwable ignored) { }
        return 0;
    }

    @Override public float readFloat(long address) {
        byte[] raw = read(address, 4);
        if (raw.length < 4) return Float.NaN;
        return ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN).getFloat();
    }

    @Override public int readInt(long address) {
        byte[] raw = read(address, 4);
        if (raw.length < 4) return 0;
        return ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN).getInt();
    }

    @Override public long readPointer(long address) {
        byte[] raw = read(address, 8);
        if (raw.length < 8) return 0;
        return ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN).getLong();
    }

    @Override public byte[] read(long address, int length) {
        if (length <= 0) return new byte[0];
        byte[] buffer = new byte[length];
        try {
            int total = 0;
            while (total < length) {
                Object result = pread.invoke(os, fd, buffer, total, length - total, address + total);
                int count = result instanceof Integer ? ((Integer) result).intValue() : 0;
                if (count <= 0) break;
                total += count;
            }
            return total == length ? buffer : new byte[0];
        } catch (Throwable ignored) {
            return new byte[0];
        }
    }

    @Override public Map<Long, Float> window(long base, int length, int stride) {
        Map<Long, Float> values = new LinkedHashMap<Long, Float>();
        if (stride < 4 || length < stride) return values;
        byte[] buffer = read(base, length);
        if (buffer.length < length) return values;
        ByteBuffer wrapper = ByteBuffer.wrap(buffer).order(ByteOrder.LITTLE_ENDIAN);
        for (int offset = 0; offset + stride <= length; offset += stride) {
            float value = wrapper.getFloat(offset);
            if (Float.isNaN(value) || Float.isInfinite(value)) continue;
            values.put(Long.valueOf(base + offset), Float.valueOf(value));
        }
        return values;
    }

    private static long firstReadableRegion() {
        try {
            BufferedReader reader = new BufferedReader(new FileReader("/proc/self/maps"));
            try {
                String line;
                while ((line = reader.readLine()) != null) {
                    int space = line.indexOf(' ');
                    if (space < 0 || line.charAt(space + 1) != 'r') continue;
                    long start = parseStart(line);
                    if (start != 0) return start;
                }
            } finally {
                reader.close();
            }
        } catch (Throwable ignored) { }
        return 0;
    }

    private static long parseStart(String line) {
        try {
            int dash = line.indexOf('-');
            if (dash <= 0) return 0;
            return Long.parseLong(line.substring(0, dash), 16);
        } catch (Throwable ignored) {
            return 0;
        }
    }
}

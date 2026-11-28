package com.d0j.engine.vm;

import java.util.Map;

/** In-process memory access contract. Implementations must not fabricate values. */
public interface VMMemoryReader {
    boolean isReady();

    String reason();

    long moduleBase(String moduleName);

    float readFloat(long address);

    int readInt(long address);

    long readPointer(long address);

    byte[] read(long address, int length);

    /** Bulk float window used by the differential probe to limit IPC round trips. */
    Map<Long, Float> window(long base, int length, int stride);
}

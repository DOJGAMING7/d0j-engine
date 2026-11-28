package com.d0j.engine.vm;

import android.content.Context;

/** Swappable state source. Demo is the default; probe becomes usable only when measured. */
public final class VMStateHub {
    private static volatile VMStateProvider provider = new VMDemoStateProvider();

    private VMStateHub() {}

    public static VMStateProvider get() {
        return provider;
    }

    public static void set(VMStateProvider next) {
        if (next != null) provider = next;
    }

    public static void useDemo() {
        set(new VMDemoStateProvider());
    }

    public static void useProbe(Context context) {
        set(new VMProbeStateProvider(context));
    }
}

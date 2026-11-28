package com.d0j.engine.vm;

import android.content.Context;

/** Holds the active instrumentation implementation. Never claims a hook that is not attached. */
public final class VMRuntime {
    private static volatile VMInstrumentation implementation = new StubInstrumentation();

    private VMRuntime() {}

    public static VMInstrumentation get() {
        return implementation;
    }

    public static void install(VMInstrumentation next) {
        if (next != null) implementation = next;
    }

    public static void resetToStub() {
        implementation = new StubInstrumentation();
    }

    public static boolean isReady() {
        return implementation.isReady();
    }

    public static final class StubInstrumentation implements VMInstrumentation {
        public static final String REASON = "FRAMEWORK_HOOK_NOT_ATTACHED";

        @Override public boolean isReady() { return false; }

        @Override public String missingReason() { return REASON; }

        @Override public boolean startActivity(Context context, VMRegisteredApp app, String activityName, int processIndex) {
            return false;
        }

        @Override public void stop(String packageName) { }
    }
}

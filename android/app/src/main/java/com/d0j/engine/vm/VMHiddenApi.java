package com.d0j.engine.vm;

/** Best-effort hidden-API exemption. Never reports success unless the call returned. */
public final class VMHiddenApi {
    private VMHiddenApi() {}

    public static boolean exempt() {
        try {
            // Double reflection keeps the call surface on public java.lang APIs.
            Class<?> classClass = Class.class;
            java.lang.reflect.Method forName = classClass.getDeclaredMethod("forName", String.class);
            java.lang.reflect.Method getDeclaredMethod = classClass.getDeclaredMethod(
                    "getDeclaredMethod", String.class, Class[].class);

            Class<?> runtimeClass = (Class<?>) forName.invoke(null, "dalvik.system.VMRuntime");
            java.lang.reflect.Method getRuntime = (java.lang.reflect.Method) getDeclaredMethod.invoke(
                    runtimeClass, "getRuntime", new Class<?>[0]);
            Object runtime = getRuntime.invoke(null);

            java.lang.reflect.Method setExemptions = (java.lang.reflect.Method) getDeclaredMethod.invoke(
                    runtimeClass, "setHiddenApiExemptions", new Class<?>[] { String[].class });
            setExemptions.invoke(runtime, (Object) new String[] { "L" });
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }
}

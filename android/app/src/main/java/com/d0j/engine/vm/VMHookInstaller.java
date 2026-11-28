package com.d0j.engine.vm;

import android.app.Instrumentation;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.ResolveInfo;
import android.os.Process;
import android.util.Log;

import org.json.JSONObject;

import java.io.File;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;

/**
 * Attaches the VirtualApp-style framework hooks. Every hook reports its own
 * status and the whole install only flips VMRuntime to ready if all attach.
 * "Attached" means instrumentation is installed, NOT that a game was verified.
 */
public final class VMHookInstaller {
    private static final String TAG = "D0JVM";
    private static JSONObject lastReport;

    private VMHookInstaller() {}

    public static synchronized JSONObject report() {
        if (lastReport != null) return lastReport;
        try {
            return build("NOT_ATTEMPTED", "NOT_ATTEMPTED", "NOT_ATTEMPTED", "NOT_ATTEMPTED",
                    "UNAVAILABLE", false, "Hooks not attached yet");
        } catch (Exception ignored) {
            return new JSONObject();
        }
    }

    public static synchronized JSONObject attach(Context context) {
        String hidden = VMHiddenApi.exempt() ? "ATTEMPTED" : "UNAVAILABLE";
        String instrumentation = "NOT_ATTEMPTED";
        String activityManager = "NOT_ATTEMPTED";
        String packageManager = "NOT_ATTEMPTED";
        String failure = null;

        try {
            instrumentation = hookInstrumentation();
        } catch (Throwable e) {
            failure = describe(e);
            instrumentation = "FAILED";
            Log.w(TAG, "Instrumentation hook failed", e);
        }
        try {
            activityManager = hookActivityManager(context);
        } catch (Throwable e) {
            if (failure == null) failure = describe(e);
            activityManager = "FAILED";
            Log.w(TAG, "ActivityManager hook failed", e);
        }
        try {
            packageManager = hookPackageManager(context);
        } catch (Throwable e) {
            if (failure == null) failure = describe(e);
            packageManager = "FAILED";
            Log.w(TAG, "PackageManager hook failed", e);
        }

        boolean redirectReady = "ATTACHED".equals(instrumentation);
        boolean ready = redirectReady
                && "ATTACHED".equals(activityManager)
                && "ATTACHED".equals(packageManager);
        // Redirect can work from instrumentation alone. Keep it alive even if
        // ActivityManager/PackageManager identity hooks fail on this Android.
        if (redirectReady) VMRuntime.install(new AttachedInstrumentation());
        else VMRuntime.resetToStub();

        String redirect = redirectReady ? "AVAILABLE" : "UNAVAILABLE";
        String detail = "inst=" + instrumentation + " am=" + activityManager + " pm=" + packageManager;
        JSONObject result = null;
        try {
            result = build(hidden, instrumentation, activityManager, packageManager, redirect, ready,
                    ready ? "HOOKS_ATTACHED_NOT_DEVICE_VERIFIED"
                            : (failure == null ? "ONE_OR_MORE_HOOKS_FAILED · " + detail : failure + " · " + detail));
        } catch (Exception ignored) { }
        if (result == null) result = new JSONObject();
        lastReport = result;
        return result;
    }

    static String proxyActivity(int index) {
        switch (index) {
            case 1: return VMProxyActivity1.class.getName();
            case 2: return VMProxyActivity2.class.getName();
            case 3: return VMProxyActivity3.class.getName();
            default: return VMProxyActivity0.class.getName();
        }
    }

    private static JSONObject build(String hidden, String instrumentation, String activityManager,
                                    String packageManager, String redirect, boolean ready, String reason) throws Exception {
        JSONObject value = new JSONObject();
        value.put("hiddenApi", hidden);
        value.put("instrumentation", instrumentation);
        value.put("activityManager", activityManager);
        value.put("packageManager", packageManager);
        value.put("redirect", redirect);
        value.put("ready", ready);
        value.put("verifiedOnDevice", false);
        value.put("state", ready ? "HOOK_ATTACHED" : "HOOK_PENDING");
        value.put("reason", reason);
        return value;
    }

    private static String describe(Throwable e) {
        String message = String.valueOf(e.getMessage());
        return e.getClass().getSimpleName() + (message.isEmpty() ? "" : ": " + message);
    }

    private static String hookInstrumentation() throws Exception {
        Class<?> threadClass = Class.forName("android.app.ActivityThread");
        Method current = threadClass.getDeclaredMethod("currentActivityThread");
        current.setAccessible(true);
        Object thread = current.invoke(null);
        Field field = threadClass.getDeclaredField("mInstrumentation");
        field.setAccessible(true);
        Object existing = field.get(thread);
        if (existing instanceof HookInstrumentation) return "ATTACHED";
        if (!(existing instanceof Instrumentation)) throw new IllegalStateException("Unexpected instrumentation instance");
        field.set(thread, new HookInstrumentation((Instrumentation) existing));
        return "ATTACHED";
    }

    private static String hookActivityManager(Context context) throws Exception {
        Object original = null;
        Throwable serviceFailure = null;
        String[] managers = { "android.app.ActivityManager", "android.app.ActivityTaskManager" };
        for (String name : managers) {
            try {
                Class<?> manager = Class.forName(name);
                Method getService = manager.getDeclaredMethod("getService");
                getService.setAccessible(true);
                Object service = getService.invoke(null);
                if (service != null) { original = service; break; }
            } catch (Throwable e) {
                if (serviceFailure == null) serviceFailure = e;
            }
        }
        if (original == null) {
            throw new IllegalStateException("AM getService: "
                    + (serviceFailure == null ? "NO_SERVICE" : describe(serviceFailure)));
        }

        Class<?> api = Class.forName("android.app.IActivityManager");
        Object proxy = Proxy.newProxyInstance(api.getClassLoader(), new Class<?>[] { api },
                new ActivityManagerHandler(original, context.getApplicationContext()));

        Field singleton = null;
        Throwable fieldFailure = null;
        String[][] candidates = {
                { "android.app.ActivityManager", "IActivityManagerSingleton" },
                { "android.app.ActivityTaskManager", "IActivityTaskManagerSingleton" }
        };
        for (String[] candidate : candidates) {
            try {
                Field found = Class.forName(candidate[0]).getDeclaredField(candidate[1]);
                found.setAccessible(true);
                if (found.get(null) != null) { singleton = found; break; }
            } catch (Throwable e) {
                if (fieldFailure == null) fieldFailure = e;
            }
        }
        if (singleton == null) {
            throw new IllegalStateException("AM singleton: "
                    + (fieldFailure == null ? "NO_SINGLETON" : describe(fieldFailure)));
        }
        try {
            Object holder = singleton.get(null);
            Field instance = holder.getClass().getDeclaredField("mInstance");
            instance.setAccessible(true);
            instance.set(holder, proxy);
        } catch (Throwable e) {
            throw new IllegalStateException("AM proxy set: " + describe(e));
        }
        return "ATTACHED";
    }

    private static String hookPackageManager(Context context) throws Exception {
        Object original = null;
        Throwable failure = null;
        try {
            Class<?> appGlobals = Class.forName("android.app.AppGlobals");
            Method getService = appGlobals.getDeclaredMethod("getPackageManager");
            getService.setAccessible(true);
            original = getService.invoke(null);
        } catch (Throwable e) {
            failure = e;
        }
        if (original == null) {
            try {
                Class<?> threadClass = Class.forName("android.app.ActivityThread");
                Method current = threadClass.getDeclaredMethod("currentActivityThread");
                current.setAccessible(true);
                Object thread = current.invoke(null);
                Method getPackageManager = threadClass.getDeclaredMethod("getPackageManager");
                getPackageManager.setAccessible(true);
                original = getPackageManager.invoke(thread);
            } catch (Throwable e) {
                if (failure == null) failure = e;
            }
        }
        if (original == null) {
            throw new IllegalStateException("PM getService: "
                    + (failure == null ? "NO_SERVICE" : describe(failure)));
        }

        Class<?> api = Class.forName("android.content.pm.IPackageManager");
        Object proxy = Proxy.newProxyInstance(api.getClassLoader(), new Class<?>[] { api },
                new PackageManagerHandler(original, context.getApplicationContext()));
        try {
            Field field = Class.forName("android.content.pm.PackageManager").getDeclaredField("sPackageManager");
            field.setAccessible(true);
            field.set(null, proxy);
        } catch (Throwable e) {
            throw new IllegalStateException("PM proxy set: " + describe(e));
        }
        return "ATTACHED";
    }

    private static final class ActivityManagerHandler implements InvocationHandler {
        private final Object base;
        private final Context context;

        ActivityManagerHandler(Object base, Context context) {
            this.base = base;
            this.context = context;
        }

        @Override public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            if (args != null && method.getName().startsWith("startActivity")) {
                for (int i = 0; i < args.length; i++) {
                    if (!(args[i] instanceof Intent)) continue;
                    Intent incoming = (Intent) args[i];
                    String pkg = targetPackage(incoming);
                    VMRegisteredApp app = pkg == null ? null : VMCore.get(context).getApp(pkg);
                    if (app == null) continue;

                    Intent redirected = new Intent(incoming);
                    ComponentName component = incoming.getComponent();
                    String activity = component == null ? "" : component.getClassName();
                    redirected.setComponent(new ComponentName(
                            context.getPackageName(), proxyActivity(app.processIndex)));
                    redirected.putExtra("vmPackage", app.packageName);
                    redirected.putExtra("vmActivity", activity);
                    args[i] = redirected;
                    break;
                }
            }
            try {
                return method.invoke(base, args);
            } catch (InvocationTargetException e) {
                throw e.getCause();
            }
        }
    }

    private static String targetPackage(Intent intent) {
        String explicit = intent.getPackage();
        if (explicit != null && !explicit.isEmpty()) return explicit;
        ComponentName component = intent.getComponent();
        return component == null ? null : component.getPackageName();
    }

    private static final class PackageManagerHandler implements InvocationHandler {
        private final Object base;
        private final Context context;

        PackageManagerHandler(Object base, Context context) {
            this.base = base;
            this.context = context;
        }

        @Override public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            VMRegisteredApp app = lookup(args);
            if (app != null) {
                try {
                    Object synthetic = synthesize(method.getName(), app, args);
                    if (synthetic != null) return synthetic;
                } catch (Throwable ignored) {
                    // Fall through to the real package manager rather than crashing the host.
                }
            }
            try {
                return method.invoke(base, args);
            } catch (InvocationTargetException e) {
                throw e.getCause();
            }
        }

        private VMRegisteredApp lookup(Object[] args) {
            if (args == null || args.length == 0) return null;
            Object first = args[0];
            String pkg = null;
            if (first instanceof String) pkg = (String) first;
            else if (first instanceof ComponentName) pkg = ((ComponentName) first).getPackageName();
            else if (first instanceof Intent) {
                String explicit = ((Intent) first).getPackage();
                if (explicit == null && ((Intent) first).getComponent() != null) {
                    explicit = ((Intent) first).getComponent().getPackageName();
                }
                pkg = explicit;
            }
            return pkg == null ? null : VMCore.get(context).getApp(pkg);
        }

        private Object synthesize(String name, VMRegisteredApp app, Object[] args) throws Exception {
            if ("getApplicationInfo".equals(name)) return applicationInfo(app);
            if ("getActivityInfo".equals(name)) return activityInfo(app, args);
            if ("getPackageInfo".equals(name)) return packageInfo(app);
            if ("resolveActivity".equals(name)) {
                ResolveInfo info = new ResolveInfo();
                info.activityInfo = activityInfo(app, args);
                return info;
            }
            return null;
        }

        private ApplicationInfo applicationInfo(VMRegisteredApp app) {
            ApplicationInfo info = new ApplicationInfo();
            info.packageName = app.packageName;
            info.sourceDir = app.apkPath;
            info.publicSourceDir = app.apkPath;
            info.nativeLibraryDir = new File(context.getFilesDir(),
                    "vm/libs/" + safe(app.packageName)).getAbsolutePath();
            info.uid = Process.myUid();
            info.enabled = true;
            info.nonLocalizedLabel = app.label;
            return info;
        }

        private ActivityInfo activityInfo(VMRegisteredApp app, Object[] args) {
            ActivityInfo info = new ActivityInfo();
            info.packageName = app.packageName;
            info.applicationInfo = applicationInfo(app);
            info.exported = true;
            info.launchMode = ActivityInfo.LAUNCH_SINGLE_TASK;
            info.screenOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
            if (args != null && args.length > 0 && args[0] instanceof ComponentName) {
                info.name = ((ComponentName) args[0]).getClassName();
            } else {
                info.name = app.launchActivity;
            }
            return info;
        }

        private PackageInfo packageInfo(VMRegisteredApp app) {
            PackageInfo info = new PackageInfo();
            info.packageName = app.packageName;
            info.versionName = app.versionName;
            info.versionCode = (int) app.versionCode;
            info.applicationInfo = applicationInfo(app);
            ActivityInfo[] activities = new ActivityInfo[app.activities.size()];
            for (int i = 0; i < activities.length; i++) {
                ActivityInfo activity = new ActivityInfo();
                activity.packageName = app.packageName;
                activity.name = app.activities.get(i);
                activity.applicationInfo = info.applicationInfo;
                activity.exported = true;
                activities[i] = activity;
            }
            info.activities = activities;
            return info;
        }
    }

    private static String safe(String value) {
        return value == null ? "app" : value.replaceAll("[^a-zA-Z0-9._-]", "_");
    }
}

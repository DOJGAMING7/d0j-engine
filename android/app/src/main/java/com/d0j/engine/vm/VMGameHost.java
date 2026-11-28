package com.d0j.engine.vm;

import android.app.Activity;
import android.app.Application;
import android.content.ComponentName;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.res.AssetManager;
import android.content.res.Resources;
import android.view.LayoutInflater;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Builds the installed game's Resources and Application inside the hosting
 * process. This is preparation only: the Activity swap happens in a later
 * step, and any failure is recorded instead of being reported as a live host.
 */
public final class VMGameHost {
    private static final Map<String, Prepared> PREPARED = new ConcurrentHashMap<String, Prepared>();

    private VMGameHost() { }

    public static final class Prepared {
        public final String packageName;
        public final Resources resources;
        public final Application application;
        public final Context context;
        public final ApplicationInfo info;
        public final ClassLoader loader;
        public final String stages;

        private Prepared(String packageName, Resources resources, Application application,
                         Context context, ApplicationInfo info, ClassLoader loader, String stages) {
            this.packageName = packageName;
            this.resources = resources;
            this.application = application;
            this.context = context;
            this.info = info;
            this.loader = loader;
            this.stages = stages;
        }
    }

    /** Prepared game context, or null when no in-window host was built. */
    public static Prepared get(String packageName) {
        return packageName == null ? null : PREPARED.get(packageName);
    }

    public static Prepared prepare(Context host, String packageName, String[] apkPaths, ClassLoader loader) {
        StringBuilder stages = new StringBuilder("HOST_PREPARE_START");
        try {
            ApplicationInfo info = host.getPackageManager().getApplicationInfo(packageName, 0);
            stages.append("|PACKAGE_INFO_OK");

            // The framework builds Resources from ALL installed APK paths
            // (base + splits) with exactly the IDs the game was compiled
            // against. A hand-built AssetManager only sees the paths we pass
            // and resolves layout IDs to the wrong type (NotFoundException).
            Resources resources = null;
            Context gameContext = null;
            try {
                gameContext = host.createPackageContext(packageName, Context.CONTEXT_IGNORE_SECURITY);
                resources = gameContext.getResources();
                stages.append("|RESOURCES_SOURCE:GAME_CONTEXT");
            } catch (Throwable e) {
                stages.append("|GAME_CONTEXT_FAIL:").append(describe(e));
            }
            if (resources == null) {
                resources = buildResources(host, apkPaths, stages);
                stages.append("|RESOURCES_SOURCE:ASSET_PATH");
            }
            // Definitive check: the game expects 0x7f0b0015 to be a layout.
            // If this reports anything else, the table is wrong.
            try {
                stages.append("|ID_7F0B0015:").append(resources.getResourceTypeName(0x7f0b0015));
            } catch (Throwable e) {
                stages.append("|ID_7F0B0015:MISSING:").append(describe(e));
            }

            GameContext context = new GameContext(
                    gameContext == null ? host : gameContext,
                    packageName, info, loader, resources);
            Application application = buildApplication(info, loader, context, stages);
            context.application = application;
            Prepared prepared = new Prepared(packageName, resources, application, context,
                    info, loader, stages + "|HOST_PREPARE_OK");
            PREPARED.put(packageName, prepared);
            VMHosting.markStage(host, prepared.stages);
            return prepared;
        } catch (Throwable e) {
            String stage = stages + "|HOST_PREPARE_FAIL:" + describe(e);
            VMHosting.markStage(host, stage);
            VMHosting.markError(host, "HOST_PREPARE_FAIL\n" + stack(e));
            return null;
        }
    }

    /**
     * Installs the prepared game context on a substituted Activity before
     * Android calls its onCreate. Returns false when the swap cannot be done,
     * so the caller can abandon substitution instead of running the game with
     * our resources and causing a black screen or a lifecycle crash.
     */
    public static boolean apply(Activity activity, String packageName) {
        Prepared prepared = get(packageName);
        Context report = reportContext(activity);
        if (activity == null || prepared == null) {
            VMHosting.markStage(report, "ACTIVITY_SWAP_NO_PREPARED:" + packageName);
            return false;
        }
        try {
            VMHosting.markStage(report, "ACTIVITY_SWAP_START");
            // Keep the Activity's real ContextImpl as the delegation target so
            // window/system services still work; only game-facing values change.
            Context gameBase = wrap(prepared, activity.getBaseContext());
            setField(activity, "mBase", gameBase);
            setField(activity, "mResources", prepared.resources);
            setField(activity, "mApplication", prepared.application);
            // ContextThemeWrapper caches an inflater built at attach() time
            // from our app context. Replace it or AppCompat inflates layouts
            // against the wrong resource table.
            try { installInflater(activity, gameBase); } catch (Throwable ignored) { }
            try { installPackageInfo(activity, prepared); } catch (Throwable ignored) { }
            try {
                installTheme(activity, prepared, report);
            } catch (Throwable e) {
                VMHosting.markStage(report, "THEME_FAIL:" + describe(e));
            }
            VMHosting.markStage(report, "ACTIVITY_CONTEXT_SWAPPED");
            return true;
        } catch (Throwable e) {
            VMHosting.markStage(report, "ACTIVITY_SWAP_FAIL:" + describe(e));
            VMHosting.markError(report, "ACTIVITY_SWAP_FAIL\n" + stack(e));
            return false;
        }
    }

    private static Context wrap(Prepared prepared, Context base) {
        GameContext context = new GameContext(
                base == null ? prepared.context : base,
                prepared.packageName, prepared.info, prepared.loader, prepared.resources);
        context.application = prepared.application;
        return context;
    }

    /** Never rely on a game Activity's getApplicationContext() for our files. */
    private static Context reportContext(Activity activity) {
        VMCore core = VMCore.peek();
        if (core != null && core.context() != null) return core.context();
        return activity == null ? null : activity.getApplicationContext();
    }

    /** Apply the game's manifest theme so AppCompat finds its own theme attrs. */
    private static void installTheme(Activity activity, Prepared prepared, Context report)
            throws Exception {
        int theme = 0;
        Intent intent = activity.getIntent();
        String target = intent == null ? null : intent.getStringExtra("vmActivity");
        try {
            if (target != null && !target.trim().isEmpty()) {
                ActivityInfo info = prepared.context.getPackageManager().getActivityInfo(
                        new ComponentName(prepared.packageName, target), 0);
                if (info != null) theme = info.theme;
            }
        } catch (Throwable ignored) { }
        if (theme == 0) theme = prepared.info.theme;
        // Diagnostics go to OUR storage, never the game's private files.
        VMHosting.markStage(report, "THEME_ID:" + theme);
        if (theme == 0) {
            VMHosting.markStage(report, "THEME_MISSING");
            return;
        }
        // Do not call Activity.setTheme(): it copies the base ContextImpl's
        // theme, which still belongs to OUR resource table. Build a fresh theme
        // from the game's Resources and install it directly on the Activity.
        Resources.Theme gameTheme = prepared.resources.newTheme();
        gameTheme.applyStyle(theme, true);
        setField(activity, "mTheme", gameTheme);
        setField(activity, "mThemeResource", theme);
        prepared.context.theme = gameTheme;
        VMHosting.markStage(report, "THEME_APPLIED:" + theme);
    }

    private static void installInflater(Activity activity, Context gameBase) throws Exception {
        Object cached = activity.getSystemService(Context.LAYOUT_INFLATER_SERVICE);
        LayoutInflater gameInflater = (cached instanceof LayoutInflater)
                ? ((LayoutInflater) cached).cloneInContext(gameBase)
                : LayoutInflater.from(gameBase);
        setField(activity, "mInflater", gameInflater);
    }

    private static void installPackageInfo(Activity activity, Prepared prepared) throws Exception {
        Class<?> threadClass = Class.forName("android.app.ActivityThread");
        Method current = threadClass.getDeclaredMethod("currentActivityThread");
        current.setAccessible(true);
        Object thread = current.invoke(null);
        Class<?> compatClass = Class.forName("android.content.res.CompatibilityInfo");
        Field defaultCompat = compatClass.getDeclaredField("DEFAULT_COMPATIBILITY_INFO");
        defaultCompat.setAccessible(true);
        Method getInfo = threadClass.getDeclaredMethod(
                "getPackageInfoNoCheck", ApplicationInfo.class, compatClass);
        getInfo.setAccessible(true);
        Object loaded = getInfo.invoke(thread, prepared.context.getApplicationInfo(), defaultCompat.get(null));
        setField(activity, "mPackageInfo", loaded);
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Class<?> type = target.getClass();
        while (type != null) {
            try {
                Field field = type.getDeclaredField(name);
                field.setAccessible(true);
                field.set(target, value);
                return;
            } catch (NoSuchFieldException e) {
                type = type.getSuperclass();
            }
        }
        throw new NoSuchFieldException(name);
    }

    private static String stack(Throwable error) {
        StringWriter writer = new StringWriter();
        PrintWriter out = new PrintWriter(writer);
        error.printStackTrace(out);
        out.flush();
        return writer.toString();
    }

    private static Resources buildResources(Context host, String[] apkPaths, StringBuilder stages) throws Exception {
        AssetManager assets = AssetManager.class.newInstance();
        Method add = AssetManager.class.getDeclaredMethod("addAssetPath", String.class);
        add.setAccessible(true);
        int added = 0;
        if (apkPaths != null) {
            for (String path : apkPaths) {
                if (path == null || path.trim().isEmpty()) continue;
                add.invoke(assets, path);
                added++;
            }
        }
        if (added == 0) throw new IllegalStateException("NO_APK_ASSET_PATH");
        Resources base = host.getResources();
        stages.append("|RESOURCES_OK:").append(added);
        return new Resources(assets, base.getDisplayMetrics(), base.getConfiguration());
    }

    private static Application buildApplication(ApplicationInfo info, ClassLoader loader,
                                                GameContext context, StringBuilder stages) throws Exception {
        String className = info.className;
        if (className == null || className.trim().isEmpty()) {
            stages.append("|APPLICATION_DEFAULT");
            return new Application();
        }
        Class<?> type = Class.forName(className, true, loader);
        Constructor<?> constructor = type.getDeclaredConstructor();
        constructor.setAccessible(true);
        Application application = (Application) constructor.newInstance();
        try {
            Method attach = Application.class.getDeclaredMethod("attach", Context.class);
            attach.setAccessible(true);
            attach.invoke(application, context);
            stages.append("|APPLICATION_ATTACHED");
        } catch (Throwable e) {
            // The Application object still exists; a later step can retry the
            // attach with a full Activity context instead of a wrapper.
            stages.append("|APPLICATION_ATTACH_BLOCKED:").append(describe(e));
        }
        // A real app launch calls onCreate() on the Application before the
        // Activity. Games often complete their own resource setup here.
        try {
            Method onCreate = Application.class.getDeclaredMethod("onCreate");
            onCreate.setAccessible(true);
            onCreate.invoke(application);
            stages.append("|APPLICATION_ONCREATE_OK");
        } catch (Throwable e) {
            stages.append("|APPLICATION_ONCREATE_FAIL:").append(describe(e));
        }
        return application;
    }

    private static String describe(Throwable e) {
        String message = String.valueOf(e.getMessage());
        return e.getClass().getSimpleName() + (message.isEmpty() ? "" : ":" + message);
    }

    /** Minimal game-aware context. Our own PM is read-only and stays untouched. */
    private static final class GameContext extends ContextWrapper {
        private final String packageName;
        private final ApplicationInfo info;
        private final ClassLoader loader;
        private final Resources resources;
        private Application application;
        private Resources.Theme theme;

        GameContext(Context base, String packageName, ApplicationInfo info,
                    ClassLoader loader, Resources resources) {
            super(base);
            this.packageName = packageName;
            this.info = info;
            this.loader = loader;
            this.resources = resources;
        }

        @Override public Resources getResources() { return resources; }
        @Override public Resources.Theme getTheme() {
            return theme == null ? super.getTheme() : theme;
        }
        @Override public AssetManager getAssets() { return resources.getAssets(); }
        @Override public String getPackageName() { return packageName; }
        @Override public ApplicationInfo getApplicationInfo() { return info; }
        @Override public ClassLoader getClassLoader() { return loader; }
        @Override public Context getApplicationContext() { return application == null ? this : application; }

        /** Bind inflation to this context so IDs resolve against the game table. */
        @Override public Object getSystemService(String name) {
            Object service = super.getSystemService(name);
            if (Context.LAYOUT_INFLATER_SERVICE.equals(name) && service instanceof LayoutInflater) {
                return ((LayoutInflater) service).cloneInContext(this);
            }
            return service;
        }
    }
}

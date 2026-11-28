package com.d0j.engine.vm;

import android.app.Application;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.pm.ApplicationInfo;
import android.content.res.AssetManager;
import android.content.res.Resources;

import java.lang.reflect.Constructor;
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
        public final String stages;

        private Prepared(String packageName, Resources resources, Application application,
                         Context context, String stages) {
            this.packageName = packageName;
            this.resources = resources;
            this.application = application;
            this.context = context;
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
            Resources resources = buildResources(host, apkPaths, stages);
            GameContext context = new GameContext(host, packageName, info, loader, resources);
            Application application = buildApplication(info, loader, context, stages);
            context.application = application;
            Prepared prepared = new Prepared(packageName, resources, application, context,
                    stages + "|HOST_PREPARE_OK");
            PREPARED.put(packageName, prepared);
            VMHosting.markStage(host, prepared.stages);
            return prepared;
        } catch (Throwable e) {
            String stage = stages + "|HOST_PREPARE_FAIL:" + describe(e);
            VMHosting.markStage(host, stage);
            return null;
        }
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

        GameContext(Context base, String packageName, ApplicationInfo info,
                    ClassLoader loader, Resources resources) {
            super(base);
            this.packageName = packageName;
            this.info = info;
            this.loader = loader;
            this.resources = resources;
        }

        @Override public Resources getResources() { return resources; }
        @Override public AssetManager getAssets() { return resources.getAssets(); }
        @Override public String getPackageName() { return packageName; }
        @Override public ApplicationInfo getApplicationInfo() { return info; }
        @Override public ClassLoader getClassLoader() { return loader; }
        @Override public Application getApplication() { return application; }
        @Override public Context getApplicationContext() { return application == null ? this : application; }
    }
}

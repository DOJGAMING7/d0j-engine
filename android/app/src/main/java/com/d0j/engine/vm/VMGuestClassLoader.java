package com.d0j.engine.vm;

import dalvik.system.DexClassLoader;

/**
 * Loads the installed game's own classes before our app's duplicates.
 *
 * The default DexClassLoader is parent-first. Because our app also bundles
 * AndroidX/AppCompat, the game Activity received OUR AppCompatDelegateImpl and
 * therefore OUR R.layout IDs, which resolve to integers in the game's resource
 * table (Resource ID #0x7f0b0015 type #0x10). Guest-first loading makes the
 * game use its own classes and matching IDs.
 *
 * Framework classes, our own classes and standard libraries stay parent-first
 * so the hosted Activity can still use Android and our HUD bridge.
 */
public final class VMGuestClassLoader extends DexClassLoader {
    private static final String[] PARENT_FIRST = {
            "java.", "javax.", "android.", "dalvik.", "libcore.",
            "org.json.", "org.xml.", "org.apache.",
            "com.d0j.", "com.getcapacitor.", "com.capacitorjs."
    };

    public VMGuestClassLoader(String dexPath, String optimizedDirectory,
                              String librarySearchPath, ClassLoader parent) {
        super(dexPath, optimizedDirectory, librarySearchPath, parent);
    }

    @Override protected Class<?> loadClass(String name, boolean resolve)
            throws ClassNotFoundException {
        synchronized (this) {
            Class<?> found = findLoadedClass(name);
            if (found == null) {
                if (isParentFirst(name)) {
                    found = super.loadClass(name, false);
                } else {
                    try {
                        found = findClass(name);
                    } catch (ClassNotFoundException e) {
                        found = super.loadClass(name, false);
                    }
                }
            }
            if (resolve) resolveClass(found);
            return found;
        }
    }

    private static boolean isParentFirst(String name) {
        if (name == null) return false;
        for (String prefix : PARENT_FIRST) {
            if (name.startsWith(prefix)) return true;
        }
        return false;
    }
}

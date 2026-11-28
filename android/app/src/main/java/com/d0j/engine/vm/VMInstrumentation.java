package com.d0j.engine.vm;

import android.content.Context;

/**
 * Seam between the host substrate and a real virtual-app framework hook.
 * A real implementation attaches proxy activity/AMS/PMS instrumentation.
 * The shipped build deliberately keeps the stub: it must report NOT ready.
 */
public interface VMInstrumentation {
    boolean isReady();

    String missingReason();

    boolean startActivity(Context context, VMRegisteredApp app, String activityName, int processIndex);

    void stop(String packageName);
}

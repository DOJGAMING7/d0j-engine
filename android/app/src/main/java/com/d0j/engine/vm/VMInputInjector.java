package com.d0j.engine.vm;

/** Touch injection contract. Coordinates come from user calibration, never guesses. */
public interface VMInputInjector {
    boolean isReady();

    String reason();

    boolean tap(float x, float y);

    boolean swipe(float x1, float y1, float x2, float y2, long durationMs);

    /** Dispatches a timed, multi-point touch path supplied by the caller. */
    boolean path(String json);
}

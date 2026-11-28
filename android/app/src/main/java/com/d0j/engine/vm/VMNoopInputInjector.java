package com.d0j.engine.vm;

/** Honest default: no injection until an in-process injector is attached. */
public final class VMNoopInputInjector implements VMInputInjector {
    @Override public boolean isReady() { return false; }

    @Override public String reason() { return "INPUT_NOT_ATTACHED"; }

    @Override public boolean tap(float x, float y) { return false; }

    @Override public boolean swipe(float x1, float y1, float x2, float y2, long durationMs) { return false; }

    @Override public boolean path(String json) { return false; }
}

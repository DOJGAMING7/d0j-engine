package com.d0j.engine.vm;

/** Supplies table state to the line engine. Implementations must not fake data. */
public interface VMStateProvider {
    String name();

    boolean isReady();

    String reason();

    VMStateSnapshot read() throws Exception;
}

package com.d0j.engine.vm;

import android.content.Context;

/** Reads live state only from measured bindings. Never fills unknown fields with guesses. */
public final class VMProbeStateProvider implements VMStateProvider {
    private static final int MAX_BALLS = 16;
    private static final int MAX_POCKETS = 8;
    private final VMBindingStore store;
    private VMMemoryReader reader;

    public VMProbeStateProvider(Context context) {
        this.store = new VMBindingStore(context);
    }

    public void setReader(VMMemoryReader next) {
        reader = next;
    }

    public VMMemoryReader reader() {
        return reader;
    }

    public VMBindingStore store() {
        return store;
    }

    @Override public String name() { return "vm-probe"; }

    @Override public boolean isReady() {
        VMPointerBinding binding = store.load();
        return binding.isUsable() && reader != null && reader.isReady();
    }

    @Override public String reason() {
        VMPointerBinding binding = store.load();
        if (!binding.isUsable()) return binding.unusableReason();
        if (reader == null) return "NO_MEMORY_READER";
        if (!reader.isReady()) return reader.reason();
        return "";
    }

    @Override public VMStateSnapshot read() throws Exception {
        if (!isReady()) throw new IllegalStateException(reason());
        VMPointerBinding binding = store.load();
        long module = reader.moduleBase(binding.moduleName);
        if (module == 0) throw new IllegalStateException("MODULE_BASE_UNKNOWN");

        VMStateSnapshot snapshot = new VMStateSnapshot();
        snapshot.packageName = binding.packageName;
        snapshot.build = binding.versionName;
        snapshot.source = "vm-probe";
        snapshot.phase = "MEASURED";
        snapshot.confidence = 0.5;
        snapshot.cueX = reader.readFloat(module + binding.cueXOffset);
        snapshot.cueY = reader.readFloat(module + binding.cueYOffset);

        if (binding.ballsArrayOffset != null && binding.ballStride != null) {
            long array = reader.readPointer(module + binding.ballsArrayOffset);
            for (int i = 0; array != 0 && i < MAX_BALLS; i++) {
                long address = array + i * binding.ballStride;
                float x = reader.readFloat(address + binding.ballXOffset);
                float y = reader.readFloat(address + binding.ballYOffset);
                if (!valid(x) || !valid(y)) break;
                VMStateSnapshot.VMBall ball = new VMStateSnapshot.VMBall();
                ball.id = "#" + (i + 1);
                ball.x = x;
                ball.y = y;
                ball.active = binding.ballActiveOffset == null
                        || reader.readInt(address + binding.ballActiveOffset) != 0;
                snapshot.balls.add(ball);
            }
        }

        if (binding.pocketsArrayOffset != null && binding.pocketStride != null
                && binding.pocketXOffset != null && binding.pocketYOffset != null) {
            long array = reader.readPointer(module + binding.pocketsArrayOffset);
            for (int i = 0; array != 0 && i < MAX_POCKETS; i++) {
                long address = array + i * binding.pocketStride;
                float x = reader.readFloat(address + binding.pocketXOffset);
                float y = reader.readFloat(address + binding.pocketYOffset);
                if (!valid(x) || !valid(y)) break;
                VMStateSnapshot.VMPocket pocket = new VMStateSnapshot.VMPocket();
                pocket.id = "P" + (i + 1);
                pocket.x = x;
                pocket.y = y;
                snapshot.pockets.add(pocket);
            }
        }

        if (binding.turnOffset != null) snapshot.turn = String.valueOf(reader.readInt(module + binding.turnOffset));
        if (binding.powerOffset != null) snapshot.power = reader.readFloat(module + binding.powerOffset);
        if (binding.aimXOffset != null) snapshot.aimX = reader.readFloat(module + binding.aimXOffset);
        if (binding.aimYOffset != null) snapshot.aimY = reader.readFloat(module + binding.aimYOffset);
        return snapshot;
    }

    private static boolean valid(float value) {
        return !Float.isNaN(value) && !Float.isInfinite(value) && value > 0 && value < 100000;
    }
}

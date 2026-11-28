package com.d0j.engine.vm;

/** Mirrors the local demo table. Clearly labelled as simulated, never as live 8BP. */
public final class VMDemoStateProvider implements VMStateProvider {
    @Override public String name() { return "demo"; }

    @Override public boolean isReady() { return true; }

    @Override public String reason() { return ""; }

    @Override public VMStateSnapshot read() {
        VMStateSnapshot snapshot = new VMStateSnapshot();
        snapshot.source = "demo-simulated";
        snapshot.phase = "YOUR_TURN";
        snapshot.turn = "you";
        snapshot.confidence = 1;
        snapshot.cueX = 300;
        snapshot.cueY = 660;

        addBall(snapshot, "1", 300, 300);
        addBall(snapshot, "9", 420, 420);
        addBall(snapshot, "2", 180, 420);

        addPocket(snapshot, "TL", 0, 0, 18);
        addPocket(snapshot, "TM", 300, 0, 18);
        addPocket(snapshot, "TR", 600, 0, 18);
        addPocket(snapshot, "BL", 0, 900, 18);
        addPocket(snapshot, "BM", 300, 900, 18);
        addPocket(snapshot, "BR", 600, 900, 18);
        return snapshot;
    }

    private static void addBall(VMStateSnapshot snapshot, String id, double x, double y) {
        VMStateSnapshot.VMBall ball = new VMStateSnapshot.VMBall();
        ball.id = id;
        ball.x = x;
        ball.y = y;
        snapshot.balls.add(ball);
    }

    private static void addPocket(VMStateSnapshot snapshot, String id, double x, double y, double r) {
        VMStateSnapshot.VMPocket pocket = new VMStateSnapshot.VMPocket();
        pocket.id = id;
        pocket.x = x;
        pocket.y = y;
        pocket.r = r;
        snapshot.pockets.add(pocket);
    }
}

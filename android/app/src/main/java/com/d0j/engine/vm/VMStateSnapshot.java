package com.d0j.engine.vm;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Neutral table state shared by the host probe and the JS prediction engine. */
public final class VMStateSnapshot {
    public String packageName = "com.miniclip.eightballpool";
    public String build = "56.34.0";
    public long capturedAt = System.currentTimeMillis();
    public double cueX;
    public double cueY;
    public final List<VMBall> balls = new ArrayList<VMBall>();
    public final List<VMPocket> pockets = new ArrayList<VMPocket>();
    public String turn = "";
    public double power;
    public double aimX;
    public double aimY;
    public String phase = "";
    public String source = "unknown";
    public double confidence;

    public static final class VMBall {
        public String id = "";
        public double x;
        public double y;
        public boolean active = true;

        public JSONObject toJson() throws Exception {
            JSONObject value = new JSONObject();
            value.put("id", id);
            value.put("x", finite(x));
            value.put("y", finite(y));
            value.put("active", active);
            return value;
        }

        public static VMBall fromJson(JSONObject value) {
            VMBall ball = new VMBall();
            ball.id = value.optString("id", "");
            ball.x = value.optDouble("x", 0);
            ball.y = value.optDouble("y", 0);
            ball.active = value.optBoolean("active", true);
            return ball;
        }
    }

    public static final class VMPocket {
        public String id = "";
        public double x;
        public double y;
        public double r;

        public JSONObject toJson() throws Exception {
            JSONObject value = new JSONObject();
            value.put("id", id);
            value.put("x", finite(x));
            value.put("y", finite(y));
            value.put("r", finite(r));
            return value;
        }

        public static VMPocket fromJson(JSONObject value) {
            VMPocket pocket = new VMPocket();
            pocket.id = value.optString("id", "");
            pocket.x = value.optDouble("x", 0);
            pocket.y = value.optDouble("y", 0);
            pocket.r = value.optDouble("r", 0);
            return pocket;
        }
    }

    public boolean isComplete() {
        return cueX > 0 && cueY > 0 && !balls.isEmpty() && !pockets.isEmpty();
    }

    public JSONObject toJson() throws Exception {
        JSONObject value = new JSONObject();
        value.put("packageName", packageName);
        value.put("build", build);
        value.put("capturedAt", capturedAt);
        value.put("cueX", finite(cueX));
        value.put("cueY", finite(cueY));
        JSONArray ballArray = new JSONArray();
        for (VMBall ball : balls) ballArray.put(ball.toJson());
        value.put("balls", ballArray);
        JSONArray pocketArray = new JSONArray();
        for (VMPocket pocket : pockets) pocketArray.put(pocket.toJson());
        value.put("pockets", pocketArray);
        value.put("turn", turn);
        value.put("power", finite(power));
        value.put("aimX", finite(aimX));
        value.put("aimY", finite(aimY));
        value.put("phase", phase);
        value.put("source", source);
        value.put("confidence", finite(confidence));
        value.put("complete", isComplete());
        return value;
    }

    public static VMStateSnapshot fromJson(JSONObject value) {
        VMStateSnapshot snapshot = new VMStateSnapshot();
        snapshot.packageName = value.optString("packageName", snapshot.packageName);
        snapshot.build = value.optString("build", snapshot.build);
        snapshot.capturedAt = value.optLong("capturedAt", snapshot.capturedAt);
        snapshot.cueX = value.optDouble("cueX", 0);
        snapshot.cueY = value.optDouble("cueY", 0);
        JSONArray ballArray = value.optJSONArray("balls");
        if (ballArray != null) {
            for (int i = 0; i < ballArray.length(); i++) {
                snapshot.balls.add(VMBall.fromJson(ballArray.optJSONObject(i)));
            }
        }
        JSONArray pocketArray = value.optJSONArray("pockets");
        if (pocketArray != null) {
            for (int i = 0; i < pocketArray.length(); i++) {
                snapshot.pockets.add(VMPocket.fromJson(pocketArray.optJSONObject(i)));
            }
        }
        snapshot.turn = value.optString("turn", "");
        snapshot.power = value.optDouble("power", 0);
        snapshot.aimX = value.optDouble("aimX", 0);
        snapshot.aimY = value.optDouble("aimY", 0);
        snapshot.phase = value.optString("phase", "");
        snapshot.source = value.optString("source", "unknown");
        snapshot.confidence = value.optDouble("confidence", 0);
        return snapshot;
    }

    private static double finite(double value) {
        return Double.isNaN(value) || Double.isInfinite(value) ? 0 : value;
    }
}

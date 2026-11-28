package com.d0j.engine.vm;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Detects pool balls inside a calibrated table rectangle from a real screen
 * frame. Everything runs on-device; no frame or coordinate leaves the phone.
 * Positions are returned relative to the table rectangle, never guessed from
 * memory or from a build-specific offset.
 */
public final class ScreenBallDetector {
    private static final String[] IDS = {"cue", "1", "2", "3", "4", "5", "6", "7", "8"};
    private static final String[] COLORS = {
            "#FFFFFF", "#FFD400", "#1E88E5", "#E53935", "#8E24AA",
            "#FB8C00", "#43A047", "#8D6E63", "#ECEFF1"
    };
    private static final double[] POCKET_X = {0.035, 0.5, 0.965, 0.035, 0.5, 0.965};
    private static final double[] POCKET_Y = {0.055, 0.018, 0.055, 0.945, 0.982, 0.945};
    private static final String[] POCKET_IDS = {"TL", "TM", "TR", "BL", "BM", "BR"};
    private static final int STEP = 2;

    private ScreenBallDetector() {}

    public static JSONObject detect(int[] pixels, int frameW, int frameH, JSONObject rect) throws Exception {
        int x0 = Math.max(0, (int) Math.floor(rect.optDouble("x", 0)));
        int y0 = Math.max(0, (int) Math.floor(rect.optDouble("y", 0)));
        int rw = Math.max(1, Math.min(frameW - x0, (int) Math.round(rect.optDouble("width", 600))));
        int rh = Math.max(1, Math.min(frameH - y0, (int) Math.round(rect.optDouble("height", 900))));
        if (rw < 40 || rh < 40) throw new IllegalArgumentException("TABLE_RECT_TOO_SMALL");

        double minR = Math.max(3, rw * 0.006);
        double maxR = Math.max(8, rw * 0.032);
        boolean[] visited = new boolean[frameW * frameH];
        int[] queue = new int[Math.max(64, rw * rh)];

        List<Component> found = new ArrayList<Component>();
        for (int y = y0; y < y0 + rh; y += STEP) {
            for (int x = x0; x < x0 + rw; x += STEP) {
                int index = y * frameW + x;
                if (visited[index]) continue;
                int category = categoryOf(pixels[index]);
                if (category < 0) continue;
                Component component = flood(pixels, frameW, x, y, x0, y0, x0 + rw, y0 + rh,
                        category, visited, queue);
                double radius = Math.sqrt(Math.max(1, component.count) * STEP * STEP / Math.PI);
                if (radius < minR || radius > maxR) continue;
                if (component.width < radius || component.height < radius) continue;
                if (component.width > radius * 5 || component.height > radius * 5) continue;
                component.radius = radius;
                component.category = category;
                found.add(component);
            }
        }

        JSONArray pockets = new JSONArray();
        for (int i = 0; i < POCKET_X.length; i++) {
            pockets.put(new JSONObject()
                    .put("id", POCKET_IDS[i])
                    .put("x", Math.round(POCKET_X[i] * rw))
                    .put("y", Math.round(POCKET_Y[i] * rh)));
        }

        // Largest white component is the cue ball.
        Component cue = null;
        for (Component component : found) {
            if (component.category != 0) continue;
            if (cue == null || component.count > cue.count) cue = component;
        }
        if (cue == null) throw new IllegalArgumentException("CUE_NOT_VISIBLE");

        int[] perCategory = new int[IDS.length];
        Arrays.fill(perCategory, 1);
        JSONArray balls = new JSONArray();
        double radiusSum = 0;
        int ballCount = 0;
        for (Component component : found) {
            int category = component.category;
            if (category == 0) continue; // cue is reported separately, never as an object ball
            double cx = component.sumX / (double) component.count - x0;
            double cy = component.sumY / (double) component.count - y0;
            if (category == 8 && nearPocket(cx, cy, rw, rh, maxR * 2.2)) continue;
            String id;
            if (category == 0) {
                id = "cue";
            } else {
                int index = perCategory[category]++;
                id = IDS[category] + (index > 1 ? "-" + index : "");
            }
            balls.put(new JSONObject()
                    .put("id", id)
                    .put("x", Math.round(cx))
                    .put("y", Math.round(cy))
                    .put("color", COLORS[category])
                    .put("radius", Math.round(component.radius)));
            radiusSum += component.radius;
            ballCount++;
        }

        JSONObject result = new JSONObject();
        result.put("ok", true);
        result.put("source", "screen");
        result.put("simulated", false);
        result.put("width", rw);
        result.put("height", rh);
        result.put("ballRadius", ballCount > 0 ? Math.round(radiusSum / ballCount) : Math.round(minR));
        result.put("pocketRadius", Math.round(rw * 0.028));
        result.put("cueX", Math.round(cue.sumX / (double) cue.count - x0));
        result.put("cueY", Math.round(cue.sumY / (double) cue.count - y0));
        result.put("balls", balls);
        result.put("pockets", pockets);
        result.put("confidence", Math.min(1.0, ballCount / 8.0));
        result.put("frame", frameW + "x" + frameH);
        return result;
    }

    private static boolean nearPocket(double x, double y, int rw, int rh, double limit) {
        for (int i = 0; i < POCKET_X.length; i++) {
            double dx = x - POCKET_X[i] * rw;
            double dy = y - POCKET_Y[i] * rh;
            if (Math.hypot(dx, dy) < limit) return true;
        }
        return false;
    }

    private static int categoryOf(int argb) {
        int r = (argb >> 16) & 0xFF;
        int g = (argb >> 8) & 0xFF;
        int b = argb & 0xFF;
        int max = Math.max(r, Math.max(g, b));
        int min = Math.min(r, Math.min(g, b));
        float v = max / 255f;
        float delta = max - min;
        float s = max == 0 ? 0 : delta / (float) max;
        float h = 0;
        if (delta != 0) {
            if (max == r) h = 60 * (((g - b) / (float) delta) % 6);
            else if (max == g) h = 60 * (((b - r) / (float) delta) + 2);
            else h = 60 * (((r - g) / (float) delta) + 4);
            if (h < 0) h += 360;
        }
        if (v > 0.82f && s < 0.13f) return 0;
        if (v < 0.16f && s < 0.5f) return 8;
        if (h >= 40 && h < 70 && s > 0.45f && v > 0.5f) return 1;
        if (h >= 185 && h < 250 && s > 0.4f && v > 0.35f) return 2;
        if ((h < 18 || h >= 345) && s > 0.45f && v > 0.3f) return 3;
        if (h >= 265 && h < 335 && s > 0.35f && v > 0.3f) return 4;
        if (h >= 18 && h < 40 && s > 0.5f && v > 0.45f) return 5;
        if (h >= 80 && h < 160 && s > 0.6f && v > 0.45f) return 6;
        if (h >= 18 && h < 45 && s > 0.25f && s <= 0.5f && v > 0.25f && v < 0.65f) return 7;
        return -1;
    }

    private static Component flood(int[] pixels, int frameW, int startX, int startY,
                                   int minX, int minY, int maxX, int maxY,
                                   int category, boolean[] visited, int[] queue) {
        int head = 0;
        int tail = 0;
        int first = startY * frameW + startX;
        visited[first] = true;
        if (tail < queue.length) queue[tail++] = first;
        Component result = new Component();
        while (head < tail) {
            int index = queue[head++];
            int x = index % frameW;
            int y = index / frameW;
            result.count++;
            result.sumX += x;
            result.sumY += y;
            result.minX = Math.min(result.minX, x);
            result.maxX = Math.max(result.maxX, x);
            result.minY = Math.min(result.minY, y);
            result.maxY = Math.max(result.maxY, y);
            for (int dy = -STEP; dy <= STEP; dy += STEP) {
                for (int dx = -STEP; dx <= STEP; dx += STEP) {
                    if (dx == 0 && dy == 0) continue;
                    int nx = x + dx;
                    int ny = y + dy;
                    if (nx < minX || nx >= maxX || ny < minY || ny >= maxY) continue;
                    int next = ny * frameW + nx;
                    if (visited[next]) continue;
                    if (categoryOf(pixels[next]) != category) continue;
                    visited[next] = true;
                    if (tail >= queue.length) continue;
                    queue[tail++] = next;
                }
            }
        }
        result.width = result.maxX - result.minX + 1;
        result.height = result.maxY - result.minY + 1;
        return result;
    }

    private static final class Component {
        int count;
        long sumX;
        long sumY;
        int minX = Integer.MAX_VALUE;
        int maxX = Integer.MIN_VALUE;
        int minY = Integer.MAX_VALUE;
        int maxY = Integer.MIN_VALUE;
        int width;
        int height;
        double radius;
        int category;
    }
}

package com.d0j.engine.vm;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.MotionEvent;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.ref.WeakReference;

/**
 * Injects touch events into an Activity owned by this process. No accessibility
 * service and no system INJECT_EVENTS permission are used.
 */
public final class VMActivityInputInjector implements VMInputInjector {
    private static final int STEPS = 6;
    private static WeakReference<Activity> current = new WeakReference<Activity>(null);
    private static String boundActivity = "";
    private final Handler handler = new Handler(Looper.getMainLooper());

    public static void bind(Activity activity) {
        if (activity == null) return;
        current = new WeakReference<Activity>(activity);
        boundActivity = activity.getClass().getName();
    }

    public static String boundActivity() {
        return boundActivity;
    }

    @Override public boolean isReady() {
        Activity activity = current.get();
        return activity != null && !activity.isFinishing();
    }

    @Override public String reason() {
        if (isReady()) return "";
        return "NO_HOST_ACTIVITY";
    }

    @Override public boolean tap(float x, float y) {
        final Activity activity = current.get();
        if (activity == null || activity.isFinishing()) return false;
        handler.post(new Runnable() {
            @Override public void run() {
                long now = SystemClock.uptimeMillis();
                activity.dispatchTouchEvent(event(activity, now, MotionEvent.ACTION_DOWN, x, y, now));
                activity.dispatchTouchEvent(event(activity, now, MotionEvent.ACTION_UP, x, y, now + 45));
            }
        });
        return true;
    }

    @Override public boolean swipe(final float x1, final float y1, final float x2, final float y2, long durationMs) {
        final Activity activity = current.get();
        if (activity == null || activity.isFinishing()) return false;
        final long duration = Math.max(60, Math.min(3000, durationMs));
        handler.post(new Runnable() {
            @Override public void run() {
                final long start = SystemClock.uptimeMillis();
                activity.dispatchTouchEvent(event(activity, start, MotionEvent.ACTION_DOWN, x1, y1, start));
                for (int i = 1; i <= STEPS; i++) {
                    final int step = i;
                    handler.postDelayed(new Runnable() {
                        @Override public void run() {
                            float t = step / (float) STEPS;
                            long at = start + duration * step / STEPS;
                            activity.dispatchTouchEvent(event(activity, start, MotionEvent.ACTION_MOVE,
                                    x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, at));
                        }
                    }, duration * step / STEPS);
                }
                handler.postDelayed(new Runnable() {
                    @Override public void run() {
                        activity.dispatchTouchEvent(event(activity, start, MotionEvent.ACTION_UP, x2, y2, start + duration));
                    }
                }, duration);
            }
        });
        return true;
    }

    @Override public boolean path(String json) {
        final Activity activity = current.get();
        if (activity == null || activity.isFinishing() || json == null) return false;
        try {
            JSONObject root = new JSONObject(json);
            JSONArray array = root.optJSONArray("points");
            if (array == null || array.length() < 2) return false;
            int count = Math.min(96, array.length());
            final float[] xs = new float[count];
            final float[] ys = new float[count];
            final float[] pressure = new float[count];
            final float[] size = new float[count];
            final long[] delays = new long[count];
            long total = 0;
            for (int i = 0; i < count; i++) {
                JSONObject p = array.getJSONObject(i);
                xs[i] = (float) p.optDouble("x", 0);
                ys[i] = (float) p.optDouble("y", 0);
                pressure[i] = (float) Math.max(0.05, Math.min(1, p.optDouble("pressure", 0.5)));
                size[i] = (float) Math.max(0.5, Math.min(1.5, p.optDouble("size", 1)));
                delays[i] = Math.max(8, Math.min(5000, p.optLong("delay", 30)));
                total += delays[i];
            }
            if (total > 6000) return false;

            final long[] downAt = new long[1];
            long cumulative = 0;
            for (int i = 0; i < count; i++) {
                final int index = i;
                cumulative += delays[i];
                handler.postDelayed(new Runnable() {
                    @Override public void run() {
                        if (activity.isFinishing()) return;
                        int action = index == 0 ? MotionEvent.ACTION_DOWN
                                : index == count - 1 ? MotionEvent.ACTION_UP : MotionEvent.ACTION_MOVE;
                        long now = SystemClock.uptimeMillis();
                        if (action == MotionEvent.ACTION_DOWN) downAt[0] = now;
                        MotionEvent event = MotionEvent.obtain(
                                downAt[0], now, action, xs[index], ys[index], 0);
                        event.setPressure(0, pressure[index]);
                        event.setSize(0, size[index]);
                        activity.dispatchTouchEvent(event);
                    }
                }, cumulative);
            }
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static MotionEvent event(Activity activity, long down, int action, float x, float y, long at) {
        return MotionEvent.obtain(down, at, action, x, y, 0);
    }
}

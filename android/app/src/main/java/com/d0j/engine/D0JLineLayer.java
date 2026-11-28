package com.d0j.engine;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

import org.json.JSONArray;
import org.json.JSONObject;

/** Full-screen, touch-transparent layer that draws live line specs over the game. */
public final class D0JLineLayer extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private JSONArray specs = new JSONArray();

    public D0JLineLayer(Context context) {
        super(context);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeJoin(Paint.Join.ROUND);
    }

    public void setSpecs(String lines) {
        JSONArray parsed = new JSONArray();
        try {
            JSONObject wrapper = new JSONObject(lines == null ? "{}" : lines);
            parsed = wrapper.optJSONArray("lines");
            if (parsed == null) parsed = new JSONArray();
        } catch (Exception ignored) { }
        specs = parsed;
        invalidate();
    }

    public void clear() {
        specs = new JSONArray();
        invalidate();
    }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        for (int i = 0; i < specs.length(); i++) {
            JSONObject item = specs.optJSONObject(i);
            if (item != null) drawSpec(canvas, item);
        }
    }

    private void drawSpec(Canvas canvas, JSONObject item) {
        String type = item.optString("type", "");
        paint.setStyle("text".equals(type) ? Paint.Style.FILL : Paint.Style.STROKE);
        paint.setColor(color(item.optString("color", "#39FF14")));
        double alpha = Math.max(0, Math.min(1, item.optDouble("alpha", 1)));
        paint.setAlpha((int) (alpha * 255));
        paint.setStrokeWidth((float) item.optDouble("width", 2));
        paint.setShadowLayer(item.optBoolean("glow", false) ? 10f : 0f, 0f, 0f, paint.getColor());

        JSONArray dash = item.optJSONArray("dash");
        if (dash != null && dash.length() > 0) {
            float[] intervals = new float[dash.length()];
            for (int i = 0; i < dash.length(); i++) intervals[i] = (float) dash.optDouble(i, 0);
            paint.setPathEffect(new DashPathEffect(intervals, 0f));
        } else {
            paint.setPathEffect(null);
        }

        if ("path".equals(type)) {
            JSONArray points = item.optJSONArray("points");
            if (points == null || points.length() < 2) return;
            Path path = new Path();
            for (int i = 0; i < points.length(); i++) {
                JSONObject point = points.optJSONObject(i);
                if (point == null) continue;
                float x = (float) point.optDouble("x", 0);
                float y = (float) point.optDouble("y", 0);
                if (i == 0) path.moveTo(x, y);
                else path.lineTo(x, y);
            }
            canvas.drawPath(path, paint);
        } else if ("circle".equals(type)) {
            canvas.drawCircle((float) item.optDouble("x", 0), (float) item.optDouble("y", 0),
                    (float) item.optDouble("radius", 8), paint);
        } else if ("text".equals(type)) {
            paint.setTextSize(26f);
            canvas.drawText(item.optString("text", ""),
                    (float) item.optDouble("x", 0), (float) item.optDouble("y", 0), paint);
        }
    }

    private static int color(String value) {
        try {
            return Color.parseColor(value);
        } catch (Exception ignored) {
            return Color.GREEN;
        }
    }
}

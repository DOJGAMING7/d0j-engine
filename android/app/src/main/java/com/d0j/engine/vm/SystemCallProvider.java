package com.d0j.engine.vm;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.d0j.engine.D0JPrefs;

import org.json.JSONArray;
import org.json.JSONObject;

/** IPC seam used by JS, the host UI and child processes: call("VM", ...). */
public class SystemCallProvider extends ContentProvider {
    public static final String AUTHORITY_SUFFIX = ".vmcall";
    public static final String METHOD = "VM";

    public static Uri uri(Context context) {
        return Uri.parse("content://" + context.getPackageName() + AUTHORITY_SUFFIX);
    }

    @Override public boolean onCreate() {
        VMCore.get(getContext());
        return true;
    }

    @Override public Bundle call(String method, String arg, Bundle extras) {
        Bundle out = new Bundle();
        if (!METHOD.equals(method)) {
            out.putBoolean("ok", false);
            out.putString("code", "UNSUPPORTED_METHOD");
            out.putString("message", "Only the VM method is supported");
            return out;
        }

        Bundle args = extras == null ? new Bundle() : extras;
        String op = args.getString("op", "status");
        if (op == null) op = "status";
        try {
            VMCore core = VMCore.get(getContext());
            if ("status".equals(op)) {
                putJson(out, core.status());
            } else if ("list".equals(op)) {
                JSONObject listing = new JSONObject();
                listing.put("apps", core.list());
                putJson(out, listing);
            } else if ("install".equals(op)) {
                putJson(out, core.install(args.getString("apkPath", "")).toJson());
            } else if ("launch".equals(op)) {
                putJson(out, core.launch(args.getString("packageName", ""), args.getString("activityName", "")));
            } else if ("stop".equals(op)) {
                JSONObject value = new JSONObject();
                value.put("stopped", core.stop(args.getString("packageName", "")));
                putJson(out, value);
            } else if ("activate".equals(op)) {
                activate(out, core, args);
            } else if ("daemon".equals(op)) {
                daemon(out, args.getBoolean("start", true));
            } else if ("hooks".equals(op)) {
                putJson(out, VMHookInstaller.report());
            } else if ("attach".equals(op)) {
                putJson(out, VMHookInstaller.attach(getContext()));
            } else if ("state".equals(op)) {
                handleState(out);
            } else if ("stateProvider".equals(op)) {
                String name = args.getString("name", "demo");
                if ("probe".equals(name)) VMStateHub.useProbe(getContext());
                else VMStateHub.useDemo();
                probe = null;
                VMStateProvider provider = VMStateHub.get();
                JSONObject value = new JSONObject();
                value.put("provider", provider.name());
                value.put("ready", provider.isReady());
                value.put("reason", provider.reason());
                out.putString("json", value.toString());
            } else if ("hostActivity".equals(op)) {
                putJson(out, noteHostActivity(args));
            } else if ("sessionWatch".equals(op)) {
                putJson(out, sessionWatch());
            } else if ("bindings".equals(op)) {
                out.putString("json", new VMBindingStore(getContext()).load().toJson().toString());
            } else if ("saveBindings".equals(op)) {
                VMPointerBinding binding = VMPointerBinding.fromJson(new JSONObject(args.getString("json", "{}")));
                boolean saved = new VMBindingStore(getContext()).save(binding);
                JSONObject value = new JSONObject();
                value.put("saved", saved);
                value.put("usable", binding.isUsable());
                value.put("reason", binding.unusableReason());
                out.putString("json", value.toString());
            } else if ("attachInput".equals(op)) {
                VMRemoteInputInjector next = new VMRemoteInputInjector(getContext(), args.getInt("process", 0));
                boolean ready = next.isReady();
                input = next;
                JSONObject value = new JSONObject();
                value.put("attached", true);
                value.put("ready", ready);
                value.put("reason", next.reason());
                value.put("process", next.process());
                value.put("boundActivity", next.boundActivity());
                value.put("state", ready ? "INPUT_ATTACHED" : "INPUT_PENDING");
                out.putString("json", value.toString());
            } else if ("inputStatus".equals(op)) {
                JSONObject value = new JSONObject();
                value.put("ready", input.isReady());
                value.put("reason", input.reason());
                value.put("process", input instanceof VMRemoteInputInjector
                        ? ((VMRemoteInputInjector) input).process() : -1);
                value.put("state", input.isReady() ? "INPUT_READY" : "INPUT_PENDING");
                out.putString("json", value.toString());
            } else if ("inputTap".equals(op)) {
                boolean done = input.tap(args.getFloat("x", 0), args.getFloat("y", 0));
                JSONObject value = new JSONObject();
                value.put("injected", done);
                value.put("reason", input.reason());
                out.putString("json", value.toString());
            } else if ("inputPath".equals(op)) {
                boolean done = input.path(args.getString("json", "{}"));
                JSONObject value = new JSONObject();
                value.put("injected", done);
                value.put("reason", input.reason());
                out.putString("json", value.toString());
            } else if ("inputSwipe".equals(op)) {
                boolean done = input.swipe(args.getFloat("x1", 0), args.getFloat("y1", 0),
                        args.getFloat("x2", 0), args.getFloat("y2", 0), args.getLong("duration", 180));
                JSONObject value = new JSONObject();
                value.put("injected", done);
                value.put("reason", input.reason());
                out.putString("json", value.toString());
            } else if ("attachReader".equals(op)) {
                VMStateProvider current = VMStateHub.get();
                JSONObject value = new JSONObject();
                if (current instanceof VMProbeStateProvider) {
                    VMRemoteMemoryReader reader =
                            new VMRemoteMemoryReader(getContext(), args.getInt("process", 0));
                    boolean ready = reader.isReady();
                    ((VMProbeStateProvider) current).setReader(reader);
                    probe = null;
                    value.put("attached", true);
                    value.put("ready", ready);
                    value.put("reason", reader.reason());
                    value.put("process", reader.process());
                    value.put("state", ready ? "READER_ATTACHED" : "READER_PENDING");
                } else {
                    value.put("attached", false);
                    value.put("reason", "SWITCH_TO_PROBE_FIRST");
                    value.put("state", "READER_PENDING");
                }
                out.putString("json", value.toString());
            } else if ("probeStatus".equals(op)) {
                VMStateProvider current = VMStateHub.get();
                VMMemoryReader reader = current instanceof VMProbeStateProvider
                        ? ((VMProbeStateProvider) current).reader() : null;
                JSONObject value = new JSONObject();
                value.put("attached", reader != null && reader.isReady());
                value.put("reason", reader == null ? "NO_MEMORY_READER" : reader.reason());
                value.put("provider", current.name());
                value.put("process", reader instanceof VMRemoteMemoryReader
                        ? ((VMRemoteMemoryReader) reader).process() : -1);
                out.putString("json", value.toString());
            } else if ("probeMaps".equals(op)) {
                VMStateProvider current = VMStateHub.get();
                VMMemoryReader reader = current instanceof VMProbeStateProvider
                        ? ((VMProbeStateProvider) current).reader() : null;
                JSONObject value = new JSONObject();
                if (reader instanceof VMRemoteMemoryReader) {
                    value.put("maps", new JSONArray(((VMRemoteMemoryReader) reader).maps()));
                    value.put("state", "MAPS_READY");
                    value.put("process", ((VMRemoteMemoryReader) reader).process());
                } else {
                    value.put("maps", new JSONArray());
                    value.put("state", "NO_MEMORY_READER");
                    value.put("reason", "SWITCH_TO_PROBE_FIRST_AND_ATTACH_READER");
                }
                out.putString("json", value.toString());
            } else if ("probeCapture".equals(op)) {
                int samples = probe().capture(args.getString("label", "before"), args.getLong("base", 0),
                        args.getInt("length", 0), args.getInt("stride", 4));
                JSONObject value = new JSONObject();
                value.put("label", args.getString("label", "before"));
                value.put("samples", samples);
                value.put("state", "CAPTURED");
                out.putString("json", value.toString());
            } else if ("probeDiff".equals(op)) {
                out.putString("json", probe().report(args.getString("before", "before"),
                        args.getString("after", "after"), args.getInt("limit", 32)).toString());
            } else if ("probeClear".equals(op)) {
                probe().clear();
                out.putString("json", new JSONObject().put("state", "PROBE_CLEARED").toString());
            } else {
                throw new VMCore.VMException("UNKNOWN_OP", "Unknown VM operation: " + op);
            }
            out.putBoolean("ok", true);
        } catch (VMCore.VMException e) {
            out.putBoolean("ok", false);
            out.putString("code", e.code);
            out.putString("reason", e.code);
            out.putString("message", String.valueOf(e.getMessage()));
        } catch (Exception e) {
            out.putBoolean("ok", false);
            out.putString("code", "VM_ERROR");
            out.putString("reason", String.valueOf(e.getMessage()));
            out.putString("message", String.valueOf(e.getMessage()));
        }
        return out;
    }

    private void activate(Bundle out, VMCore core, Bundle args) throws Exception {
        String pkg = args.getString("packageName", "");
        int index = args.getInt("processIndex", 0);
        VMInstrumentation instrumentation = VMRuntime.get();
        JSONObject value = new JSONObject();
        value.put("packageName", pkg);
        value.put("registered", core.getApp(pkg) != null);
        value.put("activity", args.getString("activityName", ""));
        value.put("process", ":p" + index);
        value.put("state", instrumentation.isReady() ? "HOOK_ATTACHED" : "STUB_ONLY");
        value.put("reason", instrumentation.isReady() ? "" : instrumentation.missingReason());
        out.putString("json", value.toString());
        out.putString("state", value.getString("state"));
        out.putString("reason", value.getString("reason"));
        out.putBoolean("ready", instrumentation.isReady());
    }

    private void daemon(Bundle out, boolean start) throws Exception {
        Intent intent = new Intent(getContext(), VMDaemonService.class);
        intent.setAction(start ? VMDaemonService.ACTION_START : VMDaemonService.ACTION_STOP);
        if (start && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        JSONObject value = new JSONObject();
        value.put("started", start);
        value.put("state", start ? "DAEMON_STARTING" : "DAEMON_STOPPING");
        putJson(out, value);
    }

    private static void putJson(Bundle out, JSONObject value) {
        out.putString("json", value.toString());
        out.putString("state", value.optString("state", ""));
        out.putString("reason", value.optString("reason", ""));
        out.putBoolean("ready", value.optBoolean("ready", false)
                || value.optBoolean("instrumentationReady", false));
    }

    private static VMInputInjector input = new VMNoopInputInjector();
    private static VMStateProbe probe;

    // Reported from the process that owns the hosted activity. No accessibility,
    // no task-stack scraping from the client process.
    private static final Object HOST_LOCK = new Object();
    private static int hostResumed;
    private static long hostLastAt;
    private static String hostPackage = "";
    private static String hostActivity = "";
    private static String hostEvent = "NONE";

    private JSONObject noteHostActivity(Bundle args) throws Exception {
        String event = args.getString("event", "unknown");
        int resumed = args.getInt("resumed", hostResumed);
        synchronized (HOST_LOCK) {
            hostResumed = Math.max(0, Math.min(16, resumed));
            hostLastAt = System.currentTimeMillis();
            hostPackage = args.getString("packageName", hostPackage);
            hostActivity = args.getString("activityName", hostActivity);
            hostEvent = event;
        }
        JSONObject value = new JSONObject();
        value.put("recorded", true);
        value.put("event", event);
        value.put("resumed", hostResumed);
        value.put("state", hostResumed > 0 ? "GAME_FOREGROUND" : "GAME_BACKGROUND");
        return value;
    }

    private JSONObject sessionWatch() throws Exception {
        Context context = getContext();
        int resumed;
        long lastAt;
        String lastPackage;
        String lastActivity;
        String lastEvent;
        synchronized (HOST_LOCK) {
            resumed = hostResumed;
            lastAt = hostLastAt;
            lastPackage = hostPackage;
            lastActivity = hostActivity;
            lastEvent = hostEvent;
        }

        long now = System.currentTimeMillis();
        long age = lastAt <= 0 ? -1 : now - lastAt;
        boolean usage = hasUsageAccess(context);
        String top = usage ? topForegroundPackage(context) : null;
        String sessionPackage = D0JPrefs.getString(context, D0JPrefs.SESSION_PACKAGE, "");
        boolean ours = context != null && top != null && top.equals(context.getPackageName());
        boolean foreground = resumed > 0 && age >= 0 && age < 15000;
        boolean hostEvidence = lastAt > 0 && age >= 2000
                && ("stop".equals(lastEvent) || "destroy".equals(lastEvent));
        boolean usageEvidence = usage && top != null && !ours
                && !top.equals(sessionPackage) && !"com.miniclip.eightballpool".equals(top);

        String verdict = "UNKNOWN";
        String evidence = "NONE";
        if (foreground) {
            verdict = "GAME_ALIVE";
            evidence = "ACTIVITY";
        } else if (hostEvidence) {
            verdict = "GAME_EXITED";
            evidence = "ACTIVITY";
        } else if (usageEvidence) {
            verdict = "GAME_EXITED";
            evidence = "USAGE";
        }

        JSONObject value = new JSONObject();
        value.put("sessionActive", D0JPrefs.getBoolean(context, D0JPrefs.SESSION_ACTIVE, false));
        value.put("sessionPackage", sessionPackage);
        value.put("gameForeground", foreground);
        value.put("resumed", resumed);
        value.put("lastEvent", lastEvent);
        value.put("lastPackage", lastPackage);
        value.put("lastActivity", lastActivity);
        value.put("ageMs", Math.max(0, age));
        value.put("usageAccess", usage);
        value.put("topPackage", top == null ? JSONObject.NULL : top);
        value.put("evidence", evidence);
        value.put("verdict", verdict);
        value.put("state", verdict);
        return value;
    }

    private static boolean hasUsageAccess(Context context) {
        try {
            AppOpsManager ops = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
            if (ops == null) return false;
            int mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                    android.os.Process.myUid(), context.getPackageName());
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private static String topForegroundPackage(Context context) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return null;
            UsageStatsManager usm = (UsageStatsManager) context.getSystemService(Context.USAGE_STATS_SERVICE);
            if (usm == null) return null;
            long end = System.currentTimeMillis();
            UsageEvents events = usm.queryEvents(end - 15000, end);
            UsageEvents.Event event = new UsageEvents.Event();
            String last = null;
            while (events != null && events.hasNextEvent()) {
                events.getNextEvent(event);
                if (event.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                    last = event.getPackageName();
                }
            }
            return last;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private void handleState(Bundle out) throws Exception {
        VMStateProvider provider = VMStateHub.get();
        VMStateSnapshot snapshot = provider.read();
        JSONObject value = snapshot.toJson();
        value.put("provider", provider.name());
        value.put("providerReady", provider.isReady());
        value.put("providerReason", provider.reason());
        out.putString("json", value.toString());
        out.putString("state", snapshot.isComplete() ? "STATE_COMPLETE" : "STATE_INCOMPLETE");
        out.putString("reason", provider.reason());
        out.putBoolean("ready", snapshot.isComplete());
    }

    private VMStateProbe probe() throws VMCore.VMException {
        if (probe == null) {
            VMStateProvider provider = VMStateHub.get();
            VMMemoryReader reader = provider instanceof VMProbeStateProvider
                    ? ((VMProbeStateProvider) provider).reader() : null;
            if (reader == null) {
                throw new VMCore.VMException("NO_MEMORY_READER",
                        "Attach a VMMemoryReader before probing");
            }
            probe = new VMStateProbe(reader);
        }
        return probe;
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection,
                                  String[] selectionArgs, String sortOrder) { return null; }

    @Override public String getType(Uri uri) { return null; }

    @Override public Uri insert(Uri uri, ContentValues values) { return null; }

    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }

    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
}

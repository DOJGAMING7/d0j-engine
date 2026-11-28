package com.d0j.engine.vm;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.TextView;

import com.d0j.engine.D0JGameHud;

import java.lang.ref.WeakReference;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Host entry point. It never pretends to be the game: it prepares the installed
 * APK's classloader, attempts a real Activity substitution inside this process,
 * and falls back to an honest status panel with in-window controls.
 */
public class VMProxyActivity extends Activity {
    private static final List<WeakReference<VMProxyActivity>> LIVE =
            new CopyOnWriteArrayList<WeakReference<VMProxyActivity>>();

    protected int processIndex() { return 0; }

    /** Called on hosting failure so the user never returns to a stale panel. */
    public static void finishAll() {
        for (WeakReference<VMProxyActivity> ref : LIVE) {
            VMProxyActivity activity = ref.get();
            if (activity != null) activity.finish();
        }
        LIVE.clear();
    }

    @Override protected void onResume() {
        super.onResume();
        LIVE.add(new WeakReference<VMProxyActivity>(this));
        VMActivityInputInjector.bind(this);
    }

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        VMLifecycleMonitor.install(this, processIndex());
        if (VMHosting.isDisabled(this)) {
            TextView view = new TextView(this);
            view.setText("In-window hosting unavailable\nOpening game externally");
            view.setTextColor(Color.parseColor("#9A9AA2"));
            view.setBackgroundColor(Color.parseColor("#0B0E0F"));
            view.setPadding(32, 48, 32, 48);
            view.setTextSize(15f);
            setContentView(view);
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override public void run() { finish(); }
            }, 800);
            return;
        }
        Intent incoming = getIntent();
        String pkg = incoming == null ? null : incoming.getStringExtra("vmPackage");
        String act = incoming == null ? null : incoming.getStringExtra("vmActivity");
        if (pkg == null) pkg = "";
        if (act == null) act = "";
        D0JGameHud.attach(this, pkg);

        boolean substitute = incoming != null && incoming.getBooleanExtra("vmSubstitute", false);
        String detail = "D0J VM host · :p" + processIndex() + "\n" + pkg;
        if (!substitute && !pkg.isEmpty() && !act.isEmpty()) {
            try {
                // The hook must be installed in this process too: the game
                // Activity is created here, not in the client's main process.
                VMHookInstaller.attach(this);
                boolean prepared = VMCore.get(this).prepare(pkg);
                Intent real = new Intent()
                        .setComponent(new ComponentName(getPackageName(), VMHookInstaller.proxyActivity(processIndex())))
                        .putExtra("vmPackage", pkg)
                        .putExtra("vmActivity", act)
                        .putExtra("processIndex", processIndex())
                        .putExtra("vmSubstitute", true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(real);
                detail = prepared
                        ? "Hosting " + pkg + "\nAttempting real game Activity inside this window"
                        : "Host registry unavailable for " + pkg + "\nNo game Activity was substituted";
            } catch (Throwable e) {
                detail = "Host substitution unavailable: " + String.valueOf(e.getMessage());
            }
        }

        TextView view = new TextView(this);
        view.setText(detail);
        view.setTextColor(Color.parseColor("#9A9AA2"));
        view.setBackgroundColor(Color.parseColor("#0B0E0F"));
        view.setPadding(32, 48, 32, 48);
        view.setTextSize(15f);
        setContentView(view);
    }

    @Override protected void onDestroy() {
        for (WeakReference<VMProxyActivity> ref : LIVE) {
            if (ref.get() == this) { LIVE.remove(ref); break; }
        }
        D0JGameHud.detach(this);
        super.onDestroy();
    }
}

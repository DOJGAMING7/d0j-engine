package com.d0j.engine.vm;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.widget.TextView;

import com.d0j.engine.D0JGameHud;

/**
 * Host entry point. It never pretends to be the game: it prepares the installed
 * APK's classloader, attempts a real Activity substitution inside this process,
 * and falls back to an honest status panel with in-window controls.
 */
public class VMProxyActivity extends Activity {
    protected int processIndex() { return 0; }

    @Override protected void onResume() {
        super.onResume();
        VMActivityInputInjector.bind(this);
    }

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        VMLifecycleMonitor.install(this, processIndex());
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
        D0JGameHud.detach(this);
        super.onDestroy();
    }
}

package com.d0j.engine.vm;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.widget.TextView;

/**
 * Stub activity that would host a cloned game activity. It reports the real
 * host state instead of pretending a game is running.
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

        Bundle args = new Bundle();
        args.putString("packageName", pkg);
        args.putString("activityName", act);
        args.putInt("processIndex", processIndex());

        String detail = "D0J VM proxy · :p" + processIndex() + "\n" + pkg;
        try {
            Bundle response = getContentResolver().call(SystemCallProvider.uri(this), "VM", "activate", args);
            if (response != null) {
                String state = response.getString("state", "");
                String reason = response.getString("reason", "");
                detail += "\n" + state + (reason.isEmpty() ? "" : "\n" + reason);
            }
        } catch (Exception e) {
            detail += "\nProvider unavailable: " + String.valueOf(e.getMessage());
        }
        if (!act.isEmpty()) detail += "\nactivity=" + act;

        TextView view = new TextView(this);
        view.setText(detail);
        view.setTextColor(Color.parseColor("#39FF14"));
        view.setBackgroundColor(Color.parseColor("#0B0E0F"));
        view.setPadding(32, 48, 32, 48);
        view.setTextSize(15f);
        setContentView(view);
    }
}

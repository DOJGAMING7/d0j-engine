package com.d0j.engine;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(D0JNativePlugin.class);
        try {
            WebView.setWebContentsDebuggingEnabled(false);
        } catch (Exception ignored) {}
        consumeOpenMenuIntent();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        consumeOpenMenuIntent();
    }

    private void consumeOpenMenuIntent() {
        Intent intent = getIntent();
        if (intent == null || !intent.getBooleanExtra("openMenu", false)) return;
        intent.removeExtra("openMenu");
        try {
            if (getBridge() != null) {
                getBridge().eval("if (window.__d0jOpenModMenu) window.__d0jOpenModMenu();", null);
            }
        } catch (Exception ignored) {}
    }
}

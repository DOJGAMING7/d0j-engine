package com.d0j.engine;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Capacitor builds the Bridge inside super.onCreate(). Plugins must be
        // added to the Builder before that call or JS sees "not implemented".
        registerPlugin(D0JNativePlugin.class);
        super.onCreate(savedInstanceState);
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
    public void onResume() {
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

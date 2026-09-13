package com.flow.organizer.mobile;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

/** Receives Android's share sheet and forwards HTTP links to the web application. */
public class MainActivity extends BridgeActivity {
    private String sharedText;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        android.webkit.WebView.setWebContentsDebuggingEnabled(true);
        readShareIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        readShareIntent(intent);
        deliverSharedText();
    }

    @Override
    public void onResume() {
        super.onResume();
        deliverSharedText();
    }

    private void readShareIntent(Intent intent) {
        if (Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && (text.startsWith("http://") || text.startsWith("https://"))) sharedText = text;
        }
    }

    private void deliverSharedText() {
        if (sharedText == null || getBridge() == null || getBridge().getWebView() == null) return;
        String text = sharedText;
        sharedText = null;
        getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new CustomEvent('flow-shared-url',{detail:" + JSONObject.quote(text) + "}))", null);
    }
}

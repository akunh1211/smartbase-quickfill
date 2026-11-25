package il.smartbase.quickfill;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {

    private static final String START_URL = "https://smartbase.digital.idf.il/#/home/requests";
    private static final String OTA_SCRIPT_URL = "https://akunh1211.github.io/smartbase-quickfill/smartbase-quickfill.user.js";
    private static final String PREFS_NAME = "sb_quickfill_prefs";
    private static final String OTA_FILE_NAME = "quickfill_latest.js";

    private WebView webView;

    public class AndroidStorageBridge {
        private final Context context;
        private final SharedPreferences prefs;

        AndroidStorageBridge(Context ctx) {
            this.context = ctx;
            this.prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        }

        @JavascriptInterface
        public String get(String key) {
            return prefs.getString(key, "");
        }

        @JavascriptInterface
        public void set(String key, String value) {
            prefs.edit().putString(key, value).apply();
        }

        @JavascriptInterface
        public void copyText(String text) {
            ClipboardManager cm = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) {
                cm.setPrimaryClip(ClipData.newPlainText("SmartBase", text));
            }
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window win = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            win.setStatusBarColor(0xFF4F46E5);
        }

        FrameLayout root = new FrameLayout(this);
        root.setFitsSystemWindows(true);
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        root.addView(webView);
        setContentView(root);

        configureWebView();
        startOtaScriptSync();
        webView.loadUrl(START_URL);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        // Remove "; wv" token so SmartBase renders identically to Chrome Android
        String ua = settings.getUserAgentString();
        if (ua != null) {
            settings.setUserAgentString(ua.replace("; wv", ""));
        }

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new AndroidStorageBridge(this), "AndroidStorage");
        webView.setWebChromeClient(new WebChromeClient());

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
                String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";

                if (("http".equals(scheme) || "https".equals(scheme)) && host.endsWith("idf.il")) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectIfSmartBase(url);
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                super.doUpdateVisitedHistory(view, url, isReload);
                injectIfSmartBase(url);
            }
        });
    }

    private void injectIfSmartBase(String url) {
        if (url == null) return;
        String lower = url.toLowerCase();
        if (!lower.contains("smartbase.digital.idf.il") && !lower.contains("smartbase")) {
            return;
        }
        String script = loadBestScript();
        if (script != null && !script.isEmpty()) {
            webView.evaluateJavascript(script, null);
        }
    }

    private String loadBestScript() {
        File otaFile = new File(getFilesDir(), OTA_FILE_NAME);
        if (otaFile.exists() && otaFile.length() > 1000) {
            try (InputStream is = new FileInputStream(otaFile)) {
                return readAllUtf8(is);
            } catch (Exception ignored) {
            }
        }
        try (InputStream is = getAssets().open("quickfill.js")) {
            return readAllUtf8(is);
        } catch (Exception ignored) {
            return "";
        }
    }

    private String readAllUtf8(InputStream is) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        char[] buf = new char[4096];
        int n;
        while ((n = reader.read(buf)) != -1) {
            sb.append(buf, 0, n);
        }
        return sb.toString();
    }

    private void startOtaScriptSync() {
        Thread t = new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(OTA_SCRIPT_URL + "?t=" + System.currentTimeMillis());
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                conn.setRequestMethod("GET");
                if (conn.getResponseCode() == 200) {
                    String content = readAllUtf8(conn.getInputStream());
                    if (content.contains("__SMARTBASE_QUICKFILL_LOADED__")) {
                        File tmp = new File(getFilesDir(), OTA_FILE_NAME + ".tmp");
                        try (FileOutputStream fos = new FileOutputStream(tmp)) {
                            fos.write(content.getBytes(StandardCharsets.UTF_8));
                        }
                        File dest = new File(getFilesDir(), OTA_FILE_NAME);
                        // Atomic swap when supported on same dir
                        if (!tmp.renameTo(dest)) {
                            try (FileOutputStream fos = new FileOutputStream(dest)) {
                                fos.write(content.getBytes(StandardCharsets.UTF_8));
                            }
                            tmp.delete();
                        }
                    }
                }
            } catch (Exception ignored) {
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
        t.setDaemon(true);
        t.start();
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}

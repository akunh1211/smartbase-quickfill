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
import android.os.Message;
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
    private static final String OTA_SCRIPT_URL = "https://raw.githubusercontent.com/akunh1211/smartbase-quickfill/main/smartbase-quickfill.user.js";
    private static final String PREFS_NAME = "sb_quickfill_prefs";
    private static final String OTA_FILE_NAME = "quickfill_latest.js";

    private FrameLayout root;
    private WebView webView;
    private WebView popupWebView;

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

        root = new FrameLayout(this);
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
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        // Remove "; wv" token so SmartBase & OAuth login treat WebView identically to Chrome Android
        String ua = settings.getUserAgentString();
        if (ua != null) {
            settings.setUserAgentString(ua.replace("; wv", ""));
        }

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new AndroidStorageBridge(this), "AndroidStorage");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                // Real in-app popup WebView so OAuth/SSO popups keep window.opener and cookies intact
                if (popupWebView != null) {
                    root.removeView(popupWebView);
                    popupWebView.destroy();
                }
                popupWebView = new WebView(MainActivity.this);
                popupWebView.setLayoutParams(new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                ));
                WebSettings ps = popupWebView.getSettings();
                ps.setJavaScriptEnabled(true);
                ps.setDomStorageEnabled(true);
                ps.setJavaScriptCanOpenWindowsAutomatically(true);
                ps.setUserAgentString(settings.getUserAgentString());
                CookieManager.getInstance().setAcceptThirdPartyCookies(popupWebView, true);

                popupWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                        Uri u = req.getUrl();
                        String s = u.getScheme() != null ? u.getScheme().toLowerCase() : "";
                        return !("http".equals(s) || "https".equals(s));
                    }
                });
                popupWebView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView window) {
                        closePopupWebView();
                    }
                });

                root.addView(popupWebView);
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popupWebView);
                resultMsg.sendToTarget();
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
                String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";

                // Keep ALL http/https pages (including IDF SSO / Azure / B2C / gov.il login redirects) inside WebView!
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    if ("wa.me".equals(host) || host.endsWith("whatsapp.com")) {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, uri));
                            return true;
                        } catch (Exception ignored) {
                        }
                    }
                    return false;
                }
                // Non-http schemes (tel:, mailto:, whatsapp:, intent:, etc.)
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

    private int[] parseScriptVersion(String content) {
        if (content == null) return new int[]{0, 0, 0};
        String marker = "const SCRIPT_VERSION = '";
        int idx = content.indexOf(marker);
        if (idx == -1) return new int[]{0, 0, 0};
        int start = idx + marker.length();
        int end = content.indexOf("'", start);
        if (end == -1 || end - start > 20) return new int[]{0, 0, 0};
        String[] parts = content.substring(start, end).split("\\.");
        int[] ver = new int[]{0, 0, 0};
        for (int i = 0; i < Math.min(3, parts.length); i++) {
            try {
                ver[i] = Integer.parseInt(parts[i].replaceAll("[^0-9]", ""));
            } catch (Exception ignored) {
            }
        }
        return ver;
    }

    private int compareVersions(int[] a, int[] b) {
        for (int i = 0; i < 3; i++) {
            if (a[i] != b[i]) return Integer.compare(a[i], b[i]);
        }
        return 0;
    }

    private String loadAssetScript() {
        try (InputStream is = getAssets().open("quickfill.js")) {
            return readAllUtf8(is);
        } catch (Exception ignored) {
            return "";
        }
    }

    private String loadBestScript() {
        String assetScript = loadAssetScript();
        int[] assetVer = parseScriptVersion(assetScript);

        File otaFile = new File(getFilesDir(), OTA_FILE_NAME);
        if (otaFile.exists() && otaFile.length() > 1000) {
            try (InputStream is = new FileInputStream(otaFile)) {
                String otaScript = readAllUtf8(is);
                int[] otaVer = parseScriptVersion(otaScript);
                if (compareVersions(otaVer, assetVer) >= 0) {
                    return otaScript;
                } else {
                    // Bundled APK script is newer than cached OTA file — purge stale cache!
                    otaFile.delete();
                }
            } catch (Exception ignored) {
            }
        }
        return assetScript;
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
                conn.setUseCaches(false);
                conn.setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate");
                conn.setRequestProperty("Pragma", "no-cache");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                conn.setRequestMethod("GET");
                if (conn.getResponseCode() == 200) {
                    String content = readAllUtf8(conn.getInputStream());
                    int[] remoteVer = parseScriptVersion(content);
                    int[] currentVer = parseScriptVersion(loadBestScript());
                    if (content.contains("__SMARTBASE_QUICKFILL_LOADED__") && compareVersions(remoteVer, currentVer) >= 0) {
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
                        // Immediately hot-upgrade the running page on the UI thread!
                        runOnUiThread(() -> {
                            if (webView != null) {
                                injectIfSmartBase(webView.getUrl());
                            }
                        });
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

    private void closePopupWebView() {
        if (popupWebView != null) {
            root.removeView(popupWebView);
            popupWebView.destroy();
            popupWebView = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (popupWebView != null) {
            if (popupWebView.canGoBack()) {
                popupWebView.goBack();
            } else {
                closePopupWebView();
            }
        } else if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}

package app.xiangzi.schedule.special;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.webkit.*;
import android.widget.FrameLayout;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

public final class MainActivity extends Activity {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int EXPORT = 201, IMPORT = 202;
    WebView web;
    private final ExecutorService tasks = Executors.newSingleThreadExecutor();
    private String documentRequest;
    private String exportText;
    private boolean loaded;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ReminderReceiver.channel(this);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(245, 243, 238));
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets edges = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(edges.left, edges.top, edges.right, edges.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(245, 243, 238));
        web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.addJavascriptInterface(new Bridge(), "XiangziNative");
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确定", (dialog, which) -> result.confirm())
                    .setNegativeButton("取消", (dialog, which) -> result.cancel()).setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
            @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确定", (dialog, which) -> result.confirm()).setOnCancelListener(dialog -> result.confirm()).show();
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !trusted(request.getUrl()); }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!trusted(uri)) return response(403, "Forbidden");
                String name = uri.getPath().substring(1);
                if (!name.matches("[a-zA-Z0-9_-]+\\.(html|js|css)")) return response(404, "Not found");
                try {
                    String mime = name.endsWith(".js") ? "application/javascript" : name.endsWith(".css") ? "text/css" : "text/html";
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK", Collections.singletonMap("Cache-Control", "no-store"), getAssets().open(name));
                } catch (IOException error) { return response(404, "Not found"); }
            }
            @Override public void onPageFinished(WebView view, String url) { loaded = true; }
        });
        web.loadUrl(ORIGIN + "/index.html");
        tasks.execute(() -> { try { ReminderReceiver.schedule(this); } catch (Exception ignored) {} });
    }
    static boolean trusted(Uri uri) { return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost()) && uri.getPort() == -1 && uri.getUserInfo() == null; }
    private static WebResourceResponse response(int code, String message) { return new WebResourceResponse("text/plain", "UTF-8", code, message, Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }
    @Override public void onResume() {
        super.onResume();
        if (web != null && loaded) web.evaluateJavascript("window.XiangziResume && window.XiangziResume()", null);
        tasks.execute(() -> { try { ReminderReceiver.schedule(this); } catch (Exception ignored) {} });
    }
    // API 33+ is handled by the platform callback above. Keep the legacy entry
    // point for Android 8–12 only.
    @SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { handleBack(); }
    private void handleBack() {
        web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){d.close();return true;}return false;})()", result -> { if (!"true".equals(result)) finish(); });
    }
    @Override public void onDestroy() {
        if (web != null) { web.removeJavascriptInterface("XiangziNative"); web.destroy(); }
        tasks.shutdown(); super.onDestroy();
    }
    private void reply(String id, Object value, String error) {
        try {
            JSONObject result = new JSONObject().put("ok", error == null);
            if (error == null) result.put("value", value == null ? JSONObject.NULL : value); else result.put("error", error);
            String script = "window.XiangziNativeResult(" + JSONObject.quote(id) + "," + result + ")";
            runOnUiThread(() -> { if (web != null && !isFinishing() && !isDestroyed()) web.evaluateJavascript(script, null); });
        } catch (JSONException ignored) {}
    }
    private final class Bridge {
        @JavascriptInterface public void postMessage(String message) {
            if (message == null || message.length() > 26 * 1024 * 1024) return;
            try {
                JSONObject request = new JSONObject(message);
                String id = request.getString("id");
                if (!id.matches("[a-zA-Z0-9-]{1,80}")) return;
                String action = request.getString("action");
                JSONObject args = request.optJSONObject("args");
                tasks.execute(() -> {
                    try {
                        switch (action) {
                            case "load": reply(id, SecureStore.load(MainActivity.this), null); break;
                            case "save":
                                SecureStore.save(MainActivity.this, args.getJSONObject("bundle"));
                                // Save succeeds even if notification permissions are unavailable.
                                try { ReminderReceiver.schedule(MainActivity.this); } catch (Exception ignored) {}
                                reply(id, true, null); break;
                            case "request": reply(id, request(args), null); break;
                            case "clipboard":
                                runOnUiThread(() -> { ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("巷子日程配对码", args.optString("text"))); reply(id, true, null); }); break;
                            case "reminderStatus": reply(id, reminderStatus(), null); break;
                            case "permissions": runOnUiThread(() -> { permissions(); reply(id, true, null); }); break;
                            case "export": case "import": runOnUiThread(() -> document(id, action, args)); break;
                            default: reply(id, null, "不支持此操作");
                        }
                    } catch (Exception error) { reply(id, null, action.equals("load") ? "日程文件无法读取，原文件已保留" : action.equals("request") ? "暂时无法连接同步服务，修改已保存在手机" : "操作失败，本机数据已保留，请重试"); }
                });
            } catch (Exception ignored) {}
        }
    }
    private JSONObject request(JSONObject args) throws Exception {
        URL url = new URL(args.getString("url"));
        if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null || url.getQuery() != null || url.getRef() != null || !url.getPath().matches("/v1/vaults/[a-f0-9-]{36}")) throw new IOException("Invalid endpoint");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        try {
            String method = args.getString("method");
            if (!Arrays.asList("GET", "POST", "PUT").contains(method)) throw new IOException("Invalid method");
            connection.setConnectTimeout(15000); connection.setReadTimeout(20000); connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod(method);
            JSONObject headers = args.getJSONObject("headers");
            for (String name : Arrays.asList("Authorization", "Content-Type", "X-Setup-Token")) if (headers.has(name)) connection.setRequestProperty(name, headers.getString(name));
            if (!method.equals("GET")) {
                byte[] bytes = args.optString("body").getBytes(StandardCharsets.UTF_8);
                if (bytes.length > 1500000) throw new IOException("Too large");
                connection.setDoOutput(true); connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = connection.getOutputStream()) { out.write(bytes); }
            }
            int status = connection.getResponseCode();
            InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            return new JSONObject().put("status", status).put("body", input == null ? "{}" : readText(input, 1500000));
        } finally { connection.disconnect(); }
    }
    static String readText(InputStream input, int limit) throws IOException {
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = stream.read(buffer)) != -1) { if (output.size() + count > limit) throw new IOException("Too large"); output.write(buffer, 0, count); }
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }
    private JSONObject reminderStatus() throws JSONException {
        boolean notifications = ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).areNotificationsEnabled();
        boolean exact = Build.VERSION.SDK_INT < 31 || ((AlarmManager) getSystemService(ALARM_SERVICE)).canScheduleExactAlarms();
        return new JSONObject().put("notifications", notifications).put("exact", exact);
    }
    private void permissions() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) { requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 301); return; }
        if (Build.VERSION.SDK_INT >= 31 && !((AlarmManager) getSystemService(ALARM_SERVICE)).canScheduleExactAlarms()) {
            try { startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName()))); return; } catch (ActivityNotFoundException ignored) {}
        }
        startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
    }
    private void document(String id, String action, JSONObject args) {
        if (documentRequest != null) { reply(id, null, "请先完成当前文件操作"); return; }
        documentRequest = id;
        try {
            if (action.equals("export")) {
                exportText = args.optString("text");
                startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, "巷子日程-特殊版-备份.json"), EXPORT);
            } else startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE), IMPORT);
        } catch (Exception error) { documentRequest = null; exportText = null; reply(id, null, "手机未提供可用的文件选择器"); }
    }
    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code != EXPORT && code != IMPORT) return;
        final String id = documentRequest, text = exportText; documentRequest = null; exportText = null;
        if (id == null) return;
        if (result != RESULT_OK || data == null || data.getData() == null) { reply(id, null, null); return; }
        Uri uri = data.getData();
        tasks.execute(() -> {
            try {
                if (code == EXPORT) { try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) { if (out == null) throw new IOException(); out.write(text.getBytes(StandardCharsets.UTF_8)); } reply(id, true, null); }
                else { InputStream input = getContentResolver().openInputStream(uri); if (input == null) throw new IOException(); reply(id, readText(input, 20 * 1024 * 1024), null); }
            } catch (Exception error) { reply(id, null, "文件操作未完成，请确认文件可读取且不超过 20 MB"); }
        });
    }
}

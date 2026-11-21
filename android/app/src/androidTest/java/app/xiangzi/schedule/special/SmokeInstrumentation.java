package app.xiangzi.schedule.special;

import android.app.*;
import android.content.Intent;
import android.os.Bundle;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.json.*;

// Real WebView + native Keystore/AtomicFile bridge, with isolated emulator data.
public final class SmokeInstrumentation extends Instrumentation {
    private MainActivity activity;
    private int checks;
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    private void check(boolean pass, String message) { if (!pass) throw new AssertionError(message); checks++; }
    private String js(String script) throws Exception {
        CompletableFuture<String> result = new CompletableFuture<>();
        runOnMainSync(() -> activity.web.evaluateJavascript(script, result::complete));
        return result.get(10, TimeUnit.SECONDS);
    }
    private Object async(String expression) throws Exception {
        js("window.__nativeTest=null;Promise.resolve(" + expression + ").then(v=>window.__nativeTest=JSON.stringify({ok:true,value:v}),e=>window.__nativeTest=JSON.stringify({ok:false,error:String(e)}));true");
        for (int i = 0; i < 200; i++) {
            String value = js("window.__nativeTest");
            if (!"null".equals(value)) {
                String decoded = (String) new JSONTokener(value).nextValue();
                JSONObject result = new JSONObject(decoded);
                check(result.optBoolean("ok"), result.optString("error"));
                return result.opt("value");
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Native bridge response timed out");
    }
    private void launch() throws Exception {
        activity = (MainActivity) startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        boolean ready = false;
        for (int i = 0; i < 200; i++) {
            if ("true".equals(js("!!window.xiangzi && document.querySelectorAll('.calendar-day').length===42"))) { ready = true; break; }
            Thread.sleep(100);
        }
        check(ready, "Offline app starts in the real Android WebView");
    }
    @Override public void onStart() {
        Bundle results = new Bundle();
        try {
            launch();
            JSONObject snapshot = (JSONObject) async("window.xiangzi.getState()");
            check("special".equals(snapshot.getString("edition")), "Special edition");
            check(snapshot.getJSONArray("themeChoices").join(",").contains("教学"), "Fixed themes");
            check("true".equals(js("document.documentElement.scrollWidth<=innerWidth+1")), "No horizontal overflow on phone");
            async("window.xiangzi.setTheme('2030-01-21','教学')");
            snapshot = (JSONObject) async("window.xiangzi.addItem('2030-01-21',{title:'手机备课',startTime:'09:00',endTime:'10:00',note:'虚构测试内容',reminderMinutes:5})");
            String id = snapshot.getJSONObject("state").getJSONObject("days").getJSONObject("2030-01-21").getJSONArray("items").getJSONObject(0).getString("id");
            snapshot = (JSONObject) async("window.xiangzi.toggleItem('2030-01-21'," + JSONObject.quote(id) + ")");
            check(snapshot.getJSONObject("state").getJSONObject("days").getJSONObject("2030-01-21").getJSONArray("items").getJSONObject(0).getBoolean("done"), "Completion saved");
            async("window.xiangzi.addItem('2030-01-22',{title:'例会',startTime:'11:00',endTime:'12:00'},{frequency:'weekly',until:'2030-02-05'})");
            check(SecureStore.load(getTargetContext()).getJSONObject("state").getJSONObject("days").has("2030-02-05"), "Repeated schedules persisted");
            byte[] encrypted = new java.io.FileInputStream(new java.io.File(getTargetContext().getFilesDir(), "schedule.enc")).readAllBytes();
            check(!new String(encrypted, StandardCharsets.UTF_8).contains("手机备课"), "Native storage encrypted");
            JSONObject permissions = (JSONObject) async("window.xiangzi.reminderStatus()");
            check(permissions.has("notifications") && permissions.has("exact"), "Reminder permission status available");
            try (java.io.InputStream input = new android.os.ParcelFileDescriptor.AutoCloseInputStream(getUiAutomation().executeShellCommand("pm grant " + getTargetContext().getPackageName() + " android.permission.POST_NOTIFICATIONS"))) { byte[] buffer = new byte[1024]; while (input.read(buffer) != -1) {} }
            java.time.LocalDateTime start = java.time.LocalDateTime.now().plusMinutes(2).withSecond(0).withNano(0);
            String reminderDate = start.toLocalDate().toString();
            String time = start.toLocalTime().toString();
            String end = start.plusMinutes(1).toLocalTime().toString();
            if (end.compareTo(time) > 0) {
                snapshot = (JSONObject) async("window.xiangzi.addItem(" + JSONObject.quote(reminderDate) + ",{id:'native-reminder-smoke',title:'原生通知验收',startTime:" + JSONObject.quote(time) + ",endTime:" + JSONObject.quote(end) + ",reminderMinutes:5})");
                check(!getTargetContext().getSharedPreferences("reminder-index", 0).getStringSet("scheduled", java.util.Collections.emptySet()).isEmpty(), "Native scheduler registers reminder");
                // Deliver the alarm broadcast explicitly: inexact permission-denied
                // alarms may be delayed by Android, which is not a product failure.
                getTargetContext().sendBroadcast(new Intent(getTargetContext(), ReminderReceiver.class).setAction("app.xiangzi.schedule.special.REMIND").putExtra("key", "native-reminder-smoke|" + reminderDate + "|" + time + "|5"));
                NotificationManager manager = (NotificationManager) getTargetContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
                boolean delivered = false;
                for (int i = 0; i < 100; i++) { if (manager.getActiveNotifications().length > 0) { delivered = true; break; } Thread.sleep(100); }
                check(delivered, "Native alarm receiver displays a system notification");
            }
            check("true".equals(js("selectDate('2030-01-21');document.getElementById('add-item-button').click();document.getElementById('item-dialog').open")), "Phone edit dialog opens");
            check("true".equals(js("(()=>{const d=document.getElementById('item-dialog').getBoundingClientRect();return d.left>=0&&d.right<=innerWidth;})()")), "Editor fits phone width");
            js("document.getElementById('item-dialog').close();true");
            runOnMainSync(() -> activity.finish());
            waitForIdleSync(); launch();
            snapshot = (JSONObject) async("window.xiangzi.getState()");
            check(snapshot.getJSONObject("state").getJSONObject("days").getJSONObject("2030-01-21").getJSONArray("items").getJSONObject(0).getBoolean("done"), "State survives full Activity recreation");
            js("selectDate('2030-01-21');true");
            results.putString("stream", "\nXiangzi Android: " + checks + " native/WebView smoke checks passed.\n");
            results.putBoolean("passed", true); finish(Activity.RESULT_OK, results);
        } catch (Throwable error) {
            results.putString("stream", "\nFAILED: " + error.toString() + "\n" + android.util.Log.getStackTraceString(error));
            results.putBoolean("passed", false); finish(Activity.RESULT_CANCELED, results);
        }
    }
}

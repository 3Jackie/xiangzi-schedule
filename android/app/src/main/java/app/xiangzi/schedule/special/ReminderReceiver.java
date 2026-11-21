package app.xiangzi.schedule.special;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
import java.time.*;
import java.util.*;
import org.json.*;

public final class ReminderReceiver extends BroadcastReceiver {
    private static final String ACTION = "app.xiangzi.schedule.special.REMIND";
    private static final String CHANNEL = "xiangzi-reminders";
    static void channel(Context context) {
        NotificationChannel channel = new NotificationChannel(CHANNEL, "日程提醒", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("你在巷子日程中设置的本地日程提醒");
        ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(channel);
    }
    private static String key(String date, JSONObject item) { return item.optString("id") + "|" + date + "|" + item.optString("startTime") + "|" + item.optInt("reminderMinutes"); }
    private static PendingIntent pending(Context context, String key) {
        Intent intent = new Intent(context, ReminderReceiver.class).setAction(ACTION).setData(android.net.Uri.parse("xiangzi-reminder:" + android.net.Uri.encode(key))).putExtra("key", key);
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static synchronized void schedule(Context context) throws Exception {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences preferences = context.getSharedPreferences("reminder-index", Context.MODE_PRIVATE);
        for (String value : preferences.getStringSet("scheduled", Collections.emptySet())) alarms.cancel(pending(context, value));
        JSONObject bundle = SecureStore.load(context);
        if (bundle == null) return;
        JSONObject days = bundle.getJSONObject("state").getJSONObject("days");
        long now = System.currentTimeMillis();
        Set<String> delivered = new HashSet<>(preferences.getStringSet("delivered", Collections.emptySet()));
        Set<String> existing = new HashSet<>();
        List<Map.Entry<String, Long>> upcoming = new ArrayList<>();
        Iterator<String> dates = days.keys();
        while (dates.hasNext()) {
            String date = dates.next(); JSONArray items = days.getJSONObject(date).getJSONArray("items");
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i);
                if (item.isNull("reminderMinutes") || item.optBoolean("done")) continue;
                String key = key(date, item); existing.add(key);
                if (delivered.contains(key)) continue;
                long start = LocalDateTime.parse(date + "T" + item.getString("startTime")).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
                long due = start - item.getInt("reminderMinutes") * 60000L;
                if (start + 15 * 60000L < now) continue;
                upcoming.add(new AbstractMap.SimpleEntry<>(key, Math.max(now + 1000, due)));
            }
        }
        delivered.retainAll(existing);
        upcoming.sort(Map.Entry.comparingByValue());
        Set<String> scheduled = new HashSet<>();
        for (int i = 0; i < Math.min(upcoming.size(), 400); i++) {
            Map.Entry<String, Long> entry = upcoming.get(i);
            PendingIntent operation = pending(context, entry.getKey());
            boolean exact = Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms();
            if (exact) {
                try { alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, entry.getValue(), operation); }
                catch (SecurityException error) { alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, entry.getValue(), operation); }
            } else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, entry.getValue(), operation);
            scheduled.add(entry.getKey());
        }
        preferences.edit().putStringSet("scheduled", scheduled).putStringSet("delivered", delivered).apply();
    }
    @Override public void onReceive(Context context, Intent intent) {
        PendingResult result = goAsync();
        new Thread(() -> {
            try {
                channel(context);
                if (ACTION.equals(intent.getAction())) deliver(context, intent.getStringExtra("key"));
                schedule(context);
            } catch (Exception ignored) { /* No schedule data is ever written to system logs. */ }
            finally { result.finish(); }
        }, "xiangzi-reminder").start();
    }
    private static void deliver(Context context, String expected) throws Exception {
        if (expected == null) return;
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        JSONObject bundle = SecureStore.load(context);
        if (bundle == null) return;
        SharedPreferences preferences = context.getSharedPreferences("reminder-index", Context.MODE_PRIVATE);
        Set<String> delivered = new HashSet<>(preferences.getStringSet("delivered", Collections.emptySet()));
        if (delivered.contains(expected)) return;
        JSONObject days = bundle.getJSONObject("state").getJSONObject("days");
        Iterator<String> dates = days.keys();
        while (dates.hasNext()) {
            String date = dates.next(); JSONArray items = days.getJSONObject(date).getJSONArray("items");
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i);
                if (item.optBoolean("done") || item.isNull("reminderMinutes") || !expected.equals(key(date, item))) continue;
                long start = LocalDateTime.parse(date + "T" + item.getString("startTime")).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
                if (System.currentTimeMillis() > start + 15 * 60000L) return;
                PendingIntent content = PendingIntent.getActivity(context, 0, new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Notification notification = new Notification.Builder(context, CHANNEL).setSmallIcon(R.drawable.ic_notification).setContentTitle(item.getString("title"))
                    .setContentText(date + "  " + item.getString("startTime") + "–" + item.getString("endTime")).setContentIntent(content).setAutoCancel(true)
                    .setVisibility(Notification.VISIBILITY_PRIVATE).build();
                ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).notify(expected.hashCode(), notification);
                delivered.add(expected); preferences.edit().putStringSet("delivered", delivered).commit();
                return;
            }
        }
    }
}

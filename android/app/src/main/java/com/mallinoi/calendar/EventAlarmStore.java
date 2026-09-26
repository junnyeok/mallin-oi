package com.mallinoi.calendar;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import org.json.JSONObject;
import org.json.JSONArray;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

final class EventAlarmStore {
    static final String FIRE = "com.mallinoi.calendar.EVENT_ALARM";
    static final String DISMISS = "com.mallinoi.calendar.EVENT_ALARM_DISMISS";
    static final String CHANNEL = "event-alarms-v1";

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("event-alarms", Context.MODE_PRIVATE);
    }

    static JSONObject read(Context context, String id) {
        if (id == null) return null;
        try { return new JSONObject(preferences(context).getString(id, "")); }
        catch (Exception ignored) { return null; }
    }

    static AlarmManager manager(Context context) {
        return (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    }

    static boolean allowed(Context context) {
        return Build.VERSION.SDK_INT < 31 || manager(context).canScheduleExactAlarms();
    }

    static PendingIntent operation(Context context, String id, String action) {
        Intent intent = new Intent(context, EventAlarmReceiver.class)
                .setAction(action).setData(Uri.parse("mallinoi://event-alarm/" + id))
                .putExtra("alarmId", id);
        return PendingIntent.getBroadcast(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void arm(Context context, String id, long fireAt) {
        Intent show = new Intent(context, MainActivity.class).putExtra("calendarType", "event");
        PendingIntent showIntent = PendingIntent.getActivity(context, 9027, show,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        manager(context).setAlarmClock(new AlarmManager.AlarmClockInfo(fireAt, showIntent),
                operation(context, id, FIRE));
    }

    static void cancel(Context context, String id) {
        PendingIntent operation = operation(context, id, FIRE);
        manager(context).cancel(operation);
        operation.cancel();
        ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(id, 0);
        preferences(context).edit().remove(id).apply();
    }

    static boolean isRinging(Context context, String id) {
        NotificationManager notifications = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        for (android.service.notification.StatusBarNotification item : notifications.getActiveNotifications()) {
            if (id.equals(item.getTag())) return true;
        }
        return false;
    }

    static SharedPreferences groups(Context context) {
        return context.getSharedPreferences("event-alarm-groups", Context.MODE_PRIVATE);
    }

    static JSONObject readGroup(Context context, String id) {
        try { return new JSONObject(groups(context).getString(id, "")); }
        catch (Exception ignored) { return null; }
    }

    static synchronized void replaceGroup(Context context, String id, String previousID,
            JSONArray alarms, JSONArray selection) throws Exception {
        List<String> staged = new ArrayList<>();
        List<String> previous = new ArrayList<>();
        for (String groupID : new java.util.HashSet<>(java.util.Arrays.asList(id, previousID))) {
            JSONObject group = readGroup(context, groupID);
            JSONArray ids = group == null ? null : group.optJSONArray("ids");
            if (ids != null) for (int i = 0; i < ids.length(); i++) previous.add(ids.getString(i));
            if (read(context, groupID) != null) previous.add(groupID); // pre-v2 single alarm
        }
        try {
            for (int i = 0; i < alarms.length(); i++) {
                JSONObject alarm = alarms.getJSONObject(i);
                long fireAt = alarm.getLong("fireAt");
                if (fireAt <= System.currentTimeMillis()) throw new IllegalArgumentException("Elapsed alarm");
                String childID = UUID.randomUUID().toString();
                staged.add(childID);
                if (!preferences(context).edit().putString(childID, alarm.toString()).commit()) throw new java.io.IOException();
                arm(context, childID, fireAt);
            }
            JSONObject group = new JSONObject().put("selection", selection).put("ids", new JSONArray(staged));
            SharedPreferences.Editor edit = groups(context).edit().putString(id, group.toString());
            if (!id.equals(previousID)) edit.remove(previousID);
            if (!edit.commit()) throw new java.io.IOException();
        } catch (Exception error) {
            for (String childID : staged) cancel(context, childID);
            throw error;
        }
        for (String oldID : previous) cancel(context, oldID);
    }

    static void restore(Context context) {
        if (!allowed(context)) return;
        for (String id : preferences(context).getAll().keySet()) {
            JSONObject record = read(context, id);
            if (record == null) continue;
            long fireAt = record.optLong("fireAt");
            if (fireAt <= System.currentTimeMillis()) continue;
            try { arm(context, id, fireAt); }
            catch (SecurityException ignored) { return; }
        }
    }
}

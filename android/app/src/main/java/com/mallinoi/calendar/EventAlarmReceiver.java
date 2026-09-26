package com.mallinoi.calendar;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import org.json.JSONObject;

public class EventAlarmReceiver extends BroadcastReceiver {
    static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(EventAlarmStore.CHANNEL,
                "이벤트 일정 알람", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("직접 설정한 이벤트 일정 알람");
        channel.enableVibration(true);
        channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(channel);
    }

    @Override public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String id = intent.getStringExtra("alarmId");
        if (EventAlarmStore.DISMISS.equals(action)) {
            if (id != null) EventAlarmStore.cancel(context, id);
            return;
        }
        if (!EventAlarmStore.FIRE.equals(action)) {
            EventAlarmStore.restore(context);
            return;
        }
        JSONObject record = EventAlarmStore.read(context, id);
        if (record == null) return; // A cancelled/replaced alarm must not ring.
        long fireAt = record.optLong("fireAt");
        long now = System.currentTimeMillis();
        if (fireAt > now + 1000) return;
        // Avoid surprising stale alerts after a device has been unavailable for hours.
        if (now - fireAt > 10 * 60_000L) {
            EventAlarmStore.cancel(context, id);
            return;
        }
        createChannel(context);
        Notification notification = new NotificationCompat.Builder(context, EventAlarmStore.CHANNEL)
                .setSmallIcon(R.drawable.ic_event_alarm)
                .setContentTitle(record.optString("title", "이벤트 일정"))
                .setContentText(record.optString("message", "설정한 일정 알람이에요. 누르면 알람이 꺼집니다."))
                .setStyle(new NotificationCompat.BigTextStyle().bigText(record.optString("message", "설정한 일정 알람이에요.")))
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), android.media.AudioManager.STREAM_ALARM)
                .setVibrate(new long[] {0, 500, 500, 500})
                .setAutoCancel(true)
                .setContentIntent(EventAlarmStore.operation(context, id, EventAlarmStore.DISMISS))
                .setDeleteIntent(EventAlarmStore.operation(context, id, EventAlarmStore.DISMISS))
                .addAction(0, "알람 끄기", EventAlarmStore.operation(context, id, EventAlarmStore.DISMISS))
                .build();
        // The system owns playback; it stops when the alarm notification is dismissed.
        notification.flags |= Notification.FLAG_INSISTENT;
        try {
            ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).notify(id, 0, notification);
        } catch (SecurityException ignored) {
            // Revoked notification permission must not crash a background receiver.
        }
    }
}

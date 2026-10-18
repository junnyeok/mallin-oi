package com.mallinoi.calendar;

import static org.junit.Assert.*;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.UUID;
import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs on a disposable emulator with notifications/exact alarms allowed for this app. */
@RunWith(AndroidJUnit4.class)
public class EventAlarmInstrumentedTest {
    @Test public void twoAlarmGroupReplacesTogetherAndRollsBackStagedFailure() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String key = UUID.randomUUID().toString();
        long later = System.currentTimeMillis() + 3600000;
        JSONArray selection = new JSONArray().put(5).put(10);
        JSONArray pair = new JSONArray()
                .put(new JSONObject().put("title", "가족식사참치회").put("message", "‘가족식사참치회’ 일정이 5분 남았어요!").put("fireAt", later).put("minutes", 5))
                .put(new JSONObject().put("title", "가족식사참치회").put("message", "‘가족식사참치회’ 일정이 10분 남았어요!").put("fireAt", later - 300000).put("minutes", 10));
        try {
            EventAlarmStore.replaceGroup(context, key, key, pair, selection);
            JSONObject saved = EventAlarmStore.readGroup(context, key);
            JSONArray ids = saved.getJSONArray("ids");
            assertEquals(2, ids.length());
            assertEquals(selection.toString(), saved.getJSONArray("selection").toString());
            assertEquals("‘가족식사참치회’ 일정이 5분 남았어요!", EventAlarmStore.read(context, ids.getString(0)).getString("message"));
            JSONArray badPair = new JSONArray(pair.toString());
            badPair.getJSONObject(1).put("fireAt", 1);
            try { EventAlarmStore.replaceGroup(context, key, key, badPair, selection); fail("Elapsed second alarm must fail"); }
            catch (IllegalArgumentException expected) { /* first staged alarm is rolled back */ }
            assertEquals(ids.toString(), EventAlarmStore.readGroup(context, key).getJSONArray("ids").toString());
            for (int i = 0; i < ids.length(); i++) assertNotNull(EventAlarmStore.read(context, ids.getString(i)));
            EventAlarmStore.replaceGroup(context, key, key, new JSONArray(), new JSONArray());
            for (int i = 0; i < ids.length(); i++) assertNull(EventAlarmStore.read(context, ids.getString(i)));
        } finally {
            EventAlarmStore.replaceGroup(context, key, key, new JSONArray(), new JSONArray());
            EventAlarmStore.groups(context).edit().remove(key).apply();
        }
    }

    private void awaitRinging(Context context, String id, boolean expected) {
        long deadline = android.os.SystemClock.elapsedRealtime() + 10000;
        while (EventAlarmStore.isRinging(context, id) != expected
                && android.os.SystemClock.elapsedRealtime() < deadline) android.os.SystemClock.sleep(25);
        assertEquals(expected, EventAlarmStore.isRinging(context, id));
    }
    @Test public void datedAlarmReplacementDeliveryAndCancellation() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String id = UUID.randomUUID().toString();
        NotificationManager notifications = context.getSystemService(NotificationManager.class);
        assertTrue("Allow exact alarms on the test emulator", EventAlarmStore.allowed(context));
        assertTrue("Allow notifications on the test emulator", notifications.areNotificationsEnabled());
        try {
            long tomorrow = System.currentTimeMillis() + 86_400_000L;
            EventAlarmStore.preferences(context).edit().putString(id,
                    new JSONObject().put("title", "로컬 알람 검증").put("fireAt", tomorrow).toString()).commit();
            EventAlarmStore.arm(context, id, tomorrow);
            assertEquals(tomorrow, EventAlarmStore.manager(context).getNextAlarmClock().getTriggerTime());
            // Replacing uses the same PendingIntent; an old delivery cannot ring the new future alarm.
            long later = tomorrow + 60_000;
            EventAlarmStore.preferences(context).edit().putString(id,
                    new JSONObject().put("title", "가족식사참치회").put("fireAt", later).toString()).commit();
            EventAlarmStore.arm(context, id, later);
            assertEquals(later, EventAlarmStore.manager(context).getNextAlarmClock().getTriggerTime());
            EventAlarmReceiver receiver = new EventAlarmReceiver();
            Intent delivery = new Intent(EventAlarmStore.FIRE).putExtra("alarmId", id);
            receiver.onReceive(context, delivery);
            assertFalse(EventAlarmStore.isRinging(context, id));
            // Let AlarmManager deliver to the manifest receiver, then stop it immediately.
            long near = System.currentTimeMillis() + 1500;
            EventAlarmStore.preferences(context).edit().putString(id,
                    new JSONObject().put("title", "가족식사참치회").put("fireAt", near).toString()).commit();
            EventAlarmStore.arm(context, id, near);
            awaitRinging(context, id, true);
            for (android.service.notification.StatusBarNotification item : notifications.getActiveNotifications()) {
                if (!id.equals(item.getTag())) continue;
                assertEquals("가족식사참치회", item.getNotification().extras.getString(Notification.EXTRA_TITLE));
                assertTrue((item.getNotification().flags & Notification.FLAG_INSISTENT) != 0);
            }
            receiver.onReceive(context, new Intent(EventAlarmStore.DISMISS).putExtra("alarmId", id));
            awaitRinging(context, id, false);
            assertNull(EventAlarmStore.read(context, id));
            receiver.onReceive(context, delivery);
            assertFalse(EventAlarmStore.isRinging(context, id));
        } finally {
            EventAlarmStore.cancel(context, id);
        }
    }
}

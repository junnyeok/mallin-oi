package com.mallinoi.calendar;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "EventAlarms", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public class EventAlarmsPlugin extends Plugin {
    private final Set<Integer> offsets = new HashSet<>(Arrays.asList(0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080));
    private String alarmID(String key) {
        if (key == null || !key.startsWith("event:") || key.length() > 256) return null;
        return UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)).toString();
    }

    private boolean notificationsAllowed() {
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = getContext().getSystemService(NotificationManager.class).getNotificationChannel(EventAlarmStore.CHANNEL);
            if (channel != null && (channel.getImportance() < NotificationManager.IMPORTANCE_DEFAULT || channel.getSound() == null)) return false;
        }
        return true;
    }

    @PluginMethod public void getPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", notificationsAllowed() && EventAlarmStore.allowed(getContext()));
        call.resolve(result);
    }

    @PluginMethod public void requestPermission(PluginCall call) {
        EventAlarmReceiver.createChannel(getContext());
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "permissionResult");
        } else getPermission(call);
    }
    @PermissionCallback private void permissionResult(PluginCall call) { getPermission(call); }

    @PluginMethod public void openSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            Intent intent;
            if (notificationsAllowed() && !EventAlarmStore.allowed(getContext()) && Build.VERSION.SDK_INT >= 31) {
                intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:" + getContext().getPackageName()));
            } else if (Build.VERSION.SDK_INT >= 26) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getContext().getPackageName()));
            }
            try { getActivity().startActivity(intent); call.resolve(); }
            catch (Exception error) { call.reject("휴대폰 설정에서 말린오이 캘린더의 알람과 알림을 허용해 주세요."); }
        });
    }

    @PluginMethod public void getSettings(PluginCall call) {
        String id = alarmID(call.getString("key"));
        if (id == null) { call.reject("일정 정보를 확인할 수 없어요."); return; }
        JSObject result = new JSObject();
        result.put("platform", "android");
        JSONObject group = EventAlarmStore.readGroup(getContext(), id);
        if (group != null) result.put("selection", group.optJSONArray("selection"));
        else {
            JSONObject legacy = EventAlarmStore.read(getContext(), id);
            if (legacy != null) result.put("legacyAlarm", legacy);
        }
        call.resolve(result);
    }

    @PluginMethod public void replace(PluginCall call) {
        String id = alarmID(call.getString("key"));
        String previousID = alarmID(call.getString("previousKey", call.getString("key")));
        JSArray selection = call.getArray("selection");
        JSArray alarms = call.getArray("alarms");
        if (id == null || previousID == null || selection == null || alarms == null
                || selection.length() > 2 || alarms.length() > selection.length()) {
            call.reject("알람은 최대 두 개까지 지정할 수 있어요."); return;
        }
        try {
            Set<Integer> unique = new HashSet<>();
            for (int i = 0; i < selection.length(); i++) {
                int offset = selection.getInt(i);
                if (!offsets.contains(offset) || !unique.add(offset)) throw new IllegalArgumentException();
            }
            Set<Integer> scheduledOffsets = new HashSet<>();
            for (int i = 0; i < alarms.length(); i++) {
                JSONObject alarm = alarms.getJSONObject(i);
                String title = alarm.getString("title"), message = alarm.getString("message");
                double fire = alarm.getDouble("fireAt");
                int minutes = alarm.getInt("minutes");
                if (title.trim().isEmpty() || title.length() > 200 || message.isEmpty() || message.length() > 300
                        || !Double.isFinite(fire) || fire <= System.currentTimeMillis() || fire >= 253402300800000L
                        || !unique.contains(minutes) || !scheduledOffsets.add(minutes)) throw new IllegalArgumentException();
            }
        } catch (Exception error) { call.reject("알람 시각이 지났거나 일정 정보가 올바르지 않아요. 다시 저장해 주세요."); return; }
        if (alarms.length() > 0 && (!notificationsAllowed() || !EventAlarmStore.allowed(getContext()))) {
            call.reject("알람 설정을 눌러 휴대폰에서 알람과 알림을 허용해 주세요."); return;
        }
        try {
            EventAlarmReceiver.createChannel(getContext());
            EventAlarmStore.replaceGroup(getContext(), id, previousID, alarms, selection);
            JSObject result = new JSObject(); result.put("scheduled", true); result.put("count", alarms.length());
            call.resolve(result);
        } catch (Exception error) { call.reject("알람을 반영하지 못했어요. 권한을 확인하고 저장을 다시 눌러 주세요."); }
    }
}

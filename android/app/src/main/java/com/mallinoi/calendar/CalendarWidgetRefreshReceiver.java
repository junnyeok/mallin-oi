package com.mallinoi.calendar;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

import java.util.Calendar;

public class CalendarWidgetRefreshReceiver extends BroadcastReceiver {
    static final String ACTION_MIDNIGHT_REFRESH =
            "com.mallinoi.calendar.action.WIDGET_MIDNIGHT_REFRESH";
    private static final int REQUEST_CODE = 2401;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? "" : intent.getAction();
        boolean shouldRefresh = ACTION_MIDNIGHT_REFRESH.equals(action)
                || Intent.ACTION_DATE_CHANGED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_BOOT_COMPLETED.equals(action);
        if (!shouldRefresh) return;

        CalendarWidgetsPlugin.refreshAllWidgets(context);
        scheduleNextMidnight(context);
    }

    static void scheduleNextMidnight(Context context) {
        if (!hasActiveWidgets(context)) {
            cancelAlarm(context);
            return;
        }

        Calendar nextRefresh = Calendar.getInstance();
        nextRefresh.add(Calendar.DAY_OF_YEAR, 1);
        nextRefresh.set(Calendar.HOUR_OF_DAY, 0);
        nextRefresh.set(Calendar.MINUTE, 1);
        nextRefresh.set(Calendar.SECOND, 0);
        nextRefresh.set(Calendar.MILLISECOND, 0);

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            alarmManager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    nextRefresh.getTimeInMillis(),
                    buildPendingIntent(context)
            );
        }
    }

    static void cancelIfNoWidgets(Context context) {
        if (!hasActiveWidgets(context)) {
            cancelAlarm(context);
        }
    }

    private static void cancelAlarm(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            alarmManager.cancel(buildPendingIntent(context));
        }
    }

    private static PendingIntent buildPendingIntent(Context context) {
        Intent intent = new Intent(context, CalendarWidgetRefreshReceiver.class);
        intent.setAction(ACTION_MIDNIGHT_REFRESH);
        return PendingIntent.getBroadcast(
                context,
                REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static boolean hasActiveWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (Class<?> provider : CalendarWidgetsPlugin.WIDGET_PROVIDERS) {
            ComponentName name = new ComponentName(context, provider);
            if (manager.getAppWidgetIds(name).length > 0) {
                return true;
            }
        }
        return false;
    }
}

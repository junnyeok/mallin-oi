package com.mallinoi.calendar;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CalendarWidgets")
public class CalendarWidgetsPlugin extends Plugin {
    static final String PREFS_NAME = "mallinoi_calendar_widgets";
    static final String KEY_LOGGED_IN = "is_logged_in";
    static final String KEY_PAYLOAD = "payload_json";
    static final String KEY_PENDING_TYPE = "pending_calendar_type";
    static final Class<?>[] WIDGET_PROVIDERS = new Class<?>[] {
            StudyFourDayWidgetProvider.class,
            StudyTwoWeekWidgetProvider.class,
            StudyMonthWidgetProvider.class,
            WorkFourDayWidgetProvider.class,
            WorkTwoWeekWidgetProvider.class,
            WorkMonthWidgetProvider.class,
            EventFourDayWidgetProvider.class,
            EventTwoWeekWidgetProvider.class,
            EventMonthWidgetProvider.class
    };

    @PluginMethod
    public void saveWidgetData(PluginCall call) {
        boolean isLoggedIn = call.getBoolean("isLoggedIn", false);
        JSObject payload = call.getObject("payload", new JSObject());

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putBoolean(KEY_LOGGED_IN, isLoggedIn)
                .putString(KEY_PAYLOAD, payload.toString())
                .apply();

        refreshAllWidgets(getContext());
        CalendarWidgetRefreshReceiver.scheduleNextMidnight(getContext());
        call.resolve();
    }

    @PluginMethod
    public void consumePendingRoute(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String calendarType = prefs.getString(KEY_PENDING_TYPE, "");
        prefs.edit().remove(KEY_PENDING_TYPE).apply();

        JSObject result = new JSObject();
        result.put("calendarType", calendarType);
        call.resolve(result);
    }

    static void setPendingCalendarType(Context context, String calendarType) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_PENDING_TYPE, calendarType)
                .apply();
    }

    static void refreshAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (Class<?> provider : WIDGET_PROVIDERS) {
            ComponentName name = new ComponentName(context, provider);
            int[] ids = manager.getAppWidgetIds(name);
            if (ids.length > 0) {
                Intent intent = new Intent(context, provider);
                intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
                intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
                context.sendBroadcast(intent);
            }
        }
    }
}

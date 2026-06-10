package com.mallinoi.calendar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

public class CalendarWidgetProvider extends AppWidgetProvider {
    final String calendarType;
    final String range;
    final String label;
    final int layoutId;
    final int maxDays;

    CalendarWidgetProvider(String calendarType, String range, String label, int layoutId, int maxDays) {
        this.calendarType = calendarType;
        this.range = range;
        this.label = label;
        this.layoutId = layoutId;
        this.maxDays = maxDays;
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            appWidgetManager.updateAppWidget(appWidgetId, buildViews(context));
        }
    }

    RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layoutId);
        SharedPreferences prefs = context.getSharedPreferences(CalendarWidgetsPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        boolean isLoggedIn = prefs.getBoolean(CalendarWidgetsPlugin.KEY_LOGGED_IN, false);
        String payloadJson = prefs.getString(CalendarWidgetsPlugin.KEY_PAYLOAD, "{}");

        views.setTextViewText(R.id.widgetTitle, label);
        views.setTextViewText(R.id.widgetSubtitle, getRangeLabel());
        views.setOnClickPendingIntent(R.id.widgetRoot, buildOpenIntent(context));

        if (!isLoggedIn) {
            setEmptyState(views, "로그인이 필요해요");
            return views;
        }

        try {
            JSONObject payload = new JSONObject(payloadJson);
            JSONObject widgets = payload.optJSONObject("widgets");
            JSONObject typeWidget = widgets == null ? null : widgets.optJSONObject(calendarType);
            JSONObject widget = typeWidget == null ? null : typeWidget.optJSONObject(range);
            JSONArray days = widget == null ? null : widget.optJSONArray("days");

            if (days == null || days.length() == 0) {
                setEmptyState(views, "표시할 일정이 없어요");
                return views;
            }

            if ("month".equals(range)) {
                JSONObject month = widget.optJSONObject("month");
                int monthNumber = month == null ? Calendar.getInstance().get(Calendar.MONTH) + 1 : month.optInt("month", Calendar.getInstance().get(Calendar.MONTH) + 1);
                views.setTextViewText(R.id.widgetSubtitle, monthNumber + "월");
            }

            bindDays(views, days);
        } catch (Exception error) {
            setEmptyState(views, "위젯을 열어 새로고침해줘요");
        }

        return views;
    }

    PendingIntent buildOpenIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.putExtra("calendarType", calendarType);
        intent.setData(android.net.Uri.parse("mallinoi://calendar?type=" + calendarType));

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        return PendingIntent.getActivity(context, calendarType.hashCode() ^ range.hashCode(), intent, flags);
    }

    void setEmptyState(RemoteViews views, String message) {
        int[] ids = getDayIds();
        for (int id : ids) {
            views.setViewVisibility(id, View.GONE);
        }
        views.setTextViewText(R.id.widgetEmpty, message);
        views.setViewVisibility(R.id.widgetEmpty, View.VISIBLE);
    }

    void bindDays(RemoteViews views, JSONArray days) {
        int[] ids = getDayIds();
        SimpleDateFormat input = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        SimpleDateFormat monthDay = new SimpleDateFormat("M/d E", Locale.KOREAN);

        views.setViewVisibility(R.id.widgetEmpty, View.GONE);

        for (int index = 0; index < ids.length; index += 1) {
            int id = ids[index];

            if (index >= maxDays || index >= days.length()) {
                views.setViewVisibility(id, View.GONE);
                continue;
            }

            JSONObject day = days.optJSONObject(index);
            if (day == null) {
                views.setViewVisibility(id, View.GONE);
                continue;
            }

            String date = day.optString("date", "");
            java.util.Date localDate = parseDate(input, date);
            JSONArray items = day.optJSONArray("items");
            JSONObject firstItem = items != null && items.length() > 0 ? items.optJSONObject(0) : null;
            String title = firstItem == null ? "" : firstItem.optString("title", "");
            String category = firstItem == null ? "" : firstItem.optString("categoryName", "");
            String color = firstItem == null ? "" : firstItem.optString("categoryColor", "");
            boolean isToday = day.optBoolean("isToday", false);
            boolean isCurrentMonth = day.optBoolean("isCurrentMonth", true);
            int moreCount = items == null ? 0 : Math.max(items.length() - 1, 0);

            String text = monthDay.format(localDate);
            if (!title.isEmpty()) {
                text += "\n" + truncate(category.isEmpty() ? title : category + " " + title, "month".equals(range) ? 9 : 14);
            }
            if (moreCount > 0) {
                text += "\n+" + moreCount;
            }

            views.setTextViewText(id, text);
            views.setTextColor(id, isCurrentMonth ? Color.WHITE : Color.rgb(120, 120, 126));
            if (!color.isEmpty() && firstItem != null) {
                views.setTextColor(id, parseColor(color, Color.WHITE));
            }
            views.setInt(id, "setBackgroundResource", isToday ? R.drawable.widget_today_background : R.drawable.widget_day_background);
            views.setViewVisibility(id, View.VISIBLE);
        }
    }

    String truncate(String value, int length) {
        if (value == null) return "";
        if (value.length() <= length) return value;
        return value.substring(0, Math.max(length - 1, 1)) + "…";
    }

    java.util.Date parseDate(SimpleDateFormat formatter, String value) {
        try {
            return formatter.parse(value);
        } catch (Exception error) {
            return new java.util.Date();
        }
    }

    int parseColor(String value, int fallback) {
        try {
            return Color.parseColor(value);
        } catch (Exception error) {
            return fallback;
        }
    }

    String getRangeLabel() {
        if ("fourDays".equals(range)) return "오늘 포함 4일";
        if ("twoWeeks".equals(range)) return "오늘 포함 2주";
        return "한 달";
    }

    int[] getDayIds() {
        return new int[] {
                R.id.widgetDay01, R.id.widgetDay02, R.id.widgetDay03, R.id.widgetDay04,
                R.id.widgetDay05, R.id.widgetDay06, R.id.widgetDay07, R.id.widgetDay08,
                R.id.widgetDay09, R.id.widgetDay10, R.id.widgetDay11, R.id.widgetDay12,
                R.id.widgetDay13, R.id.widgetDay14, R.id.widgetDay15, R.id.widgetDay16,
                R.id.widgetDay17, R.id.widgetDay18, R.id.widgetDay19, R.id.widgetDay20,
                R.id.widgetDay21, R.id.widgetDay22, R.id.widgetDay23, R.id.widgetDay24,
                R.id.widgetDay25, R.id.widgetDay26, R.id.widgetDay27, R.id.widgetDay28,
                R.id.widgetDay29, R.id.widgetDay30, R.id.widgetDay31, R.id.widgetDay32,
                R.id.widgetDay33, R.id.widgetDay34, R.id.widgetDay35, R.id.widgetDay36,
                R.id.widgetDay37, R.id.widgetDay38, R.id.widgetDay39, R.id.widgetDay40,
                R.id.widgetDay41, R.id.widgetDay42
        };
    }
}

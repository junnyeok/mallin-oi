package com.mallinoi.calendar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.BackgroundColorSpan;
import android.text.style.ForegroundColorSpan;
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
        WidgetTheme theme = getTheme();

        views.setTextViewText(R.id.widgetTitle, label);
        views.setTextColor(R.id.widgetTitle, theme.text);
        views.setTextViewText(R.id.widgetSubtitle, getRangeLabel());
        views.setTextColor(R.id.widgetSubtitle, theme.mutedText);
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

            bindDays(views, days, theme);
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

    void bindDays(RemoteViews views, JSONArray days, WidgetTheme theme) {
        int[] ids = getDayIds();
        SimpleDateFormat input = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        SimpleDateFormat monthDay = "month".equals(range)
                ? new SimpleDateFormat("d", Locale.KOREAN)
                : new SimpleDateFormat("d", Locale.KOREAN);

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
            boolean isToday = day.optBoolean("isToday", false);
            boolean isCurrentMonth = day.optBoolean("isCurrentMonth", true);
            boolean shouldShowItems = !"month".equals(range) || isCurrentMonth;
            int itemCount = !shouldShowItems || items == null ? 0 : items.length();
            int visibleCount = Math.min(itemCount, getMaxVisibleItems());
            int moreCount = Math.max(itemCount - visibleCount, 0);

            SpannableStringBuilder text = new SpannableStringBuilder();
            int dateStart = text.length();
            text.append(monthDay.format(localDate));
            text.setSpan(
                    new ForegroundColorSpan(isToday ? Color.WHITE : isCurrentMonth ? theme.text : theme.mutedText),
                    dateStart,
                    text.length(),
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
            );

            for (int itemIndex = 0; itemIndex < visibleCount; itemIndex += 1) {
                JSONObject item = items.optJSONObject(itemIndex);
                if (item == null) continue;

                String title = getDisplayTitle(item);
                if (title.isEmpty()) continue;

                text.append("\n");
                int itemStart = text.length();
                text.append(truncate(title, getTitleLimit()));
                int itemEnd = text.length();
                int badgeColor = parseColor(item.optString("displayColor", item.optString("categoryColor", "")), theme.secondary);
                text.setSpan(new BackgroundColorSpan(badgeColor), itemStart, itemEnd, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                text.setSpan(new ForegroundColorSpan(theme.text), itemStart, itemEnd, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            }

            if (moreCount > 0) {
                text.append("\n");
                int moreStart = text.length();
                text.append("+").append(String.valueOf(moreCount));
                text.setSpan(new ForegroundColorSpan(isToday ? Color.WHITE : theme.mutedText), moreStart, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            }

            views.setTextViewText(id, text);
            views.setTextColor(id, isToday ? Color.WHITE : isCurrentMonth ? theme.text : theme.mutedText);
            views.setInt(id, "setBackgroundResource", isToday ? theme.todayBackground : R.drawable.widget_day_background);
            views.setViewVisibility(id, View.VISIBLE);
        }
    }

    String getDisplayTitle(JSONObject item) {
        String displayTitle = item.optString("displayTitle", "");
        if (!displayTitle.isEmpty()) return displayTitle;

        String title = item.optString("title", "");
        String category = item.optString("categoryName", "");

        if ("work".equals(calendarType)) {
            return category.isEmpty() ? title : category;
        }

        return title.isEmpty() ? category : title;
    }

    int getMaxVisibleItems() {
        return 2;
    }

    int getTitleLimit() {
        if ("fourDays".equals(range)) return 8;
        if ("twoWeeks".equals(range)) return 7;
        return 6;
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

    WidgetTheme getTheme() {
        if ("work".equals(calendarType)) {
            return new WidgetTheme(
                    Color.rgb(52, 52, 206),
                    Color.rgb(245, 245, 70),
                    Color.rgb(17, 17, 17),
                    Color.rgb(102, 102, 102),
                    R.drawable.widget_today_work_background
            );
        }

        if ("event".equals(calendarType)) {
            return new WidgetTheme(
                    Color.rgb(250, 133, 154),
                    Color.rgb(255, 192, 203),
                    Color.rgb(17, 17, 17),
                    Color.rgb(102, 102, 102),
                    R.drawable.widget_today_event_background
            );
        }

        return new WidgetTheme(
                Color.rgb(60, 60, 60),
                Color.rgb(187, 187, 187),
                Color.rgb(17, 17, 17),
                Color.rgb(102, 102, 102),
                R.drawable.widget_today_study_background
        );
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

    static class WidgetTheme {
        final int primary;
        final int secondary;
        final int text;
        final int mutedText;
        final int todayBackground;

        WidgetTheme(int primary, int secondary, int text, int mutedText, int todayBackground) {
            this.primary = primary;
            this.secondary = secondary;
            this.text = text;
            this.mutedText = mutedText;
            this.todayBackground = todayBackground;
        }
    }
}

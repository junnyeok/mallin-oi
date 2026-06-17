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
import android.text.style.AbsoluteSizeSpan;
import android.text.style.BackgroundColorSpan;
import android.text.style.ForegroundColorSpan;
import android.util.TypedValue;
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
        configureLayout(context, views);

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

            bindDays(context, views, days, theme);
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
        views.setViewVisibility(R.id.widgetGrid, View.GONE);
        views.setViewVisibility(R.id.widgetWeekdayRow, View.GONE);
        views.setTextViewText(R.id.widgetEmpty, message);
        views.setViewVisibility(R.id.widgetEmpty, View.VISIBLE);
    }

    void configureLayout(Context context, RemoteViews views) {
        int horizontalPadding = "month".equals(range) ? 8 : 10;
        int verticalPadding = "month".equals(range) ? 11 : 9;
        views.setViewPadding(
                R.id.widgetRoot,
                dp(context, horizontalPadding),
                dp(context, verticalPadding),
                dp(context, horizontalPadding),
                dp(context, verticalPadding)
        );

        int headerInset = "month".equals(range) ? 5 : 6;
        views.setViewPadding(R.id.widgetHeader, dp(context, headerInset), 0, dp(context, headerInset), 0);

        views.setViewVisibility(R.id.widgetWeekdayRow, "month".equals(range) ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widgetGrid, View.VISIBLE);
        views.setViewPadding(R.id.widgetGrid, 0, dp(context, getGridTopPadding()), 0, dp(context, 1));

        setVisibleRows(views, getVisibleRowCount());
    }

    void setVisibleRows(RemoteViews views, int visibleRows) {
        int[] rowIds = getRowIds();
        for (int index = 0; index < rowIds.length; index += 1) {
            views.setViewVisibility(rowIds[index], index < visibleRows ? View.VISIBLE : View.GONE);
        }
    }

    void bindDays(Context context, RemoteViews views, JSONArray days, WidgetTheme theme) {
        int[] ids = getDayIds();
        SimpleDateFormat input = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        SimpleDateFormat monthDay = "month".equals(range)
                ? new SimpleDateFormat("d", Locale.KOREAN)
                : new SimpleDateFormat("d", Locale.KOREAN);
        SimpleDateFormat weekdayFormat = new SimpleDateFormat("E", Locale.KOREAN);
        int monthRows = "month".equals(range) ? getMonthRowCount(days.length()) : 0;

        views.setViewVisibility(R.id.widgetEmpty, View.GONE);
        views.setViewVisibility(R.id.widgetGrid, View.VISIBLE);
        if ("month".equals(range)) {
            setVisibleRows(views, monthRows);
        }

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
            String dateText = monthDay.format(localDate);
            String weekday = day.optString("weekday", "");
            if (weekday.isEmpty()) {
                weekday = weekdayFormat.format(localDate);
            }
            JSONArray items = day.optJSONArray("items");
            boolean isToday = day.optBoolean("isToday", false);
            boolean isCurrentMonth = day.optBoolean("isCurrentMonth", true);
            boolean shouldShowItems = !"month".equals(range) || isCurrentMonth;
            int itemCount = !shouldShowItems || items == null ? 0 : items.length();
            int visibleCount = Math.min(itemCount, getMaxVisibleItems());
            int moreCount = Math.max(itemCount - visibleCount, 0);

            SpannableStringBuilder text = new SpannableStringBuilder();
            int dateStart = text.length();
            text.append(dateText);
            if (!"month".equals(range)) {
                text.append(" ").append(weekday);
            }
            text.setSpan(
                    new AbsoluteSizeSpan(Math.round(getDateTextSize(itemCount)), true),
                    dateStart,
                    text.length(),
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
            );
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
                text.setSpan(
                        new AbsoluteSizeSpan(Math.round(getBadgeTextSize(itemCount)), true),
                        itemStart,
                        itemEnd,
                        Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
                );
                text.setSpan(new BackgroundColorSpan(badgeColor), itemStart, itemEnd, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                text.setSpan(new ForegroundColorSpan(theme.text), itemStart, itemEnd, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            }

            if (moreCount > 0) {
                text.append("\n");
                int moreStart = text.length();
                text.append("+").append(String.valueOf(moreCount));
                text.setSpan(
                        new AbsoluteSizeSpan(Math.round(getMoreTextSize()), true),
                        moreStart,
                        text.length(),
                        Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
                );
                text.setSpan(new ForegroundColorSpan(isToday ? Color.WHITE : theme.mutedText), moreStart, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            }

            views.setTextViewText(id, text);
            views.setTextColor(id, isToday ? Color.WHITE : isCurrentMonth ? theme.text : theme.mutedText);
            views.setTextViewTextSize(id, TypedValue.COMPLEX_UNIT_SP, getDateTextSize(itemCount));
            views.setInt(id, "setMaxLines", getMaxLines());
            views.setInt(id, "setBackgroundResource", isToday ? theme.todayBackground : R.drawable.widget_day_background);
            views.setViewPadding(
                    id,
                    dp(context, 1),
                    dp(context, getCellTopPadding(itemCount, monthRows)),
                    dp(context, 1),
                    dp(context, 2)
            );
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
        if ("fourDays".equals(range)) return 7;
        if ("twoWeeks".equals(range)) return 5;
        return 6;
    }

    float getDateTextSize(int itemCount) {
        if ("fourDays".equals(range)) return itemCount <= 1 ? 13.5f : 12.2f;
        if ("twoWeeks".equals(range)) return 8.8f;
        return 8.5f;
    }

    float getBadgeTextSize(int itemCount) {
        if ("fourDays".equals(range)) {
            if (itemCount <= 1) return 14.0f;
            if (itemCount == 2) return 12.5f;
            return 9.5f;
        }

        if ("twoWeeks".equals(range)) {
            if (itemCount <= 1) return 10.5f;
            if (itemCount == 2) return 9.3f;
            return 7.0f;
        }

        if (itemCount <= 1) return 10.5f;
        if (itemCount == 2) return 9.4f;
        return 7.1f;
    }

    float getMoreTextSize() {
        if ("fourDays".equals(range)) return 9.5f;
        if ("twoWeeks".equals(range)) return 7.0f;
        return 7.1f;
    }

    int getMaxLines() {
        return 4;
    }

    int getCellTopPadding(int itemCount, int monthRows) {
        if ("fourDays".equals(range)) {
            if (itemCount <= 1) return 8;
            if (itemCount == 2) return 5;
            return 3;
        }

        if ("twoWeeks".equals(range)) {
            if (itemCount <= 1) return 4;
            return 2;
        }

        if (monthRows > 0 && monthRows <= 5) return itemCount <= 1 ? 4 : 2;
        return itemCount <= 1 ? 2 : 1;
    }

    int getGridTopPadding() {
        if ("fourDays".equals(range)) return 5;
        if ("twoWeeks".equals(range)) return 6;
        return 3;
    }

    int getVisibleRowCount() {
        if ("fourDays".equals(range) || "twoWeeks".equals(range)) return 2;
        return 6;
    }

    int getMonthRowCount(int dayCount) {
        int rowCount = (int) Math.ceil(dayCount / 7.0);
        return Math.max(4, Math.min(rowCount, 6));
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

    int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    String getRangeLabel() {
        if ("fourDays".equals(range)) return "4일";
        if ("twoWeeks".equals(range)) return "2주";
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
        if ("fourDays".equals(range)) {
            return new int[] {
                    R.id.widgetDay01, R.id.widgetDay02, R.id.widgetDay08, R.id.widgetDay09,
                    R.id.widgetDay03, R.id.widgetDay04, R.id.widgetDay05, R.id.widgetDay06,
                    R.id.widgetDay07, R.id.widgetDay10, R.id.widgetDay11, R.id.widgetDay12,
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

    int[] getRowIds() {
        return new int[] {
                R.id.widgetRow01, R.id.widgetRow02, R.id.widgetRow03,
                R.id.widgetRow04, R.id.widgetRow05, R.id.widgetRow06
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

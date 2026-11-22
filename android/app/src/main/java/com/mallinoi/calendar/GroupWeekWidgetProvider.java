package com.mallinoi.calendar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Paint;
import android.net.Uri;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

public abstract class GroupWeekWidgetProvider extends CalendarWidgetProvider {
    GroupWeekWidgetProvider(String type, String label) {
        super(type, "groupWeek", label, R.layout.widget_group_week, 7);
    }

    static GroupWeekWidgetProvider provider(Context context, int id) {
        AppWidgetProviderInfo info = AppWidgetManager.getInstance(context).getAppWidgetInfo(id);
        if (info == null || !context.getPackageName().equals(info.provider.getPackageName())) return null;
        for (CalendarWidgetProvider candidate : CalendarWidgetsPlugin.WIDGET_PROVIDERS) {
            if (candidate instanceof GroupWeekWidgetProvider && candidate.getClass().getName().equals(info.provider.getClassName())) {
                return (GroupWeekWidgetProvider) candidate;
            }
        }
        return null;
    }

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(CalendarWidgetsPlugin.PREFS_NAME, Context.MODE_PRIVATE);
    }

    JSONArray choices(Context context) {
        SharedPreferences prefs = preferences(context);
        if (prefs.getBoolean(CalendarWidgetsPlugin.KEY_LOGGED_IN, false)) {
            try {
                JSONObject boards = new JSONObject(prefs.getString(CalendarWidgetsPlugin.KEY_PAYLOAD, "{}")).optJSONObject("groupBoards");
                if (boards != null && boards.optJSONArray(calendarType) != null) return boards.optJSONArray(calendarType);
            } catch (JSONException ignored) { }
        }
        return new JSONArray();
    }

    JSONObject selectedBoard(Context context, int id) {
        String group = preferences(context).getString("group_widget_" + id, "");
        JSONArray choices = choices(context);
        for (int i = 0; i < choices.length(); i++) {
            JSONObject board = choices.optJSONObject(i);
            if (board != null && group.equals(board.optString("id"))) return board;
        }
        return null;
    }

    static String[] weekKeys(Calendar today) {
        Calendar next = (Calendar) today.clone();
        next.add(Calendar.DATE, 1 - next.get(Calendar.DAY_OF_WEEK));
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        format.setTimeZone(today.getTimeZone());
        String[] dates = new String[7];
        for (int d = 0; d < dates.length; d++) {
            dates[d] = format.format(next.getTime());
            next.add(Calendar.DATE, 1);
        }
        return dates;
    }

    static JSONArray rows(JSONObject board, String sunday) {
        JSONObject weeks = board == null ? null : board.optJSONObject("weeks");
        return weeks == null ? null : weeks.optJSONArray(sunday);
    }

    WidgetTheme currentTheme(Context context) {
        return getTheme("dark".equals(preferences(context).getString(CalendarWidgetsPlugin.KEY_APPEARANCE, "light")));
    }

    @Override RemoteViews buildViews(Context context, AppWidgetManager manager, int id) {
        WidgetTheme theme = currentTheme(context);
        JSONObject board = selectedBoard(context, id);
        String group = board == null ? null : board.optString("id");
        Calendar today = Calendar.getInstance();
        String[] dates = weekKeys(today);
        JSONArray members = rows(board, dates[0]);
        RemoteViews view = new RemoteViews(context.getPackageName(), layoutId);
        view.setInt(R.id.widgetRoot, "setBackgroundResource", theme.isDark ? R.drawable.widget_background_dark : R.drawable.widget_background);
        view.setImageViewResource(R.id.widgetMascot, "study".equals(calendarType) ? R.drawable.widget_mascot_study
                : "work".equals(calendarType) ? R.drawable.widget_mascot_work : R.drawable.widget_mascot_event);
        view.setTextViewText(R.id.widgetTitle, board == null ? label + " 그룹" : board.optString("name"));
        view.setTextViewText(R.id.widgetSubtitle, label + " · 1주");
        view.setTextColor(R.id.widgetTitle, theme.text);
        view.setTextColor(R.id.widgetSubtitle, theme.mutedText);
        view.setInt(R.id.widgetSubtitle, "setBackgroundResource", theme.labelBackground);

        Intent tap = new Intent(Intent.ACTION_VIEW, new Uri.Builder().scheme("mallinoi").authority("calendar")
                .appendQueryParameter("type", calendarType).build(), context, MainActivity.class);
        if (group != null) tap.setData(tap.getData().buildUpon().appendQueryParameter("group", group).build());
        view.setOnClickPendingIntent(R.id.widgetRoot, PendingIntent.getActivity(context, id, tap,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        view.removeAllViews(R.id.groupDates);
        boolean showRows = members != null && members.length() > 0;
        view.setViewVisibility(R.id.widgetEmpty, showRows ? View.GONE : View.VISIBLE);
        view.setViewVisibility(R.id.groupMembers, showRows ? View.VISIBLE : View.GONE);
        if (!showRows) {
            boolean loggedIn = preferences(context).getBoolean(CalendarWidgetsPlugin.KEY_LOGGED_IN, false);
            String message = !loggedIn ? "앱에서 로그인해 주세요" : board == null
                    ? "위젯 설정에서 그룹을 선택해 주세요" : "앱을 열어 이번 주 일정을 갱신해 주세요";
            view.setTextViewText(R.id.widgetEmpty, message);
            view.setTextColor(R.id.widgetEmpty, theme.mutedText);
            return view;
        }
        RemoteViews header = new RemoteViews(context.getPackageName(), R.layout.widget_group_row);
        header.removeAllViews(R.id.groupDays);
        for (int d = 0; d < 7; d++) {
            RemoteViews cell = new RemoteViews(context.getPackageName(), R.layout.widget_group_day);
            cell.setViewVisibility(R.id.groupFirst, View.VISIBLE);
            cell.setTextViewText(R.id.groupFirst, "일월화수목금토".charAt(d) + " " + Integer.parseInt(dates[d].substring(8)));
            cell.setTextColor(R.id.groupFirst, theme.text);
            if (d + 1 == today.get(Calendar.DAY_OF_WEEK)) cell.setInt(R.id.groupFirst, "setBackgroundResource", theme.todayBackground);
            header.addView(R.id.groupDays, cell);
        }
        view.addView(R.id.groupDates, header);
        int mutable = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
        view.setPendingIntentTemplate(R.id.groupMembers, PendingIntent.getActivity(context, id, tap,
                mutable | PendingIntent.FLAG_UPDATE_CURRENT));
        Intent service = new Intent(context, GroupWidgetRowsService.class);
        service.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        service.setData(Uri.parse("mallinoi-widget://rows/" + id));
        view.setRemoteAdapter(R.id.groupMembers, service);
        return view;
    }

    RemoteViews memberView(Context context, JSONObject row, String[] dates, WidgetTheme theme) {
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.widget_group_row);
        view.setTextViewText(R.id.groupMemberName, row.optString("name"));
        view.setTextColor(R.id.groupMemberName, theme.text);
        view.removeAllViews(R.id.groupDays);
        view.setOnClickFillInIntent(R.id.groupRow, new Intent());
        JSONObject days = row.optJSONObject("days");
        for (String date : dates) {
            RemoteViews cell = new RemoteViews(context.getPackageName(), R.layout.widget_group_day);
            JSONArray items = days == null ? null : days.optJSONArray(date);
            for (int i = 0; items != null && i < Math.min(2, items.length()); i++) {
                int slot = i == 0 ? R.id.groupFirst : R.id.groupSecond;
                JSONObject item = items.optJSONObject(i);
                int color = parseColor(item.optString("color"), theme.secondary);
                cell.setViewVisibility(slot, View.VISIBLE);
                cell.setTextViewText(slot, item.optString("title"));
                cell.setInt(slot, "setBackgroundColor", color);
                cell.setTextColor(slot, badgeTextColor(color, theme));
                cell.setInt(slot, "setPaintFlags", Paint.ANTI_ALIAS_FLAG | (item.optBoolean("done") ? Paint.STRIKE_THRU_TEXT_FLAG : 0));
            }
            if (items != null && items.length() > 2) {
                cell.setViewVisibility(R.id.groupMore, View.VISIBLE);
                cell.setTextColor(R.id.groupMore, theme.mutedText);
                cell.setTextViewText(R.id.groupMore, "+" + (items.length() - 2));
            }
            view.addView(R.id.groupDays, cell);
        }
        return view;
    }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        super.onUpdate(context, manager, ids);
        manager.notifyAppWidgetViewDataChanged(ids, R.id.groupMembers);
    }

    @Override public void onDeleted(Context context, int[] ids) {
        SharedPreferences.Editor editor = preferences(context).edit();
        for (int id : ids) editor.remove("group_widget_" + id);
        editor.apply();
    }
}

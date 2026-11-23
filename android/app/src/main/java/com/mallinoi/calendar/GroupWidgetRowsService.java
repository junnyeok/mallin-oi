package com.mallinoi.calendar;

import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.Calendar;
import org.json.JSONArray;

public class GroupWidgetRowsService extends RemoteViewsService {
    @Override public RemoteViewsFactory onGetViewFactory(Intent intent) {
        final int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1);
        return new RemoteViewsFactory() {
            private GroupWeekWidgetProvider provider;
            private CalendarWidgetProvider.WidgetTheme theme;
            private JSONArray rows;
            private String[] dates;
            private int padding;

            public void onCreate() { onDataSetChanged(); }
            public void onDestroy() { rows = null; }
            public void onDataSetChanged() {
                provider = GroupWeekWidgetProvider.provider(GroupWidgetRowsService.this, id);
                dates = GroupWeekWidgetProvider.weekKeys(Calendar.getInstance());
                rows = null;
                if (provider != null) {
                    theme = provider.currentTheme(GroupWidgetRowsService.this);
                    GroupWeekWidgetProvider.WeekRows week = provider.weekRows(
                            provider.selectedBoard(GroupWidgetRowsService.this, id), dates[0]);
                    int height = provider.availableWidgetHeight(GroupWidgetRowsService.this,
                            AppWidgetManager.getInstance(GroupWidgetRowsService.this), id);
                    padding = provider.memberPadding(GroupWidgetRowsService.this, height, week, dates);
                    rows = week.members;
                }
            }
            public int getCount() { return rows == null ? 0 : rows.length(); }
            public RemoteViews getViewAt(int index) {
                if (index < 0 || index >= getCount()) return null;
                return provider.memberView(GroupWidgetRowsService.this, rows.optJSONObject(index), dates, theme, padding);
            }
            public RemoteViews getLoadingView() { return null; }
            public int getViewTypeCount() { return 1; }
            public long getItemId(int index) { return index; }
            public boolean hasStableIds() { return false; }
        };
    }
}

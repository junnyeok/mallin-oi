package com.mallinoi.calendar;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.view.View;
import android.widget.TextView;
import android.widget.ImageView;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class WidgetAppearanceTest {
    @Test public void noColorBadgesHaveNoBackgroundAndFollowAppearance() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        JSONArray days = new JSONArray("[{\"date\":\"2026-11-01\",\"items\":["
            + "{\"title\":\"휴무\",\"categoryName\":\"휴무\",\"displayColor\":\"transparent\"},"
            + "{\"title\":\"비번\",\"categoryName\":\"비번\",\"displayColor\":\"#000000\"}]}]");
        for (boolean dark : new boolean[] { false, true }) {
            for (CalendarWidgetProvider provider : CalendarWidgetsPlugin.WIDGET_PROVIDERS) {
                CalendarWidgetProvider.WidgetTheme theme = provider.getTheme(dark);
                if (provider instanceof GroupWeekWidgetProvider) {
                    String date = "2026-11-01";
                    JSONObject member = new JSONObject().put("name", "회원").put("days", new JSONObject().put(date,
                            new JSONArray().put(new JSONObject().put("title", "휴무").put("color", "transparent"))));
                    RemoteViews groupRow = ((GroupWeekWidgetProvider) provider).memberView(context, member, new String[]{date}, theme);
                    TextView item = groupRow.apply(context, null).findViewById(R.id.groupFirst);
                    assertEquals(theme.text, item.getCurrentTextColor());
                    assertEquals("휴무", item.getText().toString());
                    continue;
                }
                RemoteViews views = new RemoteViews(context.getPackageName(), provider.layoutId);
                provider.bindDays(context, views, days, theme, false);
                View root = views.apply(context, null);
                View day = root.findViewById(provider.getDayIds()[0]);
                TextView text = day.findViewById(R.id.widgetDayEventText1);
                ImageView background = day.findViewById(R.id.widgetDayEventBackground1);
                assertEquals(theme.text, text.getCurrentTextColor());
                assertEquals(0, background.getImageAlpha());
                if (!"work".equals(provider.calendarType)) {
                    assertEquals(255, ((ImageView) day.findViewById(R.id.widgetDayEventBackground2)).getImageAlpha());
                    assertEquals(Color.WHITE, ((TextView) day.findViewById(R.id.widgetDayEventText2)).getCurrentTextColor());
                }
            }
        }
    }

    @Test public void workWidgetsKeepDifferentGroupsAndDropUnavailableRows() throws Exception {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences prefs = app.getSharedPreferences("group-widget-fixture", Context.MODE_PRIVATE);
        Context isolated = new ContextWrapper(app) {
            @Override public SharedPreferences getSharedPreferences(String name, int mode) { return prefs; }
        };
        WorkGroupWidgetProvider provider = new WorkGroupWidgetProvider();
        String[] dates = GroupWeekWidgetProvider.weekKeys(java.util.Calendar.getInstance());
        JSONArray members = new JSONArray();
        for (int i = 1; i <= 12; i++) {
            members.put(new JSONObject().put("name", "회원 " + i).put("days", new JSONObject()));
        }
        JSONObject large = new JSONObject().put("id", "first").put("name", "같은 이름")
                .put("weeks", new JSONObject().put(dates[0], members));
        JSONObject small = new JSONObject().put("id", "second").put("name", "같은 이름")
                .put("weeks", new JSONObject().put(dates[0], new JSONArray().put(members.get(0))));
        JSONObject boards = new JSONObject().put("work", new JSONArray().put(large).put(small));
        try {
            prefs.edit().putBoolean(CalendarWidgetsPlugin.KEY_LOGGED_IN, true)
                    .putString(CalendarWidgetsPlugin.KEY_PAYLOAD, new JSONObject().put("groupBoards", boards).toString())
                    .putString("group_widget_101", "first").putString("group_widget_102", "second").commit();
            assertEquals(12, GroupWeekWidgetProvider.rows(provider.selectedBoard(isolated, 101), dates[0]).length());
            assertEquals(1, GroupWeekWidgetProvider.rows(provider.selectedBoard(isolated, 102), dates[0]).length());
            assertNull(new EventGroupWidgetProvider().selectedBoard(isolated, 101));
            provider.onDeleted(isolated, new int[]{101});
            assertNull(provider.selectedBoard(isolated, 101));
            assertEquals("second", provider.selectedBoard(isolated, 102).getString("id"));
            prefs.edit().putBoolean(CalendarWidgetsPlugin.KEY_LOGGED_IN, false).commit();
            assertNull(provider.selectedBoard(isolated, 102));
        } finally {
            prefs.edit().clear().commit();
        }
    }

    @Test public void everyWidgetReadsLatestAppearanceWithoutScheduleRefresh() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences prefs = context.getSharedPreferences(CalendarWidgetsPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        boolean hadAppearance = prefs.contains(CalendarWidgetsPlugin.KEY_APPEARANCE);
        String original = prefs.getString(CalendarWidgetsPlugin.KEY_APPEARANCE, "light");
        try {
            assertEquals(12, CalendarWidgetsPlugin.WIDGET_PROVIDERS.length);
            for (String mode : new String[] { "light", "dark", "light" }) {
                assertTrue(prefs.edit().putString(CalendarWidgetsPlugin.KEY_APPEARANCE, mode).commit());
                for (CalendarWidgetProvider provider : CalendarWidgetsPlugin.WIDGET_PROVIDERS) {
                    View view = provider.buildViews(context, AppWidgetManager.getInstance(context), 0).apply(context, null);
                    TextView title = view.findViewById(R.id.widgetTitle);
                    assertEquals(mode + " " + provider.getClass().getSimpleName(),
                        "dark".equals(mode) ? Color.rgb(237, 242, 233) : Color.rgb(48, 58, 48), title.getCurrentTextColor());
                    assertNotNull(view.findViewById(R.id.widgetRoot).getBackground());
                    assertNotNull(((ImageView) view.findViewById(R.id.widgetMascot)).getDrawable());
                    assertNotNull(view.findViewById(R.id.widgetSubtitle).getBackground());
                }
            }
        } finally {
            SharedPreferences.Editor editor = prefs.edit();
            if (hadAppearance) editor.putString(CalendarWidgetsPlugin.KEY_APPEARANCE, original);
            else editor.remove(CalendarWidgetsPlugin.KEY_APPEARANCE);
            editor.commit();
        }
    }
}

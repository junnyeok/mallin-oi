package com.mallinoi.calendar;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.view.View;
import android.widget.TextView;
import android.widget.ImageView;
import android.widget.RemoteViews;
import org.json.JSONArray;
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

    @Test public void everyWidgetReadsLatestAppearanceWithoutScheduleRefresh() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences prefs = context.getSharedPreferences(CalendarWidgetsPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        boolean hadAppearance = prefs.contains(CalendarWidgetsPlugin.KEY_APPEARANCE);
        String original = prefs.getString(CalendarWidgetsPlugin.KEY_APPEARANCE, "light");
        try {
            assertEquals(9, CalendarWidgetsPlugin.WIDGET_PROVIDERS.length);
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

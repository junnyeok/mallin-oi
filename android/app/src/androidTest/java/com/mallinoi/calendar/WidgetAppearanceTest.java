package com.mallinoi.calendar;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetHostView;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Parcel;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ListAdapter;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.ImageView;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.Calendar;
import java.util.concurrent.FutureTask;
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
                    RemoteViews groupRow = ((GroupWeekWidgetProvider) provider)
                            .memberView(context, member, new String[]{date}, theme, provider.dp(context, 2));
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

    @Test @SdkSuppress(minSdkVersion = 31)
    public void groupMemberRowsRenderOnFirstWidgetUpdate() throws Exception {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences prefs = app.getSharedPreferences("group-widget-first-update-fixture", Context.MODE_PRIVATE);
        Context isolated = new ContextWrapper(app) {
            @Override public SharedPreferences getSharedPreferences(String name, int mode) { return prefs; }
        };
        String[] dates = GroupWeekWidgetProvider.weekKeys(Calendar.getInstance());
        JSONObject scheduledDays = new JSONObject();
        for (String date : dates) {
            scheduledDays.put(date, new JSONArray().put(new JSONObject().put("title", "일정"))
                    .put(new JSONObject().put("title", "두 번째 일정"))
                    .put(new JSONObject().put("title", "세 번째 일정")));
        }
        JSONArray members = new JSONArray();
        for (int i = 0; i < 12; i++) {
            members.put(new JSONObject().put("name", i == 0 ? "나" : "회" + i)
                    .put("days", i == 1 ? new JSONObject() : scheduledDays));
        }
        JSONObject board = new JSONObject().put("id", "selected-group").put("name", "선택한 그룹")
                .put("weeks", new JSONObject().put(dates[0], members));
        JSONObject boards = new JSONObject();
        for (String type : new String[]{"study", "work", "event"}) {
            boards.put(type, new JSONArray().put(board));
        }
        prefs.edit().putBoolean(CalendarWidgetsPlugin.KEY_LOGGED_IN, true)
                .putString(CalendarWidgetsPlugin.KEY_PAYLOAD, new JSONObject().put("groupBoards", boards).toString())
                .putString("group_widget_101", "selected-group").commit();
        FutureTask<Void> render = new FutureTask<>(() -> {
            for (GroupWeekWidgetProvider provider : new GroupWeekWidgetProvider[]{
                    new StudyGroupWidgetProvider(), new WorkGroupWidgetProvider(), new EventGroupWidgetProvider()}) {
                RemoteViews update = provider.buildViews(isolated, AppWidgetManager.getInstance(app), 101);
                Parcel parcel = Parcel.obtain();
                try {
                    update.writeToParcel(parcel, 0);
                    parcel.setDataPosition(0);
                    AppWidgetHostView host = new AppWidgetHostView(app);
                    host.updateAppWidget(RemoteViews.CREATOR.createFromParcel(parcel));

                    ListView list = host.findViewById(R.id.groupMembers);
                    assertNotNull(list);
                    ListAdapter adapter = list.getAdapter();
                    assertNotNull("Initial widget update must include member rows", adapter);
                    assertEquals(12, adapter.getCount());
                    assertNotNull(list.getOnItemClickListener());

                    View ownRow = adapter.getView(0, null, list);
                    assertEquals("나", ((TextView) ownRow.findViewById(R.id.groupMemberName)).getText().toString());
                    assertEquals("일정", ((TextView) ownRow.findViewById(R.id.groupFirst)).getText().toString());
                    assertEquals("+1", ((TextView) ownRow.findViewById(R.id.groupMore)).getText().toString());
                    View emptyRow = adapter.getView(1, null, list);
                    assertEquals(View.GONE, emptyRow.findViewById(R.id.groupFirst).getVisibility());
                    View lastRow = adapter.getView(11, null, list);
                    assertEquals("회11", ((TextView) lastRow.findViewById(R.id.groupMemberName)).getText().toString());
                } finally {
                    parcel.recycle();
                }
            }
            return null;
        });
        try {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(render);
            render.get();
        } finally {
            prefs.edit().clear().commit();
        }
    }

    @Test @SdkSuppress(minSdkVersion = 31)
    public void eventSharedRowStaysCompactAboveMembers() throws Exception {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences prefs = app.getSharedPreferences("group-widget-shared-row-fixture", Context.MODE_PRIVATE);
        Context isolated = new ContextWrapper(app) {
            @Override public SharedPreferences getSharedPreferences(String name, int mode) { return prefs; }
        };
        String[] dates = GroupWeekWidgetProvider.weekKeys(Calendar.getInstance());
        JSONObject item = new JSONObject().put("title", "모임").put("color", "#D4B9F2");
        JSONObject memberDays = new JSONObject().put(dates[0], new JSONArray().put(item));
        JSONObject sharedDays = new JSONObject().put(dates[0], new JSONArray().put(item))
                .put(dates[1], new JSONArray().put(item).put(item))
                .put(dates[2], new JSONArray().put(item).put(item).put(item));
        JSONArray entries = new JSONArray()
                .put(new JSONObject().put("name", "말").put("days", memberDays))
                .put(new JSONObject().put("name", "다").put("days", memberDays))
                .put(new JSONObject().put("name", "우리").put("shared", true).put("days", sharedDays));
        JSONObject board = new JSONObject().put("id", "selected-group").put("name", "선택한 그룹")
                .put("weeks", new JSONObject().put(dates[0], entries));
        JSONObject boards = new JSONObject().put("event", new JSONArray().put(board))
                .put("study", new JSONArray().put(board));
        prefs.edit().putBoolean(CalendarWidgetsPlugin.KEY_LOGGED_IN, true)
                .putString(CalendarWidgetsPlugin.KEY_PAYLOAD, new JSONObject().put("groupBoards", boards).toString())
                .putString("group_widget_101", "selected-group").commit();
        FutureTask<Void> render = new FutureTask<>(() -> {
            AppWidgetManager manager = AppWidgetManager.getInstance(app);
            class ResizableEventWidget extends EventGroupWidgetProvider {
                int height = 110;

                @Override int availableWidgetHeight(Context context, AppWidgetManager widgetManager, int id) {
                    return height;
                }
            }
            ResizableEventWidget provider = new ResizableEventWidget();
            AppWidgetHostView host = new AppWidgetHostView(app);
            host.updateAppWidget(provider.buildViews(isolated, manager, 101));
            ViewGroup dateRows = host.findViewById(R.id.groupDates);
            assertEquals(2, dateRows.getChildCount());
            View sharedRow = dateRows.getChildAt(1);
            assertEquals("우리", ((TextView) sharedRow.findViewById(R.id.groupMemberName)).getText().toString());
            ViewGroup sharedCells = sharedRow.findViewById(R.id.groupDays);
            String[] expected = {"모임", "+2", "+3"};
            for (int i = 0; i < sharedCells.getChildCount(); i++) {
                View cell = sharedCells.getChildAt(i);
                TextView first = cell.findViewById(R.id.groupFirst);
                assertEquals(i < expected.length ? expected[i] : "", first.getText().toString());
                assertEquals(i < expected.length ? View.VISIBLE : View.GONE, first.getVisibility());
                assertEquals(View.GONE, cell.findViewById(R.id.groupSecond).getVisibility());
                assertEquals(View.GONE, cell.findViewById(R.id.groupMore).getVisibility());
            }
            ListView list = host.findViewById(R.id.groupMembers);
            assertEquals(2, list.getAdapter().getCount());
            float density = app.getResources().getDisplayMetrics().density;
            int width = Math.round(320 * density);
            int height = Math.round(110 * density);
            host.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
            host.layout(0, 0, width, height);
            assertEquals(2, list.getChildCount());
            assertTrue("Second member ends at " + list.getChildAt(1).getBottom() + "px in "
                    + list.getHeight() + "px of available list height",
                    list.getChildAt(1).getBottom() <= list.getHeight());
            assertEquals("말", ((TextView) list.getChildAt(0).findViewById(R.id.groupMemberName)).getText().toString());
            assertEquals("다", ((TextView) list.getChildAt(1).findViewById(R.id.groupMemberName)).getText().toString());

            int smallPadding = list.getChildAt(0).findViewById(R.id.groupRow).getPaddingTop();
            provider.height = 188;
            host.updateAppWidget(provider.buildViews(isolated, manager, 101));
            list = host.findViewById(R.id.groupMembers);
            int tallHeight = Math.round(provider.height * density);
            host.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(tallHeight, View.MeasureSpec.EXACTLY));
            host.layout(0, 0, width, tallHeight);
            int spaciousPadding = list.getChildAt(0).findViewById(R.id.groupRow).getPaddingTop();
            assertTrue(spaciousPadding > smallPadding);
            assertEquals(2, list.getChildCount());
            assertTrue("Spaced second member ends at " + list.getChildAt(1).getBottom() + "px in "
                    + list.getHeight() + "px of available list height",
                    list.getChildAt(1).getBottom() <= list.getHeight());
            assertEquals(0, ((ViewGroup) host.findViewById(R.id.groupDates)).getChildAt(1).getPaddingTop());

            AppWidgetHostView study = new AppWidgetHostView(app);
            study.updateAppWidget(new StudyGroupWidgetProvider().buildViews(isolated, manager, 101));
            assertEquals(1, ((ViewGroup) study.findViewById(R.id.groupDates)).getChildCount());
            assertEquals(3, ((ListView) study.findViewById(R.id.groupMembers)).getAdapter().getCount());

            entries.remove(2);
            prefs.edit().putString(CalendarWidgetsPlugin.KEY_PAYLOAD,
                    new JSONObject().put("groupBoards", boards).toString()).commit();
            host.updateAppWidget(provider.buildViews(isolated, manager, 101));
            assertEquals(1, ((ViewGroup) host.findViewById(R.id.groupDates)).getChildCount());
            assertEquals(2, ((ListView) host.findViewById(R.id.groupMembers)).getAdapter().getCount());

            for (int i = 0; i < 4; i++) {
                entries.put(new JSONObject().put("name", "회" + i).put("days", memberDays));
            }
            prefs.edit().putString(CalendarWidgetsPlugin.KEY_PAYLOAD,
                    new JSONObject().put("groupBoards", boards).toString()).commit();
            host.updateAppWidget(provider.buildViews(isolated, manager, 101));
            list = host.findViewById(R.id.groupMembers);
            assertEquals(6, list.getAdapter().getCount());
            View denseRow = list.getAdapter().getView(0, null, list).findViewById(R.id.groupRow);
            assertTrue(denseRow.getPaddingTop() < spaciousPadding);
            return null;
        });
        try {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(render);
            render.get();
        } finally {
            prefs.edit().clear().commit();
        }
    }
}

package com.mallinoi.calendar;

public class EventMonthWidgetProvider extends CalendarWidgetProvider {
    public EventMonthWidgetProvider() {
        super("event", "month", "이벤트 한 달", R.layout.widget_calendar, 42);
    }
}

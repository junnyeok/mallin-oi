package com.mallinoi.calendar;

public class EventFourDayWidgetProvider extends CalendarWidgetProvider {
    public EventFourDayWidgetProvider() {
        super("event", "fourDays", "이벤트 4일", R.layout.widget_calendar, 4);
    }
}

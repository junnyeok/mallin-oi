package com.mallinoi.calendar;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CalendarWidgetsPlugin.class);
        registerPlugin(StoreUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        handleCalendarIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleCalendarIntent(intent);
    }

    private void handleCalendarIntent(Intent intent) {
        if (intent == null) return;

        String calendarType = intent.getStringExtra("calendarType");
        Uri data = intent.getData();

        if ((calendarType == null || calendarType.isEmpty()) && data != null) {
            calendarType = data.getQueryParameter("type");
        }

        if (calendarType == null) return;

        if ("study".equals(calendarType) || "work".equals(calendarType) || "event".equals(calendarType)) {
            CalendarWidgetsPlugin.setPendingCalendarType(this, calendarType);
        }
    }
}

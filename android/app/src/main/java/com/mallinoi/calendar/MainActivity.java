package com.mallinoi.calendar;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CalendarWidgetsPlugin.class);
        registerPlugin(CompletionAudioSessionPlugin.class);
        registerPlugin(StoreUpdatePlugin.class);
        registerPlugin(EventAlarmsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        // BridgeActivity also calls this on launch. Save the route before Capacitor notifies the WebView.
        handleCalendarIntent(intent);
        super.onNewIntent(intent);
        setIntent(intent);
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

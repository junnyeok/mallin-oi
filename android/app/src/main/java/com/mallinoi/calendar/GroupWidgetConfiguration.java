package com.mallinoi.calendar;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import org.json.JSONArray;

public class GroupWidgetConfiguration extends Activity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        setResult(RESULT_CANCELED);
        int id = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        GroupWeekWidgetProvider provider = GroupWeekWidgetProvider.provider(this, id);
        if (provider == null) { finish(); return; }

        JSONArray groups = provider.choices(this);
        String[] names = new String[groups.length()];
        for (int i = 0; i < names.length; i++) names[i] = groups.optJSONObject(i).optString("name");
        AlertDialog.Builder dialog = new AlertDialog.Builder(this)
                .setTitle(provider.label + " · 표시할 그룹 선택")
                .setNegativeButton("취소", (d, which) -> finish())
                .setOnCancelListener(d -> finish());
        if (names.length == 0) {
            dialog.setMessage("앱에서 로그인하고 연결할 그룹을 확인한 뒤 위젯을 추가해 주세요.")
                  .setPositiveButton("앱 열기", (d, which) -> {
                      startActivity(new Intent(this, MainActivity.class));
                      finish();
                  });
        } else {
            dialog.setItems(names, (d, which) -> {
                GroupWeekWidgetProvider.preferences(this).edit()
                        .putString("group_widget_" + id, groups.optJSONObject(which).optString("id")).apply();
                provider.onUpdate(this, AppWidgetManager.getInstance(this), new int[] { id });
                setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id));
                finish();
            });
        }
        dialog.show();
    }
}

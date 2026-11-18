package com.mallinoi.site;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;

public final class MainActivity extends Activity {
    private static final Uri HOME = Uri.parse("https://mallin-oi.com/");

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.site_launcher);
        findViewById(R.id.open_site).setOnClickListener(view -> openSite());
        findViewById(R.id.open_offline_articles).setOnClickListener(
            view -> startActivity(new Intent(this, OfflineArticlesActivity.class)));
        if (savedInstanceState == null) {
            openSite();
        }
    }

    private void openSite() {
        View error = findViewById(R.id.browser_error);
        error.setVisibility(View.GONE);
        CustomTabColorSchemeParams colors = new CustomTabColorSchemeParams.Builder()
            .setToolbarColor(getColor(R.color.site_green))
            .build();
        // Chrome supplies the current address as data when it sends this explicit intent.
        int mutableFlag = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
        PendingIntent save = PendingIntent.getActivity(this, 0,
            new Intent(this, SaveOfflineArticleActivity.class), mutableFlag);
        PendingIntent library = PendingIntent.getActivity(this, 1,
            new Intent(this, OfflineArticlesActivity.class), PendingIntent.FLAG_IMMUTABLE);
        CustomTabsIntent tab = new CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(colors)
            .setUrlBarHidingEnabled(true)
            .addMenuItem(getString(R.string.save_offline_article), save)
            .addMenuItem(getString(R.string.offline_articles), library)
            .build();
        try {
            tab.launchUrl(this, HOME);
        } catch (ActivityNotFoundException unavailable) {
            error.setVisibility(View.VISIBLE);
        }
    }
}

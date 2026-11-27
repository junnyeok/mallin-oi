package com.mallinoi.site;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import androidx.browser.customtabs.CustomTabsIntent;

public final class MainActivity extends Activity {
    static final Uri HOME = Uri.parse("https://mallin-oi.com/");
    private static final Uri PROFILE = Uri.withAppendedPath(HOME, "profile.html");
    private SiteAppUpdate appUpdate;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.site_launcher);
        boolean opensProfile = isProfileLink(getIntent());
        boolean firstLaunch = savedInstanceState == null;
        appUpdate = new SiteAppUpdate(this, firstLaunch && !opensProfile, () -> openSite(HOME));
        findViewById(R.id.open_site).setOnClickListener(view -> {
            appUpdate.leaveLauncher();
            openSite(HOME);
        });
        findViewById(R.id.open_offline_articles).setOnClickListener(view -> {
            appUpdate.leaveLauncher();
            startActivity(new Intent(this, OfflineArticlesActivity.class));
        });
        if (firstLaunch && opensProfile) openSite(PROFILE);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (isProfileLink(intent)) {
            appUpdate.leaveLauncher();
            openSite(PROFILE);
        }
    }

    private static boolean isProfileLink(Intent intent) {
        return Intent.ACTION_VIEW.equals(intent.getAction())
            && "mallinoisite://profile".equals(intent.getDataString());
    }

    @Override
    protected void onResume() {
        super.onResume();
        appUpdate.onResume();
    }

    @Override
    protected void onPause() {
        appUpdate.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        appUpdate.onDestroy();
        super.onDestroy();
    }

    private void openSite(Uri destination) {
        View error = findViewById(R.id.browser_error);
        error.setVisibility(View.GONE);
        try {
            openInBrowser(this, destination);
        } catch (ActivityNotFoundException unavailable) {
            error.setVisibility(View.VISIBLE);
        }
    }

    static void openInBrowser(Activity activity, Uri destination) {
        // Chrome supplies the current address as data when it sends this explicit intent.
        int mutableFlag = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
        PendingIntent save = PendingIntent.getActivity(activity, 0,
            new Intent(activity, SaveOfflineArticleActivity.class), mutableFlag);
        PendingIntent library = PendingIntent.getActivity(activity, 1,
            new Intent(activity, OfflineArticlesActivity.class), PendingIntent.FLAG_IMMUTABLE);
        CustomTabsIntent tab = new CustomTabsIntent.Builder()
            .setUrlBarHidingEnabled(true)
            .addMenuItem(activity.getString(R.string.save_offline_article), save)
            .addMenuItem(activity.getString(R.string.offline_articles), library)
            .build();
        tab.launchUrl(activity, destination);
    }
}

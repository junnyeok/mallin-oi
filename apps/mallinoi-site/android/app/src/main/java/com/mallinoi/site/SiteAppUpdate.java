package com.mallinoi.site;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.widget.Toast;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.UpdateAvailability;
import java.util.concurrent.TimeUnit;

final class SiteAppUpdate {
    private static final long CHECK_INTERVAL = TimeUnit.HOURS.toMillis(24);
    private static final long RETRY_INTERVAL = TimeUnit.MINUTES.toMillis(15);
    private static final long INITIAL_NAVIGATION_DELAY = 1500;

    private final Activity activity;
    private final Runnable openSite;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable initialNavigation = this::openInitialSite;
    private final SharedPreferences preferences;
    private boolean initialNavigationPending;
    private boolean launcherResumed;
    private boolean checkInProgress;
    private long nextCheckAt;
    private int pendingVersion;
    private AlertDialog dialog;

    SiteAppUpdate(Activity activity, boolean firstLaunch, Runnable openSite) {
        this.activity = activity;
        this.initialNavigationPending = firstLaunch;
        this.openSite = openSite;
        preferences = activity.getSharedPreferences("site_app_update", Activity.MODE_PRIVATE);
    }

    void onResume() {
        launcherResumed = true;
        if (showPendingUpdate()) return;

        if (checkInProgress || SystemClock.elapsedRealtime() < nextCheckAt) {
            openInitialSite();
            return;
        }

        // Give the Play lookup a brief head start before the Custom Tab covers the launcher.
        if (initialNavigationPending) {
            mainHandler.postDelayed(initialNavigation, INITIAL_NAVIGATION_DELAY);
        }

        checkInProgress = true;
        AppUpdateManagerFactory.create(activity.getApplicationContext()).getAppUpdateInfo()
            .addOnCompleteListener(task -> {
                checkInProgress = false;
                if (activity.isDestroyed()) return;

                nextCheckAt = SystemClock.elapsedRealtime()
                    + (task.isSuccessful() ? CHECK_INTERVAL : RETRY_INTERVAL);
                if (task.isSuccessful()
                    && task.getResult().updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE) {
                    pendingVersion = task.getResult().availableVersionCode();
                }
                if (!showPendingUpdate()) openInitialSite();
            });
    }

    void onPause() {
        launcherResumed = false;
        mainHandler.removeCallbacks(initialNavigation);
    }

    void onDestroy() {
        onPause();
        if (dialog != null) dialog.dismiss();
    }

    void leaveLauncher() {
        initialNavigationPending = false;
        onPause();
    }

    private void openInitialSite() {
        if (!launcherResumed || !initialNavigationPending || dialog != null) return;
        leaveLauncher();
        openSite.run();
    }

    private boolean showPendingUpdate() {
        if (!launcherResumed || activity.isFinishing()) return false;
        if (dialog != null) return true;

        int version = pendingVersion;
        pendingVersion = 0;
        if (version <= 0 || (preferences.getInt("version", 0) == version
            && preferences.getLong("resume_at", 0) > System.currentTimeMillis())) {
            return false;
        }

        mainHandler.removeCallbacks(initialNavigation);
        dialog = new AlertDialog.Builder(activity)
            .setTitle(R.string.app_update_title)
            .setMessage(R.string.app_update_message)
            .setPositiveButton(R.string.app_update_open, (prompt, which) -> {
                postpone(version);
                leaveLauncher();
                openPlayStore();
            })
            .setNegativeButton(R.string.app_update_later, (prompt, which) -> postpone(version))
            .setOnCancelListener(prompt -> postpone(version))
            .create();
        dialog.setOnDismissListener(prompt -> {
            dialog = null;
            openInitialSite();
        });
        dialog.show();
        return true;
    }

    private void postpone(int version) {
        preferences.edit()
            .putInt("version", version)
            .putLong("resume_at", System.currentTimeMillis() + CHECK_INTERVAL)
            .apply();
    }

    private void openPlayStore() {
        Uri listing = Uri.parse("https://play.google.com/store/apps/details?id=" + activity.getPackageName());
        Intent intent = new Intent(Intent.ACTION_VIEW, listing);
        try {
            activity.startActivity(intent.setPackage("com.android.vending"));
        } catch (ActivityNotFoundException noPlayStore) {
            try {
                activity.startActivity(intent.setPackage(null));
            } catch (ActivityNotFoundException noBrowser) {
                Toast.makeText(activity, R.string.app_update_store_unavailable, Toast.LENGTH_SHORT).show();
            }
        }
    }
}

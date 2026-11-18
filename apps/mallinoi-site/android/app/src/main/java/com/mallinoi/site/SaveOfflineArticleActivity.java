package com.mallinoi.site;

import android.app.Activity;
import android.app.AlertDialog;
import android.database.SQLException;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONException;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class SaveOfflineArticleActivity extends Activity {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        long id = OfflineArticles.articleId(getIntent().getDataString());
        if (id <= 0) {
            showError(R.string.offline_article_unavailable);
            return;
        }
        showProgress();
        worker.execute(() -> {
            int result;
            try (OfflineArticles articles = new OfflineArticles(this)) {
                OfflineArticles.Article article = OfflineArticles.fetch(id);
                if (article == null) {
                    result = R.string.offline_article_unavailable;
                } else {
                    articles.save(article);
                    result = R.string.offline_article_saved;
                }
            } catch (SQLException brokenStorage) {
                result = R.string.offline_article_storage_error;
            } catch (IOException | JSONException unavailable) {
                result = R.string.offline_article_error;
            }
            int message = result;
            runOnUiThread(() -> showResult(message));
        });
    }

    private void showProgress() {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        int padding = Math.round(24 * getResources().getDisplayMetrics().density);
        content.setPadding(padding, padding, padding, padding);
        TextView label = new TextView(this);
        label.setText(R.string.offline_article_loading);
        label.setPadding(0, padding, 0, 0);
        content.addView(new ProgressBar(this));
        content.addView(label);
        setContentView(content);
    }

    private void showResult(int message) {
        if (isFinishing() || isDestroyed()) {
            return;
        }
        if (message == R.string.offline_article_saved) {
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
            finish();
        } else {
            showError(message);
        }
    }

    private void showError(int message) {
        new AlertDialog.Builder(this)
            .setMessage(message)
            .setPositiveButton(android.R.string.ok, null)
            .setOnDismissListener(dialog -> finish())
            .show();
    }

    @Override
    protected void onDestroy() {
        worker.shutdownNow();
        super.onDestroy();
    }
}

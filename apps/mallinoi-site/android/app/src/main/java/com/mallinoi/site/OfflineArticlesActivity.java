package com.mallinoi.site;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.database.SQLException;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.List;

public final class OfflineArticlesActivity extends Activity {
    private static final String ARTICLE_ID = "articleId";
    private long articleId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        articleId = getIntent().getLongExtra(ARTICLE_ID, 0);
        setContentView(articleId > 0 ? R.layout.offline_article : R.layout.offline_library);
        findViewById(R.id.back).setOnClickListener(view -> finish());
        if (articleId == 0) {
            findViewById(R.id.open_all_posts).setOnClickListener(view ->
                openOnline(Uri.withAppendedPath(MainActivity.HOME, "posts-all.html")));
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        try (OfflineArticles articles = new OfflineArticles(this)) {
            if (articleId > 0) {
                showArticle(articles.read(articleId));
            } else {
                showLibrary(articles.list());
            }
        } catch (SQLException brokenStorage) {
            showStorageError();
        }
    }

    private void showLibrary(List<OfflineArticles.ArticleTitle> articles) {
        ListView list = findViewById(R.id.saved_article_list);
        list.setEmptyView(findViewById(R.id.saved_article_empty));
        list.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, articles));
        list.setOnItemClickListener((parent, view, position, rowId) ->
            startActivity(new Intent(this, OfflineArticlesActivity.class)
                .putExtra(ARTICLE_ID, articles.get(position).id)));
    }

    private void showArticle(OfflineArticles.Article article) {
        TextView title = findViewById(R.id.saved_article_title);
        if (article == null) {
            title.setText(R.string.offline_article_missing);
            return;
        }
        title.setText(article.title);
        TextView body = findViewById(R.id.saved_article_body);
        body.setText(article.body);
        findViewById(R.id.saved_article_note).setVisibility(View.VISIBLE);
        View original = findViewById(R.id.open_online_post);
        original.setVisibility(View.VISIBLE);
        original.setOnClickListener(view ->
            openOnline(Uri.withAppendedPath(MainActivity.HOME, "post.html").buildUpon()
                .appendQueryParameter("id", Long.toString(articleId))
                .build()));
        View remove = findViewById(R.id.remove_article);
        remove.setVisibility(View.VISIBLE);
        remove.setOnClickListener(view -> new AlertDialog.Builder(this)
            .setMessage(R.string.offline_article_remove_confirmation)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(R.string.offline_article_remove, (dialog, button) -> removeArticle())
            .show());
    }

    private void openOnline(Uri uri) {
        try {
            MainActivity.openInBrowser(this, uri);
        } catch (ActivityNotFoundException unavailable) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_LONG).show();
        }
    }

    private void removeArticle() {
        try (OfflineArticles articles = new OfflineArticles(this)) {
            articles.remove(articleId);
            finish();
        } catch (SQLException brokenStorage) {
            showStorageError();
        }
    }

    private void showStorageError() {
        Toast.makeText(this, R.string.offline_article_storage_error, Toast.LENGTH_LONG).show();
    }
}

package com.mallinoi.site;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import androidx.core.text.HtmlCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.net.ssl.HttpsURLConnection;

final class OfflineArticles extends SQLiteOpenHelper {
    private static final Pattern ARTICLE_URL =
        Pattern.compile("https://mallin-oi\\.com/post\\.html\\?id=([0-9]{1,19})");
    private static final Pattern HTML_TAG = Pattern.compile("<[a-z][a-z0-9]*\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    // This is the same public anonymous key used by the website. No session or private key is used.
    private static final String PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmenRrZWloZHFrZnp3cGlseWt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDYxNjgsImV4cCI6MjA4ODQyMjE2OH0.40iiWIFS_WOcPYgbs09Me7LUXGShODO91RnQOT3SHdQ";
    private static final String POST_ENDPOINT =
        "https://tfztkeihdqkfzwpilyky.supabase.co/rest/v1/rpc/get_post_detail"
        + "?select=id,title,body,is_private&is_private=eq.false&is_unlocked=eq.true";
    private static final int MAX_RESPONSE_BYTES = 1_048_576;

    OfflineArticles(Context context) {
        super(context.getApplicationContext(), "offline-articles.db", null, 1);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("""
            CREATE TABLE articles (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                saved_at INTEGER NOT NULL
            )
            """);
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Version 1 has no migrations.
    }

    static long articleId(String url) {
        if (url == null) {
            return 0;
        }
        Matcher match = ARTICLE_URL.matcher(url);
        if (!match.matches()) {
            return 0;
        }
        try {
            return Long.parseLong(match.group(1));
        } catch (NumberFormatException outsideRange) {
            return 0;
        }
    }

    static Article fetch(long id) throws IOException, JSONException {
        JSONObject request = new JSONObject()
            .put("p_post_id", id)
            .put("p_secret_password", JSONObject.NULL);
        byte[] payload = request.toString().getBytes(StandardCharsets.UTF_8);
        HttpsURLConnection connection = (HttpsURLConnection) new URL(POST_ENDPOINT).openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(7000);
            connection.setReadTimeout(7000);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("apikey", PUBLISHABLE_KEY);
            connection.setRequestProperty("Authorization", "Bearer " + PUBLISHABLE_KEY);
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload);
            }
            if (connection.getResponseCode() != 200) {
                throw new IOException("Article endpoint did not return success");
            }
            JSONArray rows;
            try (InputStream input = connection.getInputStream()) {
                rows = new JSONArray(readBounded(input));
            }
            if (rows.length() != 1) {
                return null;
            }
            JSONObject row = rows.getJSONObject(0);
            if (row.getLong("id") != id || !Boolean.FALSE.equals(row.opt("is_private"))) {
                return null;
            }
            String title = row.getString("title").trim();
            String body = row.isNull("body") ? "" : plainText(row.getString("body"));
            return !title.isEmpty() && !body.isEmpty() ? new Article(id, title, body) : null;
        } finally {
            connection.disconnect();
        }
    }

    private static String readBounded(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (output.size() + count > MAX_RESPONSE_BYTES) {
                throw new IOException("Article exceeds the download size limit");
            }
            output.write(buffer, 0, count);
        }
        return new String(output.toByteArray(), StandardCharsets.UTF_8);
    }

    private static String plainText(String source) {
        if (!HTML_TAG.matcher(source).find()) {
            return source.trim();
        }
        String withoutScripts = source.replaceAll("(?is)<(script|style)\\b[^>]*>.*?</\\1\\s*>", "");
        return HtmlCompat.fromHtml(withoutScripts, HtmlCompat.FROM_HTML_MODE_COMPACT)
            .toString().replace("\uFFFC", "").trim();
    }

    void save(Article article) {
        ContentValues fields = new ContentValues();
        fields.put("id", article.id);
        fields.put("title", article.title);
        fields.put("body", article.body);
        fields.put("saved_at", System.currentTimeMillis());
        getWritableDatabase().replaceOrThrow("articles", null, fields);
    }

    List<ArticleTitle> list() {
        List<ArticleTitle> saved = new ArrayList<>();
        try (Cursor rows = getReadableDatabase().query("articles", new String[]{"id", "title"},
                null, null, null, null, "saved_at DESC, id DESC")) {
            while (rows.moveToNext()) {
                saved.add(new ArticleTitle(rows.getLong(0), rows.getString(1)));
            }
        }
        return saved;
    }

    Article read(long id) {
        try (Cursor rows = getReadableDatabase().query("articles", new String[]{"title", "body"},
                "id = ?", new String[]{Long.toString(id)}, null, null, null)) {
            return rows.moveToFirst() ? new Article(id, rows.getString(0), rows.getString(1)) : null;
        }
    }

    void remove(long id) {
        getWritableDatabase().delete("articles", "id = ?", new String[]{Long.toString(id)});
    }

    static final class ArticleTitle {
        final long id;
        final String title;

        ArticleTitle(long id, String title) {
            this.id = id;
            this.title = title;
        }

        @Override
        public String toString() {
            return title;
        }
    }

    static final class Article {
        final long id;
        final String title;
        final String body;

        Article(long id, String title, String body) {
            this.id = id;
            this.title = title;
            this.body = body;
        }
    }
}

package com.digipartner.digiapp;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import com.digipartner.digiapp.plugins.DigiWidgetPlugin;
import com.digipartner.digiapp.plugins.DigiAlarmPlugin;
import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "DigiApp";
    private Thread.UncaughtExceptionHandler previousExceptionHandler;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DigiWidgetPlugin.class);
        registerPlugin(DigiAlarmPlugin.class);
        super.onCreate(savedInstanceState);
        createPushNotificationChannel();
        installCrashLogger();

        // WebView renderer crashes (OOM, native fault inside Chromium) are NOT
        // Java exceptions — Android's default behavior when onRenderProcessGone
        // returns false is to silently kill the whole app process, which looks
        // to the user like "the app just closes by itself". Recreating the
        // activity here reloads the WebView instead of losing the app entirely.
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                Log.e(TAG, "WebView render process gone (crashed=" + detail.didCrash() + ") — recreating activity");
                writeCrashLog("WebView render process gone. didCrash=" + detail.didCrash()
                    + " rendererPriorityAtExit=" + detail.rendererPriorityAtExit());
                recreate();
                return true;
            }
        });
    }

    // FCM remote push notifications land on this channel when the app is
    // backgrounded (id referenced by the manifest's default_notification_channel_id).
    private void createPushNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null && manager.getNotificationChannel("digiapp_push") == null) {
                NotificationChannel channel = new NotificationChannel(
                    "digiapp_push",
                    "DigiApp Notifications",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Push notifications from DigiApp");
                manager.createNotificationChannel(channel);
            }
        }
    }

    // Captures native (Java/Kotlin) uncaught exceptions to a file under the
    // app's external files dir — reachable with any file manager app on
    // Android 11+ without special permissions (no adb needed), at
    // Android/data/com.digipartner.digiapp/files/digiapp_crash.txt. Logs and
    // writes the file, then defers to the previous handler so process teardown
    // still happens normally (we don't try to "resume" after a real crash).
    private void installCrashLogger() {
        previousExceptionHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            try {
                StringWriter sw = new StringWriter();
                throwable.printStackTrace(new PrintWriter(sw));
                Log.e(TAG, "Uncaught exception on thread " + thread.getName() + ":\n" + sw);
                writeCrashLog("Uncaught exception on thread " + thread.getName() + ":\n" + sw);
            } catch (Throwable ignored) {
                // Never let the crash logger itself cause a secondary crash.
            }
            if (previousExceptionHandler != null) {
                previousExceptionHandler.uncaughtException(thread, throwable);
            }
        });
    }

    private void writeCrashLog(String message) {
        try {
            File dir = getExternalFilesDir(null);
            if (dir == null) return;
            File file = new File(dir, "digiapp_crash.txt");
            String timestamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date());
            try (FileWriter writer = new FileWriter(file, false)) {
                writer.write("[" + timestamp + "]\n" + message + "\n");
            }
        } catch (Throwable ignored) {
            // Best-effort only.
        }
    }
}

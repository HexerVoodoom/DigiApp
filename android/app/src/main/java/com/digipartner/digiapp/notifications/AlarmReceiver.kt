package com.digipartner.digiapp.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.digipartner.digiapp.R
import com.digipartner.digiapp.plugins.DigiAlarmPlugin
import com.digipartner.digiapp.widget.WidgetRenderer

class AlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.getBooleanExtra(EXTRA_WIDGET_RESET, false)) {
            resetWidgetTasks(context)
            // One-shot alarm — re-arm for tomorrow so it keeps firing without the app reopening.
            DigiAlarmPlugin.scheduleAlarmInternal(context, WIDGET_RESET_ID, "", "", "00:01", widgetReset = true)
            return
        }

        val title = intent.getStringExtra(EXTRA_TITLE) ?: "DigiApp"
        val body = intent.getStringExtra(EXTRA_BODY) ?: ""
        val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0)

        val notificationManager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        createChannelIfNeeded(notificationManager)

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(notificationId, notification)
    }

    private fun resetWidgetTasks(context: Context) {
        context.getSharedPreferences(WidgetRenderer.PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putInt("completed_tasks", 0).apply()
        WidgetRenderer.updateAll(context)
    }

    private fun createChannelIfNeeded(manager: NotificationManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "DigiApp Alarms",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Alarm notifications for DigiApp tasks"
                }
                manager.createNotificationChannel(channel)
            }
        }
    }

    companion object {
        const val CHANNEL_ID = "digiapp_alarms"
        const val EXTRA_TITLE = "title"
        const val EXTRA_BODY = "body"
        const val EXTRA_NOTIFICATION_ID = "notification_id"
        const val EXTRA_WIDGET_RESET = "widget_reset"
        const val WIDGET_RESET_ID = "widget-daily-reset"
    }
}

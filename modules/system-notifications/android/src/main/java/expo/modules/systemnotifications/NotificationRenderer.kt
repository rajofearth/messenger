package expo.modules.systemnotifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.IconCompat
import org.json.JSONObject

internal object NotificationRenderer {
  val channels = mapOf(
    "incoming" to "system_incoming_calls_v1",
    "calls" to "system_active_calls_v1",
    "messages" to "system_messages_v1",
    // Android fixes a channel's sound at creation, so a silent twin is the only
    // way to honour a sound preference after the loud channel exists.
    "messagesSilent" to "system_messages_silent_v1"
  )

  /** Channel used for a message, honouring the app's sound preference. */
  fun messageChannel(silent: Boolean) = if (silent) "messagesSilent" else "messages"

  fun createChannels(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannels(listOf(
      NotificationChannel(channels.getValue("incoming"), "Incoming calls", NotificationManager.IMPORTANCE_HIGH),
      NotificationChannel(channels.getValue("calls"), "Active calls", NotificationManager.IMPORTANCE_LOW),
      NotificationChannel(channels.getValue("messages"), "Messages", NotificationManager.IMPORTANCE_HIGH),
      NotificationChannel(channels.getValue("messagesSilent"), "Silent messages", NotificationManager.IMPORTANCE_HIGH)
        .apply { setSound(null, null) }
    ))
  }

  fun permissionGranted(context: Context) = Build.VERSION.SDK_INT < 33 ||
    ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

  fun channelEnabled(context: Context, channel: String): Boolean = Build.VERSION.SDK_INT < 26 ||
    context.getSystemService(NotificationManager::class.java)
      .getNotificationChannel(channels.getValue(channel))?.importance != NotificationManager.IMPORTANCE_NONE

  fun blocked(context: Context, channel: String): Map<String, Any>? {
    createChannels(context)
    if (!permissionGranted(context) || !NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      return mapOf("posted" to false, "reason" to "permissionDenied")
    }
    if (!channelEnabled(context, channel)) return mapOf("posted" to false, "reason" to "channelBlocked")
    return null
  }

  private fun person(context: Context, json: JSONObject): Person {
    val builder = Person.Builder().setName(json.getString("name")).setKey(json.getString("id"))
    // Decode a bounded local thumbnail. Never fetch remote images or use an unbounded full-size decode.
    runCatching {
      val uri = Uri.parse(json.optString("avatarUri"))
      if (uri.scheme == "file" || uri.scheme == "content") {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (bounds.outWidth / sample > 256 || bounds.outHeight / sample > 256) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        context.contentResolver.openInputStream(uri)?.use {
          BitmapFactory.decodeStream(it, null, options)?.let { bitmap ->
            builder.setIcon(IconCompat.createWithBitmap(bitmap))
          }
        }
      }
    }
    return builder.build()
  }

  private fun base(context: Context, channel: String) = NotificationCompat.Builder(context, channels.getValue(channel))
    .setSmallIcon(R.drawable.system_notification)
    .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
    .setOnlyAlertOnce(true)

  fun postCall(context: Context, data: JSONObject) {
    val id = data.getString("callId")
    val token = data.getString("token")
    val state = data.getString("state")
    val caller = person(context, data.getJSONObject("person"))
    val incoming = state == "incoming"
    val builder = base(context, if (incoming) "incoming" else "calls")
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(if (incoming) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_LOW)
      .setContentTitle(caller.name)
      .setContentText(when (state) { "incoming" -> "Incoming call"; "outgoing" -> "Calling…"; else -> "Call in progress" })
      .setContentIntent(NotificationActions.intent(context, "openCall", id, token))
      .setOngoing(true)
      .addPerson(caller)
    val style = if (incoming) NotificationCompat.CallStyle.forIncomingCall(
      caller, NotificationActions.intent(context, "decline", id, token),
      NotificationActions.intent(context, "answer", id, token)
    ) else NotificationCompat.CallStyle.forOngoingCall(
      caller, NotificationActions.intent(context, "hangup", id, token)
    )
    builder.setStyle(style.setIsVideo(data.optBoolean("video")))
    if (incoming) builder.setTimeoutAfter(data.optLong("timeoutMs", 60000))
    if (state == "ongoing") {
      builder.setWhen(data.getLong("connectedAt")).setUsesChronometer(true).setShowWhen(true)
    } else builder.setShowWhen(false)
    // CallStyle allows two extra actions for ongoing calls, but not all system UIs show them.
    if (!incoming) {
      if (data.optBoolean("allowMute")) builder.addAction(
        0, if (data.optBoolean("muted")) "Unmute" else "Mute",
        NotificationActions.intent(context, "setMuted", id, token, !data.optBoolean("muted"))
      )
      if (data.optBoolean("allowSpeaker")) builder.addAction(
        0, if (data.optBoolean("speaker")) "Speaker off" else "Speaker on",
        NotificationActions.intent(context, "setSpeaker", id, token, !data.optBoolean("speaker"))
      )
    }
    NotificationManagerCompat.from(context).notify("call:$id", 1, builder.build())
  }

  fun postMessage(context: Context, data: JSONObject) {
    val id = data.getString("conversationId")
    val token = data.getString("token")
    val style = NotificationCompat.MessagingStyle(person(context, data.getJSONObject("self")))
      .setGroupConversation(data.optBoolean("isGroup"))
    if (data.optBoolean("isGroup") && data.has("title")) style.setConversationTitle(data.getString("title"))
    val messages = data.getJSONArray("messages")
    for (index in maxOf(0, messages.length() - 25) until messages.length()) {
      val message = messages.getJSONObject(index)
      style.addMessage(message.getString("text"), message.getLong("timestamp"),
        message.optJSONObject("sender")?.let { person(context, it) })
    }
    val reply = NotificationCompat.Action.Builder(0, "Reply", NotificationActions.intent(context, "reply", id, token))
      .addRemoteInput(RemoteInput.Builder(NotificationActions.REPLY).setLabel("Reply").build())
      .setAllowGeneratedReplies(true)
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
      .build()
    val builder = base(context, messageChannel(data.optBoolean("silent")))
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setStyle(style)
      .setContentIntent(NotificationActions.intent(context, "openConversation", id, token))
      .setAutoCancel(true)
      .addAction(reply)
      .addAction(NotificationCompat.Action.Builder(0, "Mark read", NotificationActions.intent(context, "read", id, token))
        .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ).build())
      .addAction(0, "Mute", NotificationActions.intent(context, "muteConversation", id, token))
    if (data.optBoolean("replyQueued")) builder.setSubText("Reply queued. Open app to send.")
    NotificationManagerCompat.from(context).notify("message:$id", 1, builder.build())
  }
}

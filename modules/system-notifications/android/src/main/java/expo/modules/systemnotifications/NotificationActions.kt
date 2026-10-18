package expo.modules.systemnotifications

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import org.json.JSONObject

internal object NotificationActions {
  @Volatile var listener: ((Map<String, Any?>) -> Unit)? = null
  const val REPLY = "system_notification_reply"
  private val allowed = setOf(
    "answer", "decline", "hangup", "setMuted", "setSpeaker", "reply", "read", "muteConversation",
    "openCall", "openConversation"
  )

  fun intent(context: Context, type: String, target: String, token: String, value: Boolean? = null): PendingIntent {
    val activity = type in setOf("answer", "openCall", "openConversation")
    val intent = Intent(context, if (activity) NotificationActionActivity::class.java
      else NotificationActionReceiver::class.java).apply {
      action = "${context.packageName}.systemnotifications.$type"
      // Extras are NOT part of PendingIntent identity. Include the target, generation and toggle value.
      data = Uri.Builder().scheme("system-notifications").authority(type)
        .appendPath(target).appendPath(token).appendPath(value?.toString() ?: "").build()
      putExtra("type", type)
      putExtra("target", target)
      putExtra("token", token)
      if (value != null) putExtra("value", value)
    }
    val mutability = if (type == "reply" && Build.VERSION.SDK_INT >= 31)
      PendingIntent.FLAG_MUTABLE else if (type == "reply") 0 else PendingIntent.FLAG_IMMUTABLE
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or mutability
    return if (activity) PendingIntent.getActivity(context, 0, intent, flags)
      else PendingIntent.getBroadcast(context, 0, intent, flags)
  }

  @Synchronized fun handle(context: Context, intent: Intent): Boolean {
    val type = intent.getStringExtra("type") ?: return false
    if (type !in allowed) return false
    val target = intent.getStringExtra("target") ?: return false
    val call = type in setOf("answer", "decline", "hangup", "setMuted", "setSpeaker", "openCall")
    val key = (if (call) "call:" else "message:") + target
    val state = NotificationStore.get(context, key) ?: return false
    if (state.optString("token") != intent.getStringExtra("token")) return false
    if (type == "answer" && state.optString("state") != "incoming") return false
    if (call && state.optString("state") == "incoming" &&
      state.optLong("expiresAt", Long.MAX_VALUE) <= System.currentTimeMillis()) {
      NotificationStore.put(context, key, null)
      NotificationManagerCompat.from(context).cancel(key, 1)
      return false
    }
    val action = JSONObject().put("type", type)
      .put(if (call) "callId" else "conversationId", target)
    if (type == "setMuted" || type == "setSpeaker") {
      action.put("value", intent.getBooleanExtra("value", false))
    }
    if (type == "reply") {
      val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(REPLY)?.toString()
      if (text.isNullOrBlank()) return false
      action.put("text", text.take(8000))
    }
    val event = NotificationStore.enqueue(context, action)
    // Presentation changes are not confirmations from the call engine or message transport.
    when (type) {
      "decline", "hangup", "read", "muteConversation" -> {
        if (type == "muteConversation") {
          NotificationStore.put(context, "muted:$target", JSONObject().put("muted", true))
        }
        NotificationStore.put(context, key, null)
        NotificationManagerCompat.from(context).cancel(key, 1)
      }
      "reply" -> {
        state.put("replyQueued", true)
        NotificationStore.put(context, key, state)
        runCatching { NotificationRenderer.postMessage(context, state) }
      }
    }
    // A failing/tearing-down JS runtime must not lose the durable action or crash the receiver.
    runCatching { listener?.invoke(event) }
    return true
  }
}

class NotificationActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    NotificationActions.handle(context, intent)
  }
}

/** A direct activity PendingIntent, never a receiver/service notification trampoline. */
class NotificationActionActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (savedInstanceState == null && NotificationActions.handle(this, intent)) {
      packageManager.getLaunchIntentForPackage(packageName)?.let {
        it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        startActivity(it)
      }
    }
    finish()
  }
}

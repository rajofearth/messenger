package expo.modules.systemnotifications

import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.util.UUID

class SystemNotificationsModule : Module() {
  private val context: Context get() = appContext.reactContext ?: error("React context unavailable")
  private val actionListener: (Map<String, Any?>) -> Unit = { sendEvent("onAction", it) }

  override fun definition() = ModuleDefinition {
    Name("SystemNotifications")
    Events("onAction")

    OnCreate { NotificationActions.listener = actionListener }
    OnDestroy {
      if (NotificationActions.listener === actionListener) NotificationActions.listener = null
    }

    AsyncFunction("getStatus") {
      NotificationRenderer.createChannels(context)
      mapOf(
        "permissionGranted" to NotificationRenderer.permissionGranted(context),
        "notificationsEnabled" to NotificationManagerCompat.from(context).areNotificationsEnabled(),
        "channels" to NotificationRenderer.channels.keys.associateWith { NotificationRenderer.channelEnabled(context, it) }
      )
    }

    AsyncFunction("showCall") { payload: Map<String, Any?> ->
      synchronized(NotificationActions) {
        val data = JSONObject(payload)
        val id = requireId(data, "callId")
        requirePerson(data.getJSONObject("person"))
        val state = data.getString("state")
        require(state in setOf("incoming", "outgoing", "ongoing")) { "Invalid call state" }
        if (state == "ongoing") require(data.optLong("connectedAt") in 1..System.currentTimeMillis()) {
          "ongoing calls require connectedAt in Unix milliseconds, not in the future"
        }
        if (state == "incoming") require(data.optLong("timeoutMs", 60000) in 1000..300000) {
          "timeoutMs must be between 1000 and 300000"
        }
        val blocked = NotificationRenderer.blocked(context, if (state == "incoming") "incoming" else "calls")
        if (blocked != null) blocked else {
          val previous = NotificationStore.get(context, "call:$id")
          // A generation change invalidates incoming answer intents after connecting.
          val token = if (previous?.optString("state") == state) previous.getString("token")
            else UUID.randomUUID().toString()
          data.put("token", token)
          if (state == "incoming") data.put("expiresAt", System.currentTimeMillis() + data.optLong("timeoutMs", 60000))
          NotificationStore.put(context, "call:$id", data)
          NotificationRenderer.postCall(context, data)
          mapOf("posted" to true)
        }
      }
    }

    AsyncFunction("dismissCall") { id: String -> dismiss("call:", id) }

    AsyncFunction("showMessage") { payload: Map<String, Any?> ->
      synchronized(NotificationActions) {
        val data = JSONObject(payload)
        val id = requireId(data, "conversationId")
        requirePerson(data.getJSONObject("self"))
        val messages = data.getJSONArray("messages")
        require(messages.length() in 1..100) { "Provide between 1 and 100 messages" }
        for (index in 0 until messages.length()) {
          val message = messages.getJSONObject(index)
          require(message.getString("text").length in 1..8000) { "Invalid message text length" }
          require(message.getLong("timestamp") > 0) { "Invalid message timestamp" }
          message.optJSONObject("sender")?.let { requirePerson(it) }
        }
        if (NotificationStore.get(context, "muted:$id")?.optBoolean("muted") == true) {
          mapOf("posted" to false, "reason" to "conversationMuted")
        } else {
          val blocked = NotificationRenderer.blocked(context, NotificationRenderer.messageChannel(data.optBoolean("silent")))
          if (blocked != null) blocked else {
            // Keep the conversation generation stable until dismissed, so replies remain usable on updates.
            val previous = NotificationStore.get(context, "message:$id")
            data.put("token", previous?.optString("token") ?: UUID.randomUUID().toString())
            val retained = org.json.JSONArray()
            for (index in maxOf(0, messages.length() - 25) until messages.length()) retained.put(messages.get(index))
            data.put("messages", retained)
            NotificationStore.put(context, "message:$id", data)
            NotificationRenderer.postMessage(context, data)
            mapOf("posted" to true)
          }
        }
      }
    }

    AsyncFunction("dismissConversation") { id: String -> dismiss("message:", id) }
    AsyncFunction("setConversationMuted") { id: String, muted: Boolean ->
      synchronized(NotificationActions) {
        require(id.isNotBlank() && id.length <= 256) { "Invalid conversationId" }
        NotificationStore.put(context, "muted:$id", if (muted) JSONObject().put("muted", true) else null)
        if (muted) dismiss("message:", id)
      }
    }
    AsyncFunction("getPendingActions") { NotificationStore.pending(context) }
    AsyncFunction("acknowledgeActions") { ids: List<String> -> NotificationStore.acknowledge(context, ids) }

    AsyncFunction("openSettings") { channel: String? ->
      val intent = if (Build.VERSION.SDK_INT >= 26 && channel != null) {
        require(channel in NotificationRenderer.channels) { "Unknown notification channel" }
        Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
          .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
          .putExtra(Settings.EXTRA_CHANNEL_ID, NotificationRenderer.channels.getValue(channel))
      } else Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  private fun dismiss(prefix: String, id: String) {
    synchronized(NotificationActions) {
      require(id.isNotBlank() && id.length <= 256) { "Invalid notification target" }
      NotificationStore.put(context, prefix + id, null)
      NotificationManagerCompat.from(context).cancel(prefix + id, 1)
    }
  }

  private fun requireId(data: JSONObject, key: String): String = data.getString(key).also {
    require(it.isNotBlank() && it.length <= 256) { "$key must contain 1 to 256 characters" }
  }

  private fun requirePerson(person: JSONObject) {
    requireId(person, "id")
    require(person.getString("name").isNotBlank() && person.getString("name").length <= 256) { "Invalid person name" }
  }
}

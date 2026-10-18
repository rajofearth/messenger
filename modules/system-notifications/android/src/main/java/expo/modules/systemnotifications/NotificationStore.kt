package expo.modules.systemnotifications

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** One process, one lock. commit() completes before an action is emitted or the receiver exits. */
internal object NotificationStore {
  private fun prefs(context: Context) =
    context.getSharedPreferences("system-notifications-v1", Context.MODE_PRIVATE)

  @Synchronized fun get(context: Context, key: String): JSONObject? =
    prefs(context).getString(key, null)?.let { JSONObject(it) }

  @Synchronized fun put(context: Context, key: String, value: JSONObject?) {
    val editor = prefs(context).edit()
    if (value == null) editor.remove(key) else editor.putString(key, value.toString())
    check(editor.commit()) { "Could not persist notification state" }
  }

  @Synchronized fun pending(context: Context): List<Map<String, Any?>> {
    val array = JSONArray(prefs(context).getString("actions", "[]"))
    return (0 until array.length()).map { toMap(array.getJSONObject(it)) }
  }

  @Synchronized fun enqueue(context: Context, action: JSONObject): Map<String, Any?> {
    action.put("id", UUID.randomUUID().toString())
    action.put("createdAt", System.currentTimeMillis())
    val array = JSONArray(prefs(context).getString("actions", "[]"))
    array.put(action)
    check(prefs(context).edit().putString("actions", array.toString()).commit()) {
      "Could not persist notification action"
    }
    return toMap(action)
  }

  @Synchronized fun acknowledge(context: Context, ids: List<String>) {
    val keep = pending(context).filterNot { it["id"] in ids }.map { JSONObject(it) }
    check(prefs(context).edit().putString("actions", JSONArray(keep).toString()).commit()) {
      "Could not acknowledge notification actions"
    }
  }

  fun toMap(json: JSONObject): Map<String, Any?> = json.keys().asSequence().associateWith {
    when (val value = json.get(it)) {
      JSONObject.NULL -> null
      is JSONObject -> toMap(value)
      is JSONArray -> (0 until value.length()).map { index -> value.get(index) }
      else -> value
    }
  }
}

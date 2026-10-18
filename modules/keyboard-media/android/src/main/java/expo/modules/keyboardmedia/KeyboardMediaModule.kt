package expo.modules.keyboardmedia

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.inputmethod.InputMethodManager
import androidx.core.view.ContentInfoCompat
import androidx.core.view.ViewCompat
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.IllegalViewOperationException
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.views.textinput.ReactEditText
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

class KeyboardMediaModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private val bindings = mutableMapOf<String, Binding>()
  private val mounts = MountAwaiter<ReactEditText>(
    { main.postDelayed(it, 16L) },
    { main.removeCallbacks(it) },
  )
  private val worker = ThreadPoolExecutor(
    1, 1, 0L, TimeUnit.MILLISECONDS, ArrayBlockingQueue(4)
  )
  private val mimeTypes = arrayOf(
    "image/gif", "image/webp", "image/png", "image/jpeg", "video/mp4"
  )

  private class Binding(val id: String, val view: ReactEditText)

  override fun definition() = ModuleDefinition {
    Name("KeyboardMedia")
    Events("onMedia", "onMediaError")

    AsyncFunction("attach") { tag: Int, id: String, promise: Promise ->
      remove(id)
      mounts.start(id, lookup = {
        val context = appContext.reactContext as? ReactContext
          ?: error("React context unavailable")
        val manager = UIManagerHelper.getUIManagerForReactTag(context, tag)
          ?: error("Fabric UIManager unavailable")
        // A JS ref can exist before Fabric's UI-thread mount transaction runs.
        // RN 0.86 returns null for an unknown surface and throws for a missing view.
        val candidate = try {
          manager.resolveView(tag)
        } catch (_: IllegalViewOperationException) {
          null
        }
        if (candidate == null) null
        else candidate as? ReactEditText
          ?: error("Expected ReactEditText for tag $tag, got ${candidate.javaClass.name}")
      }, ready = { view ->
        bind(id, view)
        promise.resolve()
      }, failed = { error ->
        promise.reject("ERR_KEYBOARD_MEDIA_ATTACH", "Cannot attach keyboard media to tag $tag: ${error.message}", error)
      })
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("detach") { id: String -> remove(id) }.runOnQueue(Queues.MAIN)

    OnDestroy {
      main.post {
        mounts.clear()
        bindings.keys.toList().forEach { remove(it) }
        // Drain accepted work so its permission-bearing payload is retained through copying.
        worker.shutdown()
      }
    }
  }

  private fun bind(id: String, view: ReactEditText) {
    check(bindings.values.none { it.view === view }) { "Input already registered" }
    check(ViewCompat.getOnReceiveContentMimeTypes(view) == null) {
      "Input already has a receive-content listener"
    }
    val binding = Binding(id, view)
    bindings[id] = binding

    ViewCompat.setOnReceiveContentListener(view, mimeTypes) { _, payload ->
      if (!view.isEnabled || view.keyListener == null) {
        payload
      } else {
        // Preserve ordinary text paste. Unsupported URI items are returned to Android.
        val split = payload.partition { item ->
          item.uri?.let { it.scheme == "content" } == true &&
            mimeTypes.any { payload.clip.description.hasMimeType(it) }
        }
        split.first?.let { accepted -> receive(binding, accepted) }
        split.second
      }
    }
    // autoFocus may have opened a connection before this asynchronous registration.
    if (view.hasFocus()) restart(view)
  }

  private fun restart(view: ReactEditText) {
    (view.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
      .restartInput(view)
  }

  private fun remove(id: String) {
    mounts.cancel(id)
    val binding = bindings.remove(id) ?: return

    ViewCompat.setOnReceiveContentListener(binding.view, null, null)
    if (binding.view.isAttachedToWindow && binding.view.hasFocus()) restart(binding.view)
  }

  private fun receive(binding: Binding, payload: ContentInfoCompat) {
    try {
      worker.execute {
        // Keep the complete payload alive until every stream is closed. Android/AppCompat
        // acquires IME URI grants before invoking this listener, including the commit flags.
        synchronized(payload) {
        for (index in 0 until payload.clip.itemCount) {
          val uri = payload.clip.getItemAt(index).uri ?: continue
          var cleanupFile: File? = null
          try {
            val resolver = binding.view.context.contentResolver
            val mime = resolver.getType(uri)?.lowercase()
              ?: mimeTypes.firstOrNull { payload.clip.description.hasMimeType(it) }
              ?: error("Missing MIME type")
            require(mime in mimeTypes) { "Unsupported MIME type" }
            val extension = when (mime) {
              "image/gif" -> "gif"
              "image/webp" -> "webp"
              "image/png" -> "png"
              "image/jpeg" -> "jpg"
              else -> "mp4"
            }
            val directory = File(binding.view.context.cacheDir, "keyboard-media")
            check(directory.isDirectory || directory.mkdirs()) { "Cannot create media cache" }
            val target = File(directory, "${UUID.randomUUID()}.$extension")
            cleanupFile = target
            resolver.openInputStream(uri).use { input ->
              requireNotNull(input) { "Cannot open content URI" }
              target.outputStream().use { output ->
                val buffer = ByteArray(32 * 1024)
                var total = 0L
                while (true) {
                  val count = input.read(buffer)
                  if (count < 0) break
                  total += count
                  require(total <= 25L * 1024 * 1024) { "Media exceeds 25 MiB" }
                  output.write(buffer, 0, count)
                }
                require(total > 0) { "Empty media" }
              }
            }
            val result = mutableMapOf<String, Any?>(
              "id" to binding.id, "uri" to Uri.fromFile(target).toString(), "mimeType" to mime
            )
            if (mime.startsWith("image/")) {
              val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
              BitmapFactory.decodeFile(target.absolutePath, options)
              require(options.outWidth > 0 && options.outHeight > 0 && options.outMimeType == mime) {
                "Invalid image or MIME mismatch"
              }
              result["width"] = options.outWidth
              result["height"] = options.outHeight
            } else {
              // Do not decode or transcode animated content. Validate MP4's file-type box.
              val header = ByteArray(12)
              val count = target.inputStream().use { it.read(header) }
              require(count == 12 && String(header, 4, 4, Charsets.US_ASCII) == "ftyp") {
                "Invalid MP4"
              }
            }
            main.post {
              if (bindings[binding.id] === binding) sendEvent("onMedia", result)
              else target.delete()
            }
          } catch (error: Exception) {
            cleanupFile?.delete()
            report(binding, error.message ?: "Cannot read keyboard media")
          }
        }
        }
        // The monitor keeps the permission-bearing payload reachable through all reads.
        // Android releases its grants when the payload is no longer retained.
      }
    } catch (_: java.util.concurrent.RejectedExecutionException) {
      report(binding, "Keyboard media queue is full")
    }
  }

  private fun report(binding: Binding, message: String) {
    main.post {
      if (bindings[binding.id] === binding) {
        sendEvent("onMediaError", mapOf("id" to binding.id, "message" to message))
      }
    }
  }
}

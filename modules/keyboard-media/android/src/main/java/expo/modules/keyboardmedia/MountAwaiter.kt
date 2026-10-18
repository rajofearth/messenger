package expo.modules.keyboardmedia

/** Main-thread-only lookup shared by attach and its deterministic mount-order tests. */
internal class MountAwaiter<T : Any>(
  private val schedule: (Runnable) -> Unit,
  private val unschedule: (Runnable) -> Unit,
  private val maxAttempts: Int = 60,
) {
  private class Request(val task: Runnable, val failed: (Exception) -> Unit)
  private val pending = mutableMapOf<String, Request>()

  fun start(id: String, lookup: () -> T?, ready: (T) -> Unit, failed: (Exception) -> Unit) {
    cancel(id)
    var attempts = 0
    lateinit var request: Request
    val task = Runnable {
      if (pending[id] !== request) return@Runnable
      try {
        attempts++
        val view = lookup()
        if (view == null && attempts < maxAttempts) {
          schedule(request.task)
          return@Runnable
        }
        pending.remove(id)
        checkNotNull(view) { "React Native TextInput not mounted after $attempts attempts" }
        ready(view)
      } catch (error: Exception) {
        pending.remove(id)
        failed(error)
      }
    }
    request = Request(task, failed)
    pending[id] = request
    task.run()
  }

  fun cancel(id: String) {
    val request = pending.remove(id) ?: return
    unschedule(request.task)
    request.failed(IllegalStateException("TextInput attachment cancelled"))
  }

  fun clear() {
    pending.keys.toList().forEach(::cancel)
  }
}

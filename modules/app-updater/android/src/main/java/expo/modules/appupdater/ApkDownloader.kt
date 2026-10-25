package expo.modules.appupdater

import android.os.SystemClock
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/** A failure that maps to a stable code on the JavaScript side. */
internal class UpdateException(val code: String, message: String) : Exception(message) {
  companion object {
    const val CANCEL = "ERR_UPDATE_CANCEL"
    const val BUSY = "ERR_UPDATE_BUSY"
    const val HTTP = "ERR_UPDATE_HTTP"
    const val TOO_LARGE = "ERR_UPDATE_TOO_LARGE"
    const val CHECKSUM = "ERR_UPDATE_CHECKSUM"
    const val STORAGE = "ERR_UPDATE_STORAGE"
    const val MESSAGE = "ERR_UPDATE_MESSAGE"
    const val PATH = "ERR_UPDATE_PATH"
    const val PERMISSION = "ERR_UPDATE_PERMISSION"
    const val INSTALLER = "ERR_UPDATE_INSTALLER"
  }
}

/**
 * Downloads one APK into the updater's cache directory and checks it against
 * the digest published in the release manifest.
 *
 * The file name comes from the expected digest, never from the URL or the
 * manifest, so a hostile feed cannot choose where the app writes. An existing
 * file whose digest already matches is reused, which makes a cancelled
 * download cheap to retry. Everything happens on the caller's thread and
 * reports progress and cancellation through the arguments here, so this class
 * holds no Android state and stays easy to reason about.
 */
internal class ApkDownloader(
  private val directory: File,
  private val expectedSha256: String,
  /** Development builds may use a plain-http feed; release builds may not. */
  private val allowHttp: Boolean,
  private val onProgress: (downloaded: Long, total: Long) -> Unit,
) {
  private val target = File(directory, "update-${expectedSha256.take(12)}.apk")
  private val partial = File(directory, "${target.name}.part")
  private val cancelRequested = AtomicBoolean(false)

  @Volatile
  private var connection: HttpURLConnection? = null

  /** Stops the worker: disconnecting the socket is what unblocks a read. */
  fun cancel() {
    cancelRequested.set(true)
    connection?.disconnect()
  }

  /** Verified APK and whether it came from the cache instead of the network. */
  fun fetch(url: String, maxBytes: Long): Pair<File, Boolean> {
    if (!directory.isDirectory && !directory.mkdirs()) {
      throw UpdateException(UpdateException.STORAGE, "Cannot create the update cache")
    }
    if (target.isFile && target.length() > 0 && sha256(target) == expectedSha256) {
      onProgress(target.length(), target.length())
      return target to true
    }
    // Nothing here can be installed: a partial file, an older release, or a
    // file whose digest no longer matches its name. Clearing the directory also
    // removes whatever a killed process left behind before this attempt.
    directory.listFiles()?.forEach { it.delete() }

    val response = try {
      open(url)
    } catch (error: Exception) {
      if (cancelRequested.get()) throw cancelled()
      throw error
    }
    val digest = MessageDigest.getInstance("SHA-256")
    var downloaded = 0L
    try {
      val status = response.responseCode
      if (status != 200) {
        throw UpdateException(UpdateException.HTTP, "The update server answered HTTP $status")
      }
      val declared = response.contentLengthLong
      if (declared > maxBytes) throw tooLarge(maxBytes)
      val buffer = ByteArray(BUFFER_BYTES)
      FileOutputStream(partial).use { output ->
        response.inputStream.use { input ->
          while (true) {
            if (cancelRequested.get()) throw cancelled()
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, read)
            digest.update(buffer, 0, read)
            downloaded += read
            if (downloaded > maxBytes) throw tooLarge(maxBytes)
            report(downloaded, declared)
          }
        }
      }
    } catch (error: Throwable) {
      // Catch Throwable, not Exception: a killed worker or an Error must not
      // leave a partial file for the next launch to wonder about.
      partial.delete()
      // A real protocol/checksum failure must keep its code even when a cancel
      // arrives at the same moment; only an interrupted read is a cancel.
      if (cancelRequested.get() && error !is UpdateException) throw cancelled()
      throw error
    } finally {
      response.disconnect()
    }

    if (downloaded == 0L) {
      partial.delete()
      throw UpdateException(UpdateException.HTTP, "The update server sent an empty package")
    }
    val actual = digest.digest().joinToString("") { "%02x".format(it) }
    if (!actual.equals(expectedSha256, ignoreCase = true)) {
      partial.delete()
      throw UpdateException(
        UpdateException.CHECKSUM,
        "The downloaded package does not match the published checksum"
      )
    }
    if (!partial.renameTo(target)) {
      partial.delete()
      throw UpdateException(UpdateException.STORAGE, "Cannot store the downloaded package")
    }
    onProgress(downloaded, downloaded)
    return target to false
  }

  /**
   * Redirects are followed by hand: GitHub release assets answer with a
   * redirect to a signed CDN URL, and only http and https are ever allowed.
   */
  private fun open(url: String): HttpURLConnection {
    var address = URL(url)
    var redirects = 0
    while (true) {
      val open = address.openConnection() as HttpURLConnection
      open.instanceFollowRedirects = false
      open.connectTimeout = CONNECT_TIMEOUT_MS
      open.readTimeout = READ_TIMEOUT_MS
      open.setRequestProperty("User-Agent", USER_AGENT)
      open.setRequestProperty("Accept", "application/octet-stream")
      connection = open
      if (cancelRequested.get()) {
        open.disconnect()
        throw cancelled()
      }
      val status = try {
        open.responseCode
      } catch (error: Exception) {
        // The socket exists even when the connect or the status line fails, so
        // close it here instead of leaking it.
        open.disconnect()
        throw error
      }
      if (status !in 300..399) return open
      val location = open.getHeaderField("Location")
      open.disconnect()
      if (location == null || ++redirects > MAX_REDIRECTS) {
        throw UpdateException(UpdateException.HTTP, "The update server redirected too many times")
      }
      address = URL(address, location)
      if (address.protocol != "https" && !(allowHttp && address.protocol == "http")) {
        throw UpdateException(UpdateException.HTTP, "The update server redirected to ${address.protocol}://")
      }
    }
  }

  private fun report(downloaded: Long, total: Long) {
    val now = SystemClock.elapsedRealtime()
    if (downloaded < total && now - lastReported < PROGRESS_INTERVAL_MS) return
    lastReported = now
    onProgress(downloaded, total)
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(BUFFER_BYTES)
      while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        digest.update(buffer, 0, read)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private fun cancelled() = UpdateException(UpdateException.CANCEL, "Download cancelled")

  private fun tooLarge(maxBytes: Long) = UpdateException(
    UpdateException.TOO_LARGE,
    "The update package is larger than ${maxBytes / 1024 / 1024} MiB"
  )

  private var lastReported = 0L

  companion object {
    /** Bounds both the declared length and the bytes actually written. */
    const val MAX_APK_BYTES = 200L * 1024 * 1024
    private const val BUFFER_BYTES = 64 * 1024
    private const val CONNECT_TIMEOUT_MS = 15_000
    private const val READ_TIMEOUT_MS = 30_000
    private const val MAX_REDIRECTS = 5
    private const val PROGRESS_INTERVAL_MS = 200L
    private const val USER_AGENT = "Messenger-Updater"
  }
}

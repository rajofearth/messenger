package expo.modules.appupdater

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicReference

/**
 * Installs the APK releases of this app.
 *
 * The module never installs anything by itself: it reports whether Android
 * would allow a package install, downloads and verifies a release APK, and
 * hands that file to Android's package installer, which keeps asking the user
 * for confirmation. It also knows the version of the running app, which is the
 * only trustworthy way to tell that an update is still pending.
 */
class AppUpdaterModule : Module() {
  private val context: Context get() = appContext.reactContext ?: error("React context unavailable")
  private val worker = Executors.newSingleThreadExecutor()
  private val activeDownload = AtomicReference<ApkDownloader?>(null)

  override fun definition() = ModuleDefinition {
    Name("AppUpdater")
    Events("onDownloadProgress")

    AsyncFunction("getStatus") {
      sweepCache()
      val info = packageInfo(context)
      mapOf(
        "versionName" to (info.versionName ?: ""),
        "versionCode" to PackageInfoCompat.getLongVersionCode(info),
        "canInstall" to canInstall(context),
        "cachedBytes" to cachedBytes(context)
      )
    }

    AsyncFunction("downloadApk") { url: String, sha256: String, promise: Promise ->
      try {
        requireDownloadable(url)
        requireDigest(sha256)
        val downloader = ApkDownloader(
          updateDirectory(context),
          sha256.lowercase(),
          (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0,
        ) { downloaded, total ->
          sendEvent(
            "onDownloadProgress",
            mapOf("downloadedBytes" to downloaded, "totalBytes" to total)
          )
        }
        if (!activeDownload.compareAndSet(null, downloader)) {
          throw UpdateException(UpdateException.BUSY, "Another update download is already running")
        }
        try {
          worker.execute {
            try {
              val (file, reused) = downloader.fetch(url, ApkDownloader.MAX_APK_BYTES)
              promise.resolve(
                mapOf("path" to file.absolutePath, "bytes" to file.length(), "reused" to reused)
              )
            } catch (error: Throwable) {
              promise.failWith(error)
            } finally {
              activeDownload.compareAndSet(downloader, null)
            }
          }
        } catch (error: RejectedExecutionException) {
          activeDownload.compareAndSet(downloader, null)
          throw error
        }
      } catch (error: Throwable) {
        promise.failWith(error)
      }
    }

    AsyncFunction("cancelDownload") { activeDownload.get()?.also { it.cancel() } != null }

    /** Frees the cache once the installed build has caught up with the feed. */
    AsyncFunction("clearDownloads") {
      if (activeDownload.get() != null) {
        throw UpdateException(UpdateException.BUSY, "An update download is running")
      }
      val cleared = updateDirectory(context).listFiles()?.count { it.delete() } ?: 0
      prefs(context).edit().remove(KEY_INSTALL_ATTEMPT).apply()
      mapOf("deleted" to cleared)
    }

    AsyncFunction("installApk") { path: String, promise: Promise ->
      try {
        val file = updateFile(context, path)
        if (!canInstall(context)) {
          throw UpdateException(
            UpdateException.PERMISSION,
            "Android does not allow this app to install packages yet"
          )
        }
        val authority = "${context.packageName}.fileprovider"
        val uri = FileProvider.getUriForFile(context, authority, file)
        // Remember which build started the install. On the next launch the
        // installed version code decides whether it succeeded, so the cached
        // package is cleared even when that launch has no network.
        prefs(context).edit().putLong(KEY_INSTALL_ATTEMPT, installedVersionCode(context)).apply()
        val intent = Intent(Intent.ACTION_VIEW)
          .setDataAndType(uri, "application/vnd.android.package-archive")
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
          context.startActivity(intent)
        } catch (error: Exception) {
          throw UpdateException(
            UpdateException.INSTALLER,
            "No package installer could open the update",
          )
        }
        promise.resolve(mapOf("started" to true))
      } catch (error: Throwable) {
        promise.failWith(error)
      }
    }

    AsyncFunction("openInstallPermissionSettings") {
      val intent = if (Build.VERSION.SDK_INT >= 26) {
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
      } else {
        Intent(Settings.ACTION_SECURITY_SETTINGS)
      }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    AsyncFunction("openAppSettings") {
      context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }

    OnDestroy {
      activeDownload.get()?.cancel()
      worker.shutdown()
    }
  }

  /**
   * Clears what failed downloads and a finished install leave behind.
   *
   * A `.part` file only exists while a download is streaming, so anything left
   * at startup came from a process that was killed. A verified APK is kept on
   * purpose for a retry, and is deleted once the running version code is newer
   * than the build that started the install -- a local comparison, so it works
   * with no network and no feed. Android may delete the cache directory itself,
   * so a completed attempt is recorded as handled even with nothing to delete.
   */
  private fun sweepCache() {
    // A live download owns everything in this directory. Touching it here
    // would delete the streaming .part or the verified target mid-download.
    if (activeDownload.get() != null) return
    val directory = updateDirectory(context)
    val attempted = prefs(context).getLong(KEY_INSTALL_ATTEMPT, 0L)
    // The attempt is cleared even when Android already removed the directory,
    // so a later download is not mistaken for leftovers from that install.
    if (attempted in 1L until installedVersionCode(context)) {
      directory.listFiles()?.forEach { it.delete() }
      prefs(context).edit().remove(KEY_INSTALL_ATTEMPT).apply()
      return
    }
    if (!directory.isDirectory) return
    directory.listFiles()?.forEach { if (it.name.endsWith(PART_SUFFIX)) it.delete() }
  }

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  private fun installedVersionCode(context: Context): Long =
    PackageInfoCompat.getLongVersionCode(packageInfo(context))

  private fun Promise.failWith(error: Throwable) {
    val code = if (error is UpdateException) error.code else "ERR_APP_UPDATER"
    reject(code, error.message ?: "The update could not be completed", error)
  }

  private fun requireDownloadable(url: String) {
    val address = try {
      URL(url)
    } catch (error: Exception) {
      throw UpdateException(UpdateException.MESSAGE, "The update manifest contains an invalid URL")
    }
    val debuggable = (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    // Plain http is only for a development feed; a released build requires https.
    if (address.protocol != "https" && !(debuggable && address.protocol == "http")) {
      throw UpdateException(UpdateException.MESSAGE, "Update downloads must use https")
    }
    if (address.host.isNullOrEmpty()) {
      throw UpdateException(UpdateException.MESSAGE, "The update manifest contains an invalid URL")
    }
  }

  private fun requireDigest(sha256: String) {
    if (!DIGEST.matches(sha256)) {
      throw UpdateException(UpdateException.MESSAGE, "The update manifest contains an invalid checksum")
    }
  }

  private fun updateDirectory(context: Context) = File(context.cacheDir, "updates")

  /** Bytes already downloaded from an earlier launch, cached for display. */
  private fun cachedBytes(context: Context): Long =
    updateDirectory(context).listFiles()?.sumOf { if (it.isFile) it.length() else 0L } ?: 0L

  /** Only a package the updater itself downloaded can be installed. */
  private fun updateFile(context: Context, path: String): File {
    val directory = updateDirectory(context).canonicalFile
    val file = File(path).canonicalFile
    val name = file.name
    if (file.parentFile != directory || !name.startsWith("update-") || !name.endsWith(".apk")) {
      throw UpdateException(UpdateException.PATH, "That file is not a downloaded update package")
    }
    if (!file.isFile || file.length() <= 0) {
      throw UpdateException(UpdateException.PATH, "The downloaded update package is gone")
    }
    return file
  }

  /**
   * Android 8 and later have a per-app "install unknown apps" switch the app
   * can read. Android 7 only has a global unknown-sources setting, so there is
   * nothing to read and the installer itself guides the user.
   */
  private fun canInstall(context: Context): Boolean =
    Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()

  /** `getPackageInfo(String, Int)` is deprecated from API 33 in favour of flags. */
  @Suppress("DEPRECATION")
  private fun packageInfo(context: Context) =
    if (Build.VERSION.SDK_INT >= 33) {
      context.packageManager.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(0L))
    } else {
      context.packageManager.getPackageInfo(context.packageName, 0)
    }

  companion object {
    private val DIGEST = Regex("^[0-9a-fA-F]{64}$")
    private const val PREFERENCES = "app-updater"
    private const val KEY_INSTALL_ATTEMPT = "installAttemptVersionCode"
    private const val PART_SUFFIX = ".part"
  }
}

package expo.modules.mediathumbnails

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.ThumbnailUtils
import android.net.Uri
import android.os.Build
import android.util.Size
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest

/** Creates small on-disk thumbnails from Android MediaStore content URIs. */
class MediaThumbnailsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MediaThumbnails")

    AsyncFunction("getThumbnail") { source: String, size: Int ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return@AsyncFunction source
      val boundedSize = size.coerceIn(MIN_SIZE, MAX_SIZE)
      val context = appContext.reactContext?.applicationContext ?: return@AsyncFunction null
      val directory = File(context.cacheDir, DIRECTORY).apply { mkdirs() }
      val file = File(directory, "${cacheKey(source, boundedSize)}.jpg")
      if (file.isFile && file.length() > 0) return@AsyncFunction file.toUriString()

      val bitmap = loadThumbnail(context, source, boundedSize) ?: return@AsyncFunction null
      if (!file.parentFile!!.exists()) file.parentFile!!.mkdirs()
      if (!file.outputStream().use { output ->
          bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output)
        }) {
        file.delete()
        return@AsyncFunction null
      }
      prune(directory)
      file.toUriString()
    }
  }

  private fun loadThumbnail(context: Context, source: String, size: Int): Bitmap? {
    val uri = Uri.parse(source)
    if (uri.scheme == "file") {
      val file = File(uri.path ?: return null)
      return ThumbnailUtils.createVideoThumbnail(file, Size(size, size), null)
        ?: decodeImage(file, size)
    }
    return context.contentResolver.loadThumbnail(uri, Size(size, size), null)
  }

  private fun decodeImage(file: File, size: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    val sample = generateSample(bounds.outWidth, bounds.outHeight, size)
    return BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample })
  }

  private fun generateSample(width: Int, height: Int, size: Int): Int {
    var sample = 1
    while (width / (sample * 2) >= size && height / (sample * 2) >= size) sample *= 2
    return sample
  }

  private fun cacheKey(source: String, size: Int): String {
    val digest = MessageDigest.getInstance("SHA-256")
      .digest("$source:$size".toByteArray())
    return digest.joinToString("") { byte -> "%02x".format(byte) }
  }

  private fun prune(directory: File) {
    val files = directory.listFiles()?.filter { it.isFile } ?: return
    if (files.size <= MAX_FILES) return
    files.sortedBy { it.lastModified() }
      .take(files.size - KEEP_FILES)
      .forEach(File::delete)
  }

  private fun File.toUriString() = Uri.fromFile(this).toString()

  companion object {
    private const val DIRECTORY = "media-thumbnails"
    private const val JPEG_QUALITY = 82
    private const val MIN_SIZE = 96
    private const val MAX_SIZE = 384
    private const val MAX_FILES = 320
    private const val KEEP_FILES = 280
  }
}

package io.github.ricky2022.qyplayer

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import androidx.activity.enableEdgeToEdge
import java.io.File

/**
 * 播放器的主界面。
 *
 * 别的应用用“打开方式”把 .qyp 交过来时，这里把文件拷进缓存目录，再写下 received/pending.txt；
 * Rust 端盯着这个文件，换掉当前文件并通知网页打开它。整个流程不把包读进内存。
 */
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    // 启动时先清掉上次留下的缓存文件，再处理系统这次交来的文件
    clearReceived()
    receive(intent)
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    // 应用已经打开时再点一个文件：同一个界面接住，换掉正在播放的影片
    receive(intent)
  }

  /** 缓存里放系统交来的文件；Rust 端盯着收到的 pending.txt */
  private fun receivedDir(): File = File(cacheDir, "received")

  private fun clearReceived() {
    val dir = receivedDir()
    dir.listFiles()?.forEach { it.delete() }
  }

  /** 把别的应用发来的文件拷进缓存，然后写下 pending.txt 通知 Rust 端 */
  private fun receive(intent: Intent?) {
    val uri = intent?.data ?: return
    if (intent.action != Intent.ACTION_VIEW) return
    try {
      val dir = receivedDir()
      dir.mkdirs()
      val target = File(dir, System.currentTimeMillis().toString() + "-" + safeName(displayName(uri)))
      contentResolver.openInputStream(uri)?.use { input ->
        target.outputStream().use { output -> input.copyTo(output) }
      } ?: return
      File(dir, "pending.txt").writeText(target.absolutePath)
    } catch (e: Exception) {
      // 读不出来就当作没收到：界面留在首页，或继续播放原来那部影片
    }
  }

  /** 别的应用一般会在 URI 上给出显示名，用它做缓存文件名，播放器里显示的也是这个名字 */
  private fun displayName(uri: Uri): String? {
    if (uri.scheme == "content") {
      contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0)
      }
    }
    return uri.lastPathSegment
  }

  /** 只留下安全的字符，避免文件名里带路径 */
  private fun safeName(name: String?): String {
    val base = (name ?: "").substringAfterLast('/').substringAfterLast('\\')
    val cleaned = base.replace(Regex("[^\\p{L}\\p{N}._-]"), "_")
    return if (cleaned.isEmpty() || cleaned == "." || cleaned == "..") "received.qyp" else cleaned.take(120)
  }
}

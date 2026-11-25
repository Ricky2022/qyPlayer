package io.github.ricky2022.qyplayer

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.util.Log
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File

/**
 * 播放器的主界面。
 *
 * 别的应用用“打开方式”把 .qyp 交过来时，这里把文件拷进缓存目录，再写下 received/pending.txt；
 * Rust 端盯着这个文件，换掉当前文件并通知网页打开它。整个流程不把包读进内存。
 */
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    Log.i(TAG, "onCreate")
    enableEdgeToEdge()
    // 先让壳把 WebView 和 Rust 端启动起来；后面的文件处理即使出错也不影响启动
    super.onCreate(savedInstanceState)
    Log.i(TAG, "壳已启动")
    applySystemBarInsets()
    try {
      // 启动时先清掉上次留下的缓存文件，再处理系统这次交来的文件
      clearReceived()
      receive(intent)
    } catch (e: Exception) {
      Log.w(TAG, "处理系统交来的文件失败", e)
    }
  }

  /**
   * 边到边显示时，把状态栏、导航栏、刘海的高度让成内边距，网页里的控件就不会被系统栏压住。
   * 全屏时系统栏隐藏，这些值会变成 0，画面自然铺满。
   */
  private fun applySystemBarInsets() {
    val content = findViewById<android.view.View>(android.R.id.content) ?: return
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }

  /**
   * 系统默认要有一次点击才允许出声。影片里的视频经常在开播很久以后才出现，
   * 那时这次点击已经过期，play() 会被拒绝：画面靠不断定位还能动，但没有声音。
   */
  override fun onWebViewCreate(webView: WebView) {
    webView.settings.mediaPlaybackRequiresUserGesture = false
    super.onWebViewCreate(webView)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    // 应用已经打开时再点一个文件：同一个界面接住，换掉正在播放的影片
    try {
      receive(intent)
    } catch (e: Exception) {
      Log.w(TAG, "处理系统交来的文件失败", e)
    }
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
      Log.i(TAG, "已收到文件：${target.name}（${target.length()} 字节）")
    } catch (e: Exception) {
      // 读不出来就当作没收到：界面留在首页，或继续播放原来那部影片
      Log.w(TAG, "读取交来的文件失败", e)
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

  private companion object {
    const val TAG = "qyPlayer"
  }
}

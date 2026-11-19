// 启动守卫：一个独立的普通脚本，比页面主脚本先执行。
//
// 主脚本没加载、解析失败（老旧 WebView 常见）或运行时报错时，把原因直接画在页面上：
// 手机上没有控制台，拍一张屏幕照片就能定位。它只用到 ES5 语法，保证自己一定能跑。
(function () {
  var BOOT_ID = "qy-boot";
  var PANEL_ID = "qy-startup-error";
  var pending = [];

  function flush() {
    if (!document.body || pending.length === 0) return;
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("pre");
      panel.id = PANEL_ID;
      panel.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;margin:0;padding:16px;overflow:auto;" +
        "background:#0b1220;color:#f87171;font:12px/1.6 monospace;white-space:pre-wrap";
      document.body.appendChild(panel);
    }
    panel.textContent += pending.join("");
    pending = [];
  }

  function report(title, detail) {
    pending.push("[" + title + "]\n" + detail + "\n\n");
    flush();
  }

  function describe(value) {
    if (!value) return String(value);
    if (value.stack) return (value.name ? value.name + ": " : "") + value.message + "\n" + value.stack;
    return String(value);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", flush);
  else flush();

  window.addEventListener("error", function (event) {
    var target = event.target;
    // 资源（脚本、样式）加载失败时 event.message 是空的，用元素地址说明
    if (!event.message && target && target.src) {
      report("资源加载失败", target.src + "\n（如果这是主脚本，说明资源没有打进包或被 CSP 拦下了）");
      return;
    }
    report("error", (event.message || "unknown") + "\n" + (event.filename || "") + ":" + (event.lineno || 0) + "\n" + describe(event.error));
  }, true);

  window.addEventListener("unhandledrejection", function (event) {
    report("unhandled rejection", describe(event.reason));
  });

  // 四秒还没渲染完，说明主脚本没跑到底（或根本没加载）
  window.setTimeout(function () {
    if (window.__qyMounted) return;
    report(
      "没有启动",
      "界面脚本在 4 秒内没有渲染完成。\n" +
        "页面地址：" + location.href + "\n" +
        "浏览器：" + navigator.userAgent + "\n" +
        "Tauri 环境：" + ("__TAURI_INTERNALS__" in window ? "有" : "没有") + "\n" +
        "占位元素：" + (document.getElementById(BOOT_ID) ? "还在（主脚本没有执行）" : "已被替换（渲染出过错）")
    );
  }, 4000);
})();

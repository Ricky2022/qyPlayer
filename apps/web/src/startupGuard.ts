// 启动守卫：手机上没有控制台，界面起不来时把原因直接画在页面上，拍张照片就能定位。
//
// 模块加载时立刻装好监听（main.tsx 的第一行 import 就是它），
// 覆盖三种情况：页面里只剩 index.html 的“正在载入”占位（脚本没执行）、
// 模块初始化或渲染时抛错、以及四秒后仍未渲染完成。

const BOOT_ID = "qy-boot";

/** 把一段说明追加到页面最上层（不依赖 React） */
function report(title: string, detail: string): void {
  if (typeof document === "undefined" || !document.body) return;
  let panel = document.getElementById("qy-startup-error");
  if (!panel) {
    panel = document.createElement("pre");
    panel.id = "qy-startup-error";
    panel.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;margin:0;padding:16px;overflow:auto;" +
      "background:#0b1220;color:#f87171;font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap";
    document.body.appendChild(panel);
  }
  panel.textContent += `[${title}]\n${detail}\n\n`;
}

function describe(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}\n${reason.stack ?? ""}`;
  return String(reason);
}

declare global {
  interface Window {
    /** 界面已经渲染完成（用它判断是不是卡在启动阶段） */
    __qyMounted?: boolean;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    report("error", `${event.message}\n${event.filename ?? ""}:${event.lineno ?? 0}\n${describe(event.error)}`);
  });

  window.addEventListener("unhandledrejection", (event) => {
    report("unhandled rejection", describe(event.reason));
  });

  // 四秒还没渲染完，说明脚本没跑到底（或根本没加载）
  window.setTimeout(() => {
    if (window.__qyMounted) return;
    report(
      "没有启动",
      `界面脚本在 4 秒内没有渲染完成。\n页面地址：${location.href}\n` +
        `Tauri 环境：${"__TAURI_INTERNALS__" in window ? "有" : "没有"}\n` +
        `占位元素：${document.getElementById(BOOT_ID) ? "还在（脚本没执行）" : "已被替换（渲染出过错）"}`,
    );
  }, 4000);
}

export {};


import { onBackButtonPress, exit } from "@tauri-apps/api/app";
import { useEffect } from "react";
import { isDesktop } from "./desktop";

/**
 * 是否运行在 Android 壳里。
 *
 * 手机上的行为（返回键逐级返回、播放时屏幕常亮、文件选择器不限类型）只在这里生效，
 * 网页版和 Windows 版不受影响。壳里跑的是系统 WebView，UA 里一定带 Android。
 */
export function isAndroidShell(): boolean {
  return isDesktop() && typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

/** 返回键的处理者：返回 true 表示这一级已经处理，不再往上走 */
type BackHandler = () => boolean;

const handlers: BackHandler[] = [];
let installed = false;

/**
 * 注册一级返回。注册得越晚越先被调用（最后进入的界面先退）。
 * 返回注销函数。
 */
export function onBack(handler: BackHandler): () => void {
  handlers.push(handler);
  installBackButton();
  return () => {
    const index = handlers.indexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

/**
 * 接管 Android 的返回键。
 *
 * 注册处理者以后壳就不再自己后退或退出，由这里决定：有登记的处理者就交给最上面那一级，
 * 都在首页（没有处理者）时退出应用，和系统默认的行为一致。
 */
export function installBackButton(): void {
  if (installed || !isAndroidShell()) return;
  installed = true;
  void onBackButtonPress(() => {
    for (const handler of [...handlers].reverse()) {
      if (handler()) return;
    }
    void exit(0);
  }).catch(() => {
    // 拿不到返回键事件就退回系统默认行为：什么也不做，让它自己退出
    installed = false;
  });
}

/**
 * 播放时让屏幕保持常亮，暂停或结束时释放。
 *
 * 用网页的 Wake Lock 接口。页面切到后台时浏览器会自动释放，回到前台再申请一次。
 * 接口不存在或被拒绝时什么也不做（真机上表现为屏幕照常自动熄灭）。
 */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !isAndroidShell()) return;
    let sentinel: WakeLockSentinel | undefined;
    let stopped = false;

    const request = async (): Promise<void> => {
      const wakeLock = navigator.wakeLock;
      if (!wakeLock) return;
      try {
        const acquired = await wakeLock.request("screen");
        if (stopped) {
          void acquired.release().catch(() => undefined);
          return;
        }
        sentinel = acquired;
      } catch {
        // 用户拒绝了、省电模式拦下了：不影响播放
      }
    };

    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible" && !sentinel) void request();
    };

    void request();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release().catch(() => undefined);
      sentinel = undefined;
    };
  }, [active]);
}

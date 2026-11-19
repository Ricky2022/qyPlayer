import { createRoot } from "react-dom/client";
import { installBackButton } from "./android";
import { App } from "./App";
import { I18nProvider } from "./i18n";

// 开发时 /?demo 自动打开一个程序生成的演示包，免去每次手动选文件
const demo = import.meta.env.DEV && new URLSearchParams(location.search).has("demo");
const initialSource = demo ? async () => (await import("./dev/demoPackage")).buildDemoPackage() : undefined;

createRoot(document.getElementById("root")!).render(
  <I18nProvider title={(t) => t("appName")}>
    <App {...(initialSource && { initialSource })} />
  </I18nProvider>,
);

// 页面里的 boot-guard.js 在 4 秒后检查这个标记：没有它就把“没有启动”画在屏幕上
window.__qyMounted = true;

// Android：返回键由界面自己处理（全屏 → 播放中 → 首页，首页再按退出应用）。
// 放在渲染之后，接管失败也不影响界面显示。
try {
  installBackButton();
} catch (error) {
  console.warn("返回键接管失败", error);
}

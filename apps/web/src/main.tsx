import { createRoot } from "react-dom/client";
import { installBackButton } from "./android";
import { App } from "./App";
import { I18nProvider } from "./i18n";

// Android：返回键由界面自己处理（全屏 → 播放中 → 首页，首页再按退出应用）
installBackButton();

// 开发时 /?demo 自动打开一个程序生成的演示包，免去每次手动选文件
const demo = import.meta.env.DEV && new URLSearchParams(location.search).has("demo");
const initialSource = demo ? async () => (await import("./dev/demoPackage")).buildDemoPackage() : undefined;

createRoot(document.getElementById("root")!).render(
  <I18nProvider title={(t) => t("appName")}>
    <App {...(initialSource && { initialSource })} />
  </I18nProvider>,
);

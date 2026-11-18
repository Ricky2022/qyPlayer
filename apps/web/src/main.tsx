import { createRoot } from "react-dom/client";
import { App } from "./App";

// 开发时 /?demo 自动打开一个程序生成的演示包，免去每次手动选文件
const demo = import.meta.env.DEV && new URLSearchParams(location.search).has("demo");
const initialSource = demo ? async () => (await import("./dev/demoPackage")).buildDemoPackage() : undefined;

createRoot(document.getElementById("root")!).render(<App {...(initialSource && { initialSource })} />);

import { invoke } from "@tauri-apps/api/core";

/** 是否运行在 Tauri 桌面程序里（网页版为 false） */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 桌面程序：同步原生窗口的标题（网页里用 document.title，不需要它） */
export async function setWindowTitle(title: string): Promise<void> {
  if (isDesktop()) await invoke("set_title", { title });
}

/** 在系统浏览器里打开外部链接。桌面程序里由 Rust 端只放行本项目的网址 */
export async function openExternal(url: string): Promise<void> {
  if (isDesktop()) await invoke("open_url", { url });
  else window.open(url, "_blank", "noopener,noreferrer");
}

/** 桌面播放器：取出用户双击打开的 .qyp 文件（命令行参数）。没有则返回 null */
export async function readInitialFile(): Promise<File | null> {
  if (!isDesktop()) return null;
  const path = await invoke<string | null>("initial_file");
  if (!path) return null;
  const bytes = await invoke<ArrayBuffer>("read_file", { path });
  return new File([bytes], path.split(/[\\/]/).pop() ?? "film.qyp");
}

function downloadInBrowser(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // 给浏览器一点时间开始下载再释放
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * 保存文件：网页里走浏览器下载；桌面程序里弹出系统「另存为」对话框。
 * 用户在对话框里取消时不报错。
 */
export async function saveBlob(blob: Blob, fileName: string): Promise<void> {
  if (!isDesktop()) {
    downloadInBrowser(blob, fileName);
    return;
  }
  // 文件名放在请求头里（需百分号编码），文件内容作为原始字节体
  await invoke("save_file", new Uint8Array(await blob.arrayBuffer()), {
    headers: { "x-file-name": encodeURIComponent(fileName) },
  });
}

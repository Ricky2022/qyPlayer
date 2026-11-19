import { invoke } from "@tauri-apps/api/core";
import type { ByteSource } from "@qyplayer/qyp";

/** 是否运行在 Tauri 桌面程序里（网页版为 false） */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 壳交给播放器的那个文件：只有文件名、大小和按偏移读取，网页拿不到它的路径 */
export interface ShellFile {
  readonly name: string;
  readonly source: ByteSource;
}

/** 手机壳（Android）收到别的应用发来的新文件时发这个事件，载荷是 (文件名, 字节数) */
export const RECEIVED_FILE_EVENT = "qyp-file-received";

/** 用文件名和大小构造壳文件的来源：启动参数和“收到文件”的事件共用同一条读取路径 */
export function shellFile(name: string, size: number): ShellFile {
  return {
    name,
    source: {
      size,
      async read(offset: number, length: number): Promise<Uint8Array> {
        return new Uint8Array(await invoke<ArrayBuffer>("read_range", { offset, length }));
      },
    },
  };
}

/** 桌面程序：同步原生窗口的标题（网页里用 document.title，不需要它） */
export async function setWindowTitle(title: string): Promise<void> {
  if (isDesktop()) await invoke("set_title", { title });
}

/** 在系统浏览器里打开外部链接。桌面程序里由 Rust 端只放行本项目的网址 */
export async function openExternal(url: string): Promise<void> {
  if (!isDesktop()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  // 手机上打不开也不该让界面报错：关于页的链接点不开就算了
  try {
    await invoke("open_url", { url });
  } catch {
    // 忽略
  }
}

/**
 * 桌面和手机壳：取出系统交给播放器的那个 .qyp（桌面是双击文件，手机是别的应用发来的）。
 * 没有则返回 null。内容按偏移读取，整个包不进内存（PRD N-PERF-04）。
 */
export async function readInitialFile(): Promise<ShellFile | null> {
  if (!isDesktop()) return null;
  // 命令返回 (文件名, 字节数)；网页只拿得到这两样，读内容要按范围要
  const info = await invoke<[string, number] | null>("initial_file");
  if (!info) return null;
  return shellFile(info[0], info[1]);
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
 * 返回是否真的保存了：用户在对话框里取消时不报错，返回 false。网页下载无法得知用户是否取消，总是返回 true。
 */
export async function saveBlob(blob: Blob, fileName: string): Promise<boolean> {
  if (!isDesktop()) {
    downloadInBrowser(blob, fileName);
    return true;
  }
  // 文件名放在请求头里（需百分号编码），文件内容作为原始字节体
  const saved = await invoke<boolean>("save_file", new Uint8Array(await blob.arrayBuffer()), {
    headers: { "x-file-name": encodeURIComponent(fileName) },
  });
  return saved;
}

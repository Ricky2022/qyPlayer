/** 底部缩略图条是否显示，保存在 localStorage 的键，取值 "on" 或 "off"；没有保存过就是不显示 */
export const FILMSTRIP_STORAGE_KEY = "qy.filmstrip";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function safeLocalStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function loadFilmstripSetting(storage: StorageLike | undefined = safeLocalStorage()): boolean {
  try {
    return storage?.getItem(FILMSTRIP_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function saveFilmstripSetting(on: boolean, storage: StorageLike | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(FILMSTRIP_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // 隐私模式等拿不到存储时，这次选择只在当前页面有效
  }
}

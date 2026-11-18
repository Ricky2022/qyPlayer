// 制作器的运行环境判断、转码开关的默认值与保存、手机的素材总量限制（docs/dev-0.3.0.md 5.1、5.2、5.3）。

export interface EnvironmentInfo {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** `navigator.userAgentData?.mobile`；浏览器不提供时缺省 */
  mobileHint?: boolean;
}

/** 是否手机浏览器：满足任一即是；新 iPad 伪装成 Mac，靠触点数识别 */
export function isMobileEnvironment(info: EnvironmentInfo): boolean {
  if (info.mobileHint === true) return true;
  if (/Android|iPhone|iPad|iPod/.test(info.userAgent)) return true;
  return info.platform === "MacIntel" && info.maxTouchPoints > 1;
}

export interface TranscodeCapabilities {
  videoEncode: boolean;
  audioEncode: boolean;
}

/** 转码开关的默认值：电脑且能编码视频时开，手机关，不能编码视频时关 */
export function defaultTranscode(env: { mobile: boolean; videoEncode: boolean }): boolean {
  return !env.mobile && env.videoEncode;
}

/** 用户保存过的选择优先于默认值；但不能编码视频时强制关 */
export function resolveTranscode(env: { mobile: boolean; videoEncode: boolean; stored: string | null }): boolean {
  if (!env.videoEncode) return false;
  if (env.stored === "on") return true;
  if (env.stored === "off") return false;
  return defaultTranscode(env);
}

/** 开关下方小字的类型：不能转码的说明优先于手机的说明；电脑上没有说明 */
export type TranscodeNote = "none" | "mobile" | "unsupported";

export function transcodeNote(env: { mobile: boolean; videoEncode: boolean }): TranscodeNote {
  if (!env.videoEncode) return "unsupported";
  return env.mobile ? "mobile" : "none";
}

/** 开关保存在 localStorage 的键，取值 "on" 或 "off" */
export const TRANSCODE_STORAGE_KEY = "qy.transcode";

export interface TextStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadStoredTranscode(storage: TextStorage | undefined = safeLocalStorage()): string | null {
  try {
    return storage?.getItem(TRANSCODE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveStoredTranscode(on: boolean, storage: TextStorage | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(TRANSCODE_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // 隐私模式等拿不到存储时，这次选择只在当前页面有效
  }
}

function safeLocalStorage(): TextStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

// ---------- 手机的素材总量限制（5.3） ----------

const MB = 1024 * 1024;
/** 累计原始文件大小超过它时提示（T-22） */
export const MOBILE_WARN_BYTES = 300 * MB;
/** 超过它之后不再添加（T-23） */
export const MOBILE_MAX_BYTES = 600 * MB;

export type MobileSizeLevel = "ok" | "warn";

/** 素材累计大小的提示等级：超过 300 MB 提示（刚好 300 MB 不提示） */
export function mobileSizeLevel(totalBytes: number): MobileSizeLevel {
  return totalBytes > MOBILE_WARN_BYTES ? "warn" : "ok";
}

/** 再加一个 fileBytes 的文件会不会让总量超过 600 MB（刚好 600 MB 可以） */
export function exceedsMobileLimit(totalBytes: number, fileBytes: number): boolean {
  return totalBytes + fileBytes > MOBILE_MAX_BYTES;
}

// ---------- 浏览器里的探测 ----------

export function detectEnvironment(): EnvironmentInfo {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    ...(nav.userAgentData?.mobile !== undefined && { mobileHint: nav.userAgentData.mobile }),
  };
}

let capabilities: Promise<TranscodeCapabilities> | undefined;

/** 转码能力，启动时探测一次并缓存。没有 VideoEncoder（例如旧 Safari）时两项都是假 */
export function detectCapabilities(): Promise<TranscodeCapabilities> {
  capabilities ??= probeCapabilities();
  return capabilities;
}

async function probeCapabilities(): Promise<TranscodeCapabilities> {
  const none = { videoEncode: false, audioEncode: false };
  if (typeof VideoEncoder === "undefined") return none;
  const supported = async (check: () => Promise<{ supported?: boolean }>): Promise<boolean> => {
    try {
      return (await check()).supported === true;
    } catch {
      return false;
    }
  };
  const videoEncode = await supported(() =>
    VideoEncoder.isConfigSupported({ codec: "avc1.640028", width: 1920, height: 1080, bitrate: 8_000_000, framerate: 30 }),
  );
  const audioEncode =
    typeof AudioEncoder === "undefined"
      ? false
      : await supported(() => AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 }));
  return { videoEncode, audioEncode };
}

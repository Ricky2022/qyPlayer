import { describe, expect, it } from "vitest";
import {
  MOBILE_MAX_BYTES,
  MOBILE_WARN_BYTES,
  TRANSCODE_STORAGE_KEY,
  defaultTranscode,
  exceedsMobileLimit,
  isMobileEnvironment,
  loadStoredTranscode,
  mobileSizeLevel,
  resolveTranscode,
  saveStoredTranscode,
  transcodeNote,
  type TextStorage,
} from "./environment";

const WINDOWS_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

describe("isMobileEnvironment（5.1）", () => {
  it("Windows 电脑不是手机，带触屏的笔记本也不是", () => {
    expect(isMobileEnvironment({ userAgent: WINDOWS_CHROME, platform: "Win32", maxTouchPoints: 0 })).toBe(false);
    expect(isMobileEnvironment({ userAgent: WINDOWS_CHROME, platform: "Win32", maxTouchPoints: 10 })).toBe(false);
  });

  it("Android、iPhone、iPad、iPod 的用户代理是手机", () => {
    expect(isMobileEnvironment({ userAgent: ANDROID_CHROME, platform: "Linux armv8l", maxTouchPoints: 5 })).toBe(true);
    expect(isMobileEnvironment({ userAgent: IPHONE_SAFARI, platform: "iPhone", maxTouchPoints: 5 })).toBe(true);
    expect(isMobileEnvironment({ userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)", platform: "iPad", maxTouchPoints: 5 })).toBe(true);
    expect(isMobileEnvironment({ userAgent: "Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)", platform: "iPod", maxTouchPoints: 5 })).toBe(true);
  });

  it("新 iPad 伪装成 Mac：MacIntel 且触点数大于 1 才算手机", () => {
    expect(isMobileEnvironment({ userAgent: IPAD_AS_MAC, platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isMobileEnvironment({ userAgent: IPAD_AS_MAC, platform: "MacIntel", maxTouchPoints: 1 })).toBe(false);
    expect(isMobileEnvironment({ userAgent: IPAD_AS_MAC, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
  });

  it("userAgentData.mobile 为真就是手机，为假不改变其他规则的结果", () => {
    expect(isMobileEnvironment({ userAgent: WINDOWS_CHROME, platform: "Win32", maxTouchPoints: 0, mobileHint: true })).toBe(true);
    expect(isMobileEnvironment({ userAgent: WINDOWS_CHROME, platform: "Win32", maxTouchPoints: 0, mobileHint: false })).toBe(false);
    expect(isMobileEnvironment({ userAgent: ANDROID_CHROME, platform: "Linux", maxTouchPoints: 5, mobileHint: false })).toBe(true);
  });
});

describe("转码开关的默认值（5.2）", () => {
  it.each([
    [{ mobile: false, videoEncode: true }, true],
    [{ mobile: true, videoEncode: true }, false],
    [{ mobile: false, videoEncode: false }, false],
    [{ mobile: true, videoEncode: false }, false],
  ])("%j → %s", (env, expected) => {
    expect(defaultTranscode(env)).toBe(expected);
  });

  it("用户保存过的选择优先于默认值", () => {
    expect(resolveTranscode({ mobile: false, videoEncode: true, stored: "off" })).toBe(false);
    expect(resolveTranscode({ mobile: true, videoEncode: true, stored: "on" })).toBe(true);
  });

  it("不能编码视频时强制关，即使保存的是开", () => {
    expect(resolveTranscode({ mobile: false, videoEncode: false, stored: "on" })).toBe(false);
  });

  it("没有保存或保存的值无效时用默认值", () => {
    expect(resolveTranscode({ mobile: false, videoEncode: true, stored: null })).toBe(true);
    expect(resolveTranscode({ mobile: false, videoEncode: true, stored: "yes" })).toBe(true);
    expect(resolveTranscode({ mobile: true, videoEncode: true, stored: "yes" })).toBe(false);
  });

  it("说明文字：不能转码优先，其次手机，电脑没有", () => {
    expect(transcodeNote({ mobile: false, videoEncode: true })).toBe("none");
    expect(transcodeNote({ mobile: true, videoEncode: true })).toBe("mobile");
    expect(transcodeNote({ mobile: false, videoEncode: false })).toBe("unsupported");
    expect(transcodeNote({ mobile: true, videoEncode: false })).toBe("unsupported");
  });
});

describe("开关的保存", () => {
  const memoryStorage = (): TextStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
  };

  it("键是 qy.transcode，值是 on 或 off", () => {
    const storage = memoryStorage();
    saveStoredTranscode(true, storage);
    expect(storage.data.get(TRANSCODE_STORAGE_KEY)).toBe("on");
    expect(TRANSCODE_STORAGE_KEY).toBe("qy.transcode");
    saveStoredTranscode(false, storage);
    expect(loadStoredTranscode(storage)).toBe("off");
  });

  it("存储不可用或抛错时不崩溃", () => {
    const broken: TextStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadStoredTranscode(broken)).toBeNull();
    expect(() => saveStoredTranscode(true, broken)).not.toThrow();
  });
});

describe("手机的素材总量限制（5.3）", () => {
  it("300 MB 的提示线：刚好 300 MB 不提示，多 1 字节提示", () => {
    expect(MOBILE_WARN_BYTES).toBe(300 * 1024 * 1024);
    expect(mobileSizeLevel(MOBILE_WARN_BYTES)).toBe("ok");
    expect(mobileSizeLevel(MOBILE_WARN_BYTES + 1)).toBe("warn");
  });

  it("600 MB 的上限：刚好 600 MB 可以，多 1 字节拒绝", () => {
    expect(MOBILE_MAX_BYTES).toBe(600 * 1024 * 1024);
    expect(exceedsMobileLimit(0, MOBILE_MAX_BYTES)).toBe(false);
    expect(exceedsMobileLimit(0, MOBILE_MAX_BYTES + 1)).toBe(true);
    expect(exceedsMobileLimit(MOBILE_MAX_BYTES - 10, 10)).toBe(false);
    expect(exceedsMobileLimit(MOBILE_MAX_BYTES - 10, 11)).toBe(true);
  });
});

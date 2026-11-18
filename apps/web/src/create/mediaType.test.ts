import { describe, expect, it } from "vitest";
import { audioMimeType, baseMimeType, extensionForMimeType, imageMimeType, MIME_TYPE_PATTERN, withCodecs } from "./mediaType";

describe("extensionForMimeType（4.3 的扩展名表）", () => {
  it.each([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"],
    ["image/heic", ".heic"],
    ["image/heif", ".heif"],
    ["image/avif", ".avif"],
    ["video/mp4; codecs=\"avc1.640028, mp4a.40.2\"", ".mp4"],
    ["video/quicktime; codecs=\"hvc1.2.4.l120.b0, mp4a.40.2\"", ".mov"],
    ["audio/mpeg", ".mp3"],
    ["audio/mp4; codecs=\"mp4a.40.2\"", ".m4a"],
    ["audio/wav", ".wav"],
  ])("%s → %s", (mimeType, extension) => {
    expect(extensionForMimeType(mimeType)).toBe(extension);
  });

  it("表里没有的类型返回 undefined", () => {
    expect(extensionForMimeType("video/webm")).toBeUndefined();
    expect(extensionForMimeType("image/gif")).toBeUndefined();
  });
});

describe("withCodecs", () => {
  it("编码转小写并用逗号加空格连接", () => {
    expect(withCodecs("video/quicktime", ["hvc1.2.4.L120.B0", "mp4a.40.2"])).toBe('video/quicktime; codecs="hvc1.2.4.l120.b0, mp4a.40.2"');
  });

  it("取不到的编码省略；全取不到时不带 codecs 参数", () => {
    expect(withCodecs("video/mp4", ["avc1.640028", null])).toBe('video/mp4; codecs="avc1.640028"');
    expect(withCodecs("video/mp4", [null, undefined])).toBe("video/mp4");
  });

  it("生成的写法都符合 4.3 的正则", () => {
    for (const value of [withCodecs("video/mp4", ["avc1.640028", "mp4a.40.2"]), withCodecs("video/quicktime", ["hvc1.2.4.L120.B0"]), withCodecs("audio/mp4", ["mp4a.40.2"]), "image/heic"]) {
      expect(value).toMatch(MIME_TYPE_PATTERN);
    }
  });
});

describe("imageMimeType", () => {
  it("扩展名优先，大小写不敏感", () => {
    expect(imageMimeType("IMG_0001.HEIC", "")).toBe("image/heic");
    expect(imageMimeType("a.jpeg", "application/octet-stream")).toBe("image/jpeg");
    expect(imageMimeType("a.avif", "")).toBe("image/avif");
  });

  it("没有可识别的扩展名时看浏览器给的类型；都不认返回 undefined", () => {
    expect(imageMimeType("noext", "image/png")).toBe("image/png");
    expect(imageMimeType("a.gif", "image/gif")).toBeUndefined();
  });
});

describe("audioMimeType", () => {
  it("MP3、M4A、WAV", () => {
    expect(audioMimeType("a.mp3")).toBe("audio/mpeg");
    expect(audioMimeType("a.M4A")).toBe('audio/mp4; codecs="mp4a.40.2"');
    expect(audioMimeType("a.wav")).toBe("audio/wav");
    expect(audioMimeType("a.ogg")).toBeUndefined();
  });
});

describe("baseMimeType", () => {
  it("去掉参数并转小写", () => {
    expect(baseMimeType('Video/MP4; codecs="avc1"')).toBe("video/mp4");
  });
});

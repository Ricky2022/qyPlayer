import { describe, expect, it } from "vitest";
import { openPackage } from "@qyplayer/qyp";
import { buildPackage, type MediaEntry } from "./buildPackage";

const original = (mimeType: string) => ({ mimeType, source: { mimeType, transcoded: false } });
const MP4 = 'video/mp4; codecs="avc1.640028, mp4a.40.2"';

function photo(name: string, width: number, height: number, capturedAt?: string): MediaEntry {
  return { fileName: name, type: "image", ...original("image/jpeg"), blob: new Blob([name]), width, height, ...(capturedAt && { capturedAt }) };
}

const video: MediaEntry = { fileName: "clip.mp4", type: "video", ...original(MP4), blob: new Blob(["video"]), width: 1920, height: 1080, duration: 12, hasAudio: true };

describe("buildPackage", () => {
  it("builds a package that opens, with sequential in-package paths instead of user file names", async () => {
    const { blob, manifest } = await buildPackage({
      media: [photo("我的照片 (1).jpg", 1600, 1067), video, photo("b.jpg", 1600, 1067)],
      templateId: "classic",
      seed: 1,
    });
    expect(manifest.assets.map((a) => a.src)).toEqual(["media/m001.jpg", "media/m002.mp4", "media/m003.jpg"]);

    const opened = await openPackage(blob);
    expect(await (await opened.readBlob("media/m001.jpg")).text()).toBe("我的照片 (1).jpg");
    expect(await (await opened.readBlob("media/m002.mp4")).text()).toBe("video");
    await opened.close();
  });

  it("keeps the list order instead of re-sorting by capture time", async () => {
    const { manifest } = await buildPackage({
      media: [photo("late.jpg", 1600, 1067, "2026-05-01T00:00:00Z"), photo("early.jpg", 1600, 1067, "2026-01-01T00:00:00Z")],
      templateId: "clean",
      seed: 3,
    });
    expect(manifest.assets.map((a) => a.id)).toEqual(["m001", "m002"]);
    expect(manifest.assets[0]?.capturedAt).toBe("2026-05-01T00:00:00Z");
  });

  it("uses a trimmed custom title, or the default title when blank", async () => {
    const base = { media: [photo("a.jpg", 1600, 1067, "2026-03-04T10:00:00Z")], templateId: "clean", seed: 1 };
    expect((await buildPackage({ ...base, title: "  春游  " })).manifest.title).toBe("春游");
    expect((await buildPackage({ ...base, title: "   " })).manifest.title).toBe("2026-03-04 回忆");
    expect((await buildPackage(base)).manifest.title).toBe("2026-03-04 回忆");
    expect((await buildPackage({ ...base, defaultTitleWord: "Memories" })).manifest.title).toBe("2026-03-04 Memories");
  });

  it("picks the aspect ratio from the media unless one is given", async () => {
    const portraits = [photo("a.jpg", 1067, 1600), photo("b.jpg", 1067, 1600)];
    expect((await buildPackage({ media: portraits, templateId: "clean", seed: 1 })).manifest.canvas.aspectRatio).toBe("9:16");
    expect((await buildPackage({ media: portraits, templateId: "clean", seed: 1, aspectRatio: "16:9" })).manifest.canvas.aspectRatio).toBe("16:9");
  });

  it("adds the music file and a matching bgm entry", async () => {
    const { blob, manifest } = await buildPackage({
      media: [photo("a.jpg", 1600, 1067), photo("b.jpg", 1600, 1067)],
      music: { blob: new Blob(["music"]), mimeType: 'audio/mp4; codecs="mp4a.40.2"', duration: 20, title: "song", license: "CC0" },
      templateId: "clean",
      seed: 1,
    });
    expect(manifest.bgm?.assetId).toBe("bgm");
    expect(manifest.assets.find((a) => a.id === "bgm")).toMatchObject({ src: "audio/bgm.m4a", duration: 20, title: "song", license: "CC0" });
    const opened = await openPackage(blob);
    expect(await (await opened.readBlob("audio/bgm.m4a")).text()).toBe("music");
    await opened.close();
  });

  it("is deterministic for the same input and seed apart from id and time", async () => {
    const options = { media: [photo("a.jpg", 1600, 1067), photo("b.jpg", 1067, 1600), photo("c.jpg", 1600, 1067)], templateId: "lively", seed: 9 };
    const a = (await buildPackage(options)).manifest;
    const b = (await buildPackage(options)).manifest;
    expect({ ...a, id: "", createdAt: "" }).toEqual({ ...b, id: "", createdAt: "" });
  });

  it("surfaces generator errors such as an empty list", async () => {
    await expect(buildPackage({ media: [], templateId: "clean", seed: 1 })).rejects.toMatchObject({ code: "no-media" });
  });
});

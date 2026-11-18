import { describe, expect, it } from "vitest";
import { openPackage, writePackage } from "@qyplayer/qyp";
import { planPackage, type MediaEntry } from "./buildPackage";
import { COVER_PATH, coverTarget, withCover } from "./cover";

const MP4 = 'video/mp4; codecs="avc1.640028, mp4a.40.2"';

function photo(name: string): MediaEntry {
  return { fileName: name, type: "image", blob: new Blob([name]), mimeType: "image/jpeg", source: { mimeType: "image/jpeg", transcoded: false }, width: 1600, height: 1067 };
}

const movie: MediaEntry = { fileName: "clip.mp4", type: "video", blob: new Blob(["clip"]), mimeType: MP4, source: { mimeType: MP4, transcoded: false }, width: 1920, height: 1080, duration: 12, hasAudio: true };

describe("coverTarget", () => {
  it("取第一页第一个素材：图片", async () => {
    const { manifest, files } = planPackage({ media: [photo("first.jpg"), photo("second.jpg")], templateId: "clean", seed: 1 });
    const target = coverTarget(manifest, files)!;
    expect(target.type).toBe("image");
    const firstId = manifest.pages[0]!.items[0]!.assetId;
    expect(await target.blob.text()).toBe(firstId === "m001" ? "first.jpg" : "second.jpg");
  });

  it("第一个素材是视频：取 clipStart 处的帧", () => {
    const { manifest, files } = planPackage({ media: [movie, photo("a.jpg")], templateId: "classic", seed: 1 });
    const target = coverTarget(manifest, files)!;
    expect(target.type).toBe("video");
    expect(target.clipStart).toBe(manifest.pages[0]!.items[0]!.clipStart);
    expect(target.clipStart).toBeGreaterThan(0);
  });

  it("清单里没有页时返回 undefined", () => {
    const { manifest, files } = planPackage({ media: [photo("a.jpg")], templateId: "clean", seed: 1 });
    expect(coverTarget({ ...manifest, pages: [] }, files)).toBeUndefined();
  });
});

describe("withCover", () => {
  it("清单的 cover 指向 cover.jpg，包里有这个文件，包能正常打开", async () => {
    const { manifest, files } = planPackage({ media: [photo("a.jpg")], templateId: "clean", seed: 1 });
    expect(manifest.cover).toBeUndefined();
    const withIt = withCover(manifest, files, new Blob(["cover-bytes"]));
    expect(withIt.manifest.cover).toBe(COVER_PATH);

    const opened = await openPackage(await writePackage(withIt.manifest, withIt.files));
    expect(opened.manifest.cover).toBe("cover.jpg");
    expect(await (await opened.readBlob("cover.jpg")).text()).toBe("cover-bytes");
    await opened.close();
  });
});

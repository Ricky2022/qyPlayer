import { describe, expect, it } from "vitest";
import type { PagePlan } from "@qyplayer/core";
import { planPackage, planPagesFor, type MediaEntry } from "../buildPackage";
import { applyTranscoded } from "./patch";

const original = (mimeType: string) => ({ mimeType, source: { mimeType, transcoded: false } });
const photo = (name: string): MediaEntry => ({ fileName: name, type: "image", ...original("image/jpeg"), blob: new Blob([name]), width: 1600, height: 1067 });
const video: MediaEntry = { fileName: "clip.mov", type: "video", ...original("video/quicktime"), blob: new Blob(["video"]), width: 1920, height: 1080, duration: 30, hasAudio: true };

describe("applyTranscoded 与手动编排", () => {
  const base = { media: [photo("a.jpg"), video, photo("b.jpg")], templateId: "classic", seed: 3, aspectRatio: "16:9" } as const;

  it("视频转码裁成片段后，页里和 generator.plan 里该素材的 clipStart 都改为 0", () => {
    const plan = planPagesFor(base);
    const videoPage = plan.find((p) => p.items[0]!.clipStart !== undefined)!;
    videoPage.items[0]!.clipStart = 7;
    const { manifest, files } = planPackage({ ...base, pages: plan });
    const result = applyTranscoded(manifest, files, new Map([["m002", { blob: new Blob(["mp4"]), mimeType: "video/mp4", duration: 8 }]]));

    const pageItem = result.manifest.pages.flatMap((p) => p.items).find((i) => i.assetId === "m002")!;
    expect(pageItem.clipStart).toBe(0);
    const planned = (result.manifest.generator!.plan as PagePlan[]).flatMap((p) => p.items).find((i) => i.assetId === "m002")!;
    expect(planned.clipStart).toBe(0);
    // 其他素材和页的设置不变
    const others = (result.manifest.generator!.plan as PagePlan[]).flatMap((p) => p.items).filter((i) => i.assetId !== "m002");
    expect(others).toEqual(plan.flatMap((p) => p.items).filter((i) => i.assetId !== "m002"));
  });

  it("自动编排的包没有 generator.plan，转码后也不会多出来", () => {
    const { manifest, files } = planPackage(base);
    const result = applyTranscoded(manifest, files, new Map([["m002", { blob: new Blob(["mp4"]), mimeType: "video/mp4", duration: 8 }]]));
    expect(result.manifest.generator).not.toHaveProperty("plan");
  });
});

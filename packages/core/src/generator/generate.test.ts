import { describe, expect, it } from "vitest";
import type { Manifest } from "../manifest";
import { validateManifest } from "../validate";
import {
  GENERATOR_LIMITS,
  GenerateError,
  defaultAspectRatio,
  generateManifest,
  sortMedia,
  type GenerateOptions,
  type MediaInput,
  type MusicInput,
} from "./generate";
import { createRng } from "./rng";
import { TEMPLATES, findTemplate } from "./templates";

// ---------- 测试数据 ----------

const JPEG = "image/jpeg";
const MP4 = 'video/mp4; codecs="avc1.640028, mp4a.40.2"';
const M4A = 'audio/mp4; codecs="mp4a.40.2"';
const original = (mimeType: string): { mimeType: string; source: { mimeType: string; transcoded: false } } => ({ mimeType, source: { mimeType, transcoded: false } });

const FIXED = { id: "film-1", createdAt: "2026-11-18T10:00:00+08:00" } as const;

function photo(id: string, width: number, height: number, capturedAt?: string, fileName = `${id}.jpg`): MediaInput {
  return { id, type: "image", src: `media/${id}.jpg`, ...original(JPEG), fileName, width, height, ...(capturedAt && { capturedAt }) };
}

function video(id: string, duration: number, capturedAt?: string): MediaInput {
  return {
    id,
    type: "video",
    src: `media/${id}.mp4`,
    ...original(MP4),
    fileName: `${id}.mp4`,
    width: 1920,
    height: 1080,
    duration,
    hasAudio: true,
    ...(capturedAt && { capturedAt }),
  };
}

const music = (duration: number): MusicInput => ({ id: "a001", src: "audio/bgm.m4a", ...original(M4A), duration, title: "Track", license: "CC0-1.0" });

/** 第 i 张照片的拍摄时间，间隔 1 分钟 */
const at = (i: number): string => new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString();

function landscapePhotos(n: number, startAt = 0): MediaInput[] {
  return Array.from({ length: n }, (_, i) => photo(`m${String(startAt + i).padStart(3, "0")}`, 2560, 1707, at(startAt + i)));
}

function gen(overrides: Partial<GenerateOptions> & Pick<GenerateOptions, "media">): Manifest {
  return generateManifest({ aspectRatio: "16:9", templateId: "classic", seed: 1, ...FIXED, ...overrides });
}

function expectValid(m: Manifest): void {
  const result = validateManifest(m);
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
}

// ---------- 基础 ----------

describe("rng", () => {
  it("is deterministic per seed and differs across seeds", () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = Array.from({ length: 8 }, () => a.next());
    expect(Array.from({ length: 8 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 8 }, () => c.next())).not.toEqual(seqA);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it("weighted() never returns a zero-weight item and follows the weights roughly", () => {
    const rng = createRng(7);
    const counts = { a: 0, b: 0, never: 0 };
    for (let i = 0; i < 4000; i++) counts[rng.weighted([{ value: "a" as const, weight: 3 }, { value: "b" as const, weight: 1 }, { value: "never" as const, weight: 0 }])]++;
    expect(counts.never).toBe(0);
    expect(counts.a / counts.b).toBeGreaterThan(2.5);
    expect(counts.a / counts.b).toBeLessThan(3.5);
  });

  it("weighted() throws without a positive weight", () => {
    expect(() => createRng(1).weighted([{ value: 1, weight: 0 }])).toThrow();
  });
});

describe("templates", () => {
  it("ships three templates with usable weights", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(["clean", "lively", "classic"]);
    for (const t of TEMPLATES) {
      expect(t.sizeWeights[0]).toBeGreaterThan(0); // 单图页必须可选，分页算法依赖它
      expect(t.transitions.every((x) => x.weight > 0)).toBe(true);
      expect(t.enters.every((x) => x.weight > 0)).toBe(true);
      expect(t.name.zh).toBeTruthy();
      expect(t.name.en).toBeTruthy();
    }
    expect(findTemplate("nope")).toBeUndefined();
  });
});

describe("defaultAspectRatio (F-OPT-01)", () => {
  it("follows the majority orientation, landscape on ties", () => {
    expect(defaultAspectRatio([photo("a", 100, 200), photo("b", 100, 200), photo("c", 200, 100)])).toBe("9:16");
    expect(defaultAspectRatio([photo("a", 100, 200), photo("c", 200, 100)])).toBe("16:9");
    expect(defaultAspectRatio([photo("a", 200, 100)])).toBe("16:9");
    expect(defaultAspectRatio([photo("sq", 100, 100)])).toBe("16:9");
  });
});

// ---------- F-GEN-01 排序 ----------

describe("F-GEN-01 ordering", () => {
  it("sortMedia orders by capture time, then file name, then id; missing times go last", () => {
    const sorted = sortMedia([
      photo("z", 10, 10, at(5), "b.jpg"),
      photo("y", 10, 10, at(5), "a.jpg"),
      photo("x", 10, 10, undefined, "0.jpg"),
      photo("w", 10, 10, at(1), "z.jpg"),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(["w", "y", "z", "x"]);
  });

  /** 把页还原成连续的素材分块：每页的素材集合必须是排序序列中的连续一段 */
  function chunksOf(m: Manifest): string[][] {
    return m.pages.map((p) => p.items.map((i) => i.assetId));
  }

  it("generated pages follow ascending capture time even when input is shuffled", () => {
    const sortedIds = landscapePhotos(30).map((p) => p.id);
    const shuffled = [...landscapePhotos(30)].sort((a, b) => ((a.id.charCodeAt(2) * 7) % 11) - ((b.id.charCodeAt(2) * 7) % 11) || b.id.localeCompare(a.id));
    expect(shuffled.map((p) => p.id)).not.toEqual(sortedIds);
    const m = gen({ media: shuffled });
    let cursor = 0;
    for (const chunk of chunksOf(m)) {
      expect([...chunk].sort()).toEqual(sortedIds.slice(cursor, cursor + chunk.length));
      cursor += chunk.length;
    }
    expect(cursor).toBe(30);
  });

  it("keepOrder follows the supplied order instead of capture time", () => {
    const media = landscapePhotos(12);
    const manual = [media[5]!, media[0]!, ...media.filter((_, i) => i !== 5 && i !== 0)];
    const m = gen({ media: manual, keepOrder: true });
    const flat = m.pages.flatMap((p) => p.items.map((i) => i.assetId));
    let cursor = 0;
    for (const chunk of chunksOf(m)) {
      expect([...chunk].sort()).toEqual(manual.slice(cursor, cursor + chunk.length).map((x) => x.id).sort());
      cursor += chunk.length;
    }
    expect(flat).toHaveLength(12);
    expect(m.assets.map((a) => a.id)).toEqual(manual.map((x) => x.id));
  });
});

// ---------- F-GEN-02 分页 ----------

describe("F-GEN-02 paging", () => {
  it("every video has a page of its own, every page holds 1 to 4 items, all material is used once", () => {
    const media = [...landscapePhotos(7), video("v1", 6, at(7)), ...landscapePhotos(5, 8), video("v2", 20, at(13)), video("v3", 3, at(14))];
    for (const t of TEMPLATES) {
      const m = gen({ media, templateId: t.id });
      for (const page of m.pages) {
        expect(page.items.length).toBeGreaterThanOrEqual(1);
        expect(page.items.length).toBeLessThanOrEqual(4);
        const hasVideo = page.items.some((i) => m.assets.find((a) => a.id === i.assetId)?.type === "video");
        if (hasVideo) expect(page.items).toHaveLength(1);
      }
      const used = m.pages.flatMap((p) => p.items.map((i) => i.assetId)).sort();
      expect(used).toEqual(media.map((x) => x.id).sort());
      expectValid(m);
    }
  });

  it("never puts two multi-photo pages with the same photo count next to each other", () => {
    let multiPairs = 0;
    for (const t of TEMPLATES) {
      for (let seed = 1; seed <= 60; seed++) {
        const m = gen({ media: landscapePhotos(40), templateId: t.id, seed });
        for (let i = 1; i < m.pages.length; i++) {
          const a = m.pages[i - 1]!.items.length;
          const b = m.pages[i]!.items.length;
          if (a > 1 && b > 1) {
            multiPairs++;
            expect(a).not.toBe(b);
          }
        }
      }
    }
    expect(multiPairs).toBeGreaterThan(50); // 保证断言确实被执行过
  });

  it("templates differ in their share of single-photo pages", () => {
    const singles = (templateId: string): number => {
      let single = 0;
      let total = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const m = gen({ media: landscapePhotos(40), templateId, seed });
        total += m.pages.length;
        single += m.pages.filter((p) => p.items.length === 1).length;
      }
      return single / total;
    };
    expect(singles("clean")).toBeGreaterThan(singles("lively") + 0.2);
  });

  it("handles photo runs that cannot be split evenly and a single photo", () => {
    expectValid(gen({ media: landscapePhotos(1) }));
    expect(gen({ media: landscapePhotos(1) }).pages).toHaveLength(1);
    for (let n = 1; n <= 9; n++) expectValid(gen({ media: landscapePhotos(n), seed: n }));
  });
});

// ---------- F-GEN-03 / F-GEN-04 版式匹配与裁切 ----------

describe("F-GEN-03 layout matching", () => {
  it("puts the only portrait photo of a 3-photo 16:9 page into the tall cell", () => {
    let checked = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const media = Array.from({ length: 24 }, (_, i) => (i % 3 === 1 ? photo(`m${i}`, 1707, 2560, at(i)) : photo(`m${i}`, 2560, 1707, at(i))));
      const m = gen({ media, seed, templateId: "lively" });
      for (const page of m.pages) {
        if (page.items.length !== 3) continue;
        const portraits = page.items.filter((i) => m.assets.find((a) => a.id === i.assetId)!.height! > m.assets.find((a) => a.id === i.assetId)!.width!);
        if (portraits.length !== 1) continue;
        checked++;
        expect(portraits[0]!.frame.h).toBeGreaterThan(0.9); // 左侧通栏格子（四周有外边距）
        expect(portraits[0]!.frame.x).toBeLessThan(0.05);
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("matches photos to portrait cells in a 9:16 two-photo page by minimising crop", () => {
    // 9:16 的两图页是上下两个横向格子：两张横图都应该保持 cover
    const media = [photo("a", 2560, 1707, at(0)), photo("b", 2560, 1707, at(1))];
    for (let seed = 1; seed <= 20; seed++) {
      const m = gen({ media, aspectRatio: "9:16", seed });
      if (m.pages[0]!.items.length === 2) {
        expect(m.pages[0]!.items.every((i) => i.fit === "cover" || i.fit === "contain")).toBe(true);
      }
    }
  });
});

describe("F-GEN-04 cropping", () => {
  it("shows a portrait photo whole on a 16:9 single-photo page and crops a 3:2 landscape one", () => {
    const portrait = gen({ media: [photo("p", 1707, 2560, at(0))] });
    expect(portrait.pages[0]!.items[0]!.fit).toBe("contain");
    const landscape = gen({ media: [photo("l", 3000, 2000, at(0))] });
    expect(landscape.pages[0]!.items[0]!.fit).toBe("cover");
  });

  it("mirrors the rule in 9:16", () => {
    expect(gen({ media: [photo("l", 2560, 1707, at(0))], aspectRatio: "9:16" }).pages[0]!.items[0]!.fit).toBe("contain");
    expect(gen({ media: [photo("p", 1707, 2560, at(0))], aspectRatio: "9:16" }).pages[0]!.items[0]!.fit).toBe("cover");
  });

  it("applies the same rule to video pages", () => {
    const m = gen({ media: [{ ...video("v", 5, at(0)), width: 1080, height: 1920 }] });
    expect(m.pages[0]!.items[0]!.fit).toBe("contain");
  });
});

// ---------- F-GEN-05 转场与入场 ----------

describe("F-GEN-05 transitions and entrances", () => {
  it("only uses types allowed by the template; first page fades in", () => {
    for (const t of TEMPLATES) {
      const allowedTransitions = new Set(t.transitions.map((x) => x.type));
      const allowedEnters = new Set(t.enters.map((x) => x.type));
      for (let seed = 1; seed <= 30; seed++) {
        const m = gen({ media: landscapePhotos(40), templateId: t.id, seed });
        expect(m.pages[0]!.transitionIn!.type).toBe("fade");
        for (const page of m.pages.slice(1)) expect(allowedTransitions.has(page.transitionIn!.type as "fade")).toBe(true);
        for (const page of m.pages) {
          for (const item of page.items) if (item.enter) expect(allowedEnters.has(item.enter.type as "fade")).toBe(true);
        }
      }
    }
  });

  it("staggers entrances on multi-photo pages, counting delays from the page start", () => {
    let multi = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const m = gen({ media: landscapePhotos(40), templateId: "lively", seed });
      for (const page of m.pages) {
        if (page.items.length < 2) {
          expect(page.items[0]!.enter).toBeUndefined();
          continue;
        }
        multi++;
        const delays = page.items.map((i) => i.enter!.delay!);
        for (let i = 1; i < delays.length; i++) expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
        expect(delays[0]!).toBe(0);
        const last = page.items[page.items.length - 1]!.enter!;
        expect(last.delay! + last.duration).toBeLessThanOrEqual(page.duration);
      }
    }
    expect(multi).toBeGreaterThan(30);
  });

  it("slide transitions and slide entrances always carry a direction, and consecutive transitions differ", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const m = gen({ media: landscapePhotos(40), templateId: "lively", seed });
      m.pages.forEach((page, i) => {
        const tr = page.transitionIn!;
        if (tr.type === "slide") expect(tr.direction).toBeTruthy();
        page.items.forEach((item) => {
          if (item.enter?.type === "slide") expect(item.enter.direction).toBeTruthy();
        });
        if (i > 0) {
          const prev = m.pages[i - 1]!.transitionIn!;
          expect(`${tr.type}/${tr.direction ?? ""}`).not.toBe(`${prev.type}/${prev.direction ?? ""}`);
        }
      });
    }
  });

  it("keeps the transition within half of a very short video page", () => {
    const m = gen({ media: [video("v1", 0.3, at(0)), video("v2", 0.4, at(1))] });
    for (const page of m.pages) expect(page.transitionIn!.duration).toBeLessThanOrEqual(page.duration / 2 + 1e-9);
    expectValid(m);
  });
});

// ---------- F-GEN-06 节奏 ----------

describe("F-GEN-06 pacing (PRD 6.3.1)", () => {
  const photos = landscapePhotos(14);
  const baseline = gen({ media: photos, seed: 5 });
  const baseTotal = baseline.duration;
  const baseDurations = baseline.pages.map((p) => p.duration);

  it("without music, photo pages use their base durations", () => {
    expect(baseline.bgm).toBeUndefined();
    for (const page of baseline.pages) expect([3, 4]).toContain(page.duration);
    expect(baseline.assets.some((a) => a.type === "audio")).toBe(false);
  });

  it("music of matching length: film ends with the music, no loop", () => {
    const m = gen({ media: photos, seed: 5, music: music(baseTotal * 1.2) });
    expect(Math.abs(m.duration - baseTotal * 1.2)).toBeLessThan(0.1);
    expect(m.bgm!.loop).toBe(false);
    expectValid(m);
  });

  it("long music scales photo pages by 1.6 and does not loop", () => {
    const m = gen({ media: photos, seed: 5, music: music(baseTotal * 10) });
    m.pages.forEach((p, i) => expect(p.duration).toBeCloseTo(baseDurations[i]! * 1.6, 2));
    expect(m.bgm!.loop).toBe(false);
    expect(m.duration).toBeLessThan(music(baseTotal * 10).duration);
    expectValid(m);
  });

  it("short music scales photo pages by 0.7 and loops", () => {
    const m = gen({ media: photos, seed: 5, music: music(baseTotal * 0.1) });
    m.pages.forEach((p, i) => expect(p.duration).toBeCloseTo(baseDurations[i]! * 0.7, 2));
    expect(m.bgm!.loop).toBe(true);
    expectValid(m);
  });

  it("video pages keep their length and the music is fitted around them", () => {
    const media = [...landscapePhotos(6), video("v1", 6, at(6)), ...landscapePhotos(6, 7)];
    const noMusic = gen({ media, seed: 3 });
    const target = noMusic.duration + 4;
    const m = gen({ media, seed: 3, music: music(target) });
    const videoPage = m.pages.find((p) => m.assets.find((a) => a.id === p.items[0]!.assetId)?.type === "video")!;
    expect(videoPage.duration).toBe(6);
    expect(Math.abs(m.duration - target)).toBeLessThan(0.1);
    expectValid(m);
  });

  it("with no photo pages the film is as long as the videos; music loops only if shorter", () => {
    const videos = [video("v1", 5, at(0)), video("v2", 4, at(1))];
    const longMusic = gen({ media: videos, music: music(60) });
    expect(longMusic.duration).toBe(9);
    expect(longMusic.bgm!.loop).toBe(false);
    const shortMusic = gen({ media: videos, music: music(6) });
    expect(shortMusic.duration).toBe(9);
    expect(shortMusic.bgm!.loop).toBe(true);
  });

  it("describes the music in the manifest and fades per PRD T-14", () => {
    const m = gen({ media: photos, music: music(90) });
    expect(m.bgm).toMatchObject({ assetId: "a001", volume: 1, fadeIn: 1, fadeOut: 2 });
    expect(m.assets.find((a) => a.id === "a001")).toMatchObject({ type: "audio", title: "Track", license: "CC0-1.0", duration: 90 });
  });

  it("shrinks the fades for a very short film", () => {
    const m = gen({ media: [photo("a", 100, 100, at(0))], music: music(10) });
    expect(m.bgm!.fadeIn! + m.bgm!.fadeOut!).toBeLessThanOrEqual(m.duration + 1e-9);
  });
});

// ---------- F-GEN-07 视频截取 ----------

describe("F-GEN-07 video clipping", () => {
  it("clips a long video to the limit, taking the middle part", () => {
    const m = gen({ media: [video("v", 30, at(0))] });
    const page = m.pages[0]!;
    expect(page.duration).toBe(GENERATOR_LIMITS.maxVideoClipSeconds);
    expect(page.items[0]!.clipStart).toBeCloseTo(11, 6);
    expect(m.assets[0]!.duration).toBe(30); // 素材本身不变，导出时才裁剪
  });

  it("uses a short video whole", () => {
    const m = gen({ media: [video("v", 5, at(0))] });
    expect(m.pages[0]!.duration).toBe(5);
    expect(m.pages[0]!.items[0]!.clipStart).toBe(0);
  });

  it("a video exactly at the limit starts at 0", () => {
    const m = gen({ media: [video("v", 8, at(0))] });
    expect(m.pages[0]!.items[0]!.clipStart).toBe(0);
    expect(m.pages[0]!.duration).toBe(8);
  });
});

// ---------- F-GEN-08 确定性 ----------

describe("F-GEN-08 determinism", () => {
  const media = [...landscapePhotos(15), video("v1", 12, at(15)), ...landscapePhotos(10, 16)];

  it("same input and seed give identical manifests", () => {
    expect(gen({ media, seed: 99, music: music(120) })).toEqual(gen({ media, seed: 99, music: music(120) }));
  });

  it("differs only in id and createdAt when those are left to default", () => {
    const a = generateManifest({ media, aspectRatio: "16:9", templateId: "lively", seed: 5 });
    const b = generateManifest({ media, aspectRatio: "16:9", templateId: "lively", seed: 5 });
    expect(a.id).not.toBe(b.id);
    const strip = (m: Manifest) => ({ ...m, id: "", createdAt: "" });
    expect(strip(a)).toEqual(strip(b));
  });

  it("a different seed gives a different arrangement", () => {
    const pages = (seed: number) => JSON.stringify(gen({ media, seed }).pages);
    expect(pages(1)).not.toBe(pages(2));
  });

  it("does not mutate its input", () => {
    const copy = JSON.stringify(media);
    gen({ media });
    expect(JSON.stringify(media)).toBe(copy);
  });
});

// ---------- 整体合法性与错误 ----------

describe("generated manifests are valid", () => {
  it("passes validation across templates, ratios, seeds and mixed material", () => {
    let runs = 0;
    for (const t of TEMPLATES) {
      for (const ratio of ["16:9", "9:16"] as const) {
        for (let seed = 1; seed <= 12; seed++) {
          const rng = createRng(seed * 31);
          const n = 1 + Math.floor(rng.next() * 30);
          const media: MediaInput[] = Array.from({ length: n }, (_, i) => {
            const r = rng.next();
            if (r < 0.15) return video(`v${i}`, 0.5 + rng.next() * 40, at(i));
            return rng.next() < 0.5 ? photo(`p${i}`, 3000, 2000, at(i)) : photo(`p${i}`, 2000, 3000, at(i));
          });
          const withMusic = seed % 2 === 0 ? music(20 + rng.next() * 200) : undefined;
          expectValid(gen({ media, templateId: t.id, aspectRatio: ratio, seed, ...(withMusic && { music: withMusic }) }));
          runs++;
        }
      }
    }
    expect(runs).toBe(72);
  });

  it("handles the maximum number of media", () => {
    const m = gen({ media: landscapePhotos(GENERATOR_LIMITS.maxMedia), music: music(180) });
    expectValid(m);
    expect(m.assets).toHaveLength(101);
  });

  it("fills the generator info and a default title from the earliest capture date", () => {
    const m = gen({ media: [photo("a", 100, 100, "2026-10-03T09:00:00+08:00"), photo("b", 100, 100, "2026-10-01T09:00:00+08:00")] });
    expect(m.title).toBe("2026-10-01 回忆");
    expect(m.generator).toMatchObject({ name: "qyPlayer", templateId: "classic", seed: 1 });
    expect(gen({ media: [photo("a", 100, 100)] }).title).toBe("回忆");
    expect(gen({ media: [photo("a", 100, 100)], title: "我的旅行" }).title).toBe("我的旅行");
  });

  it("uses the given word in the default title, so the UI can pick the language", () => {
    const m = gen({ media: [photo("a", 100, 100, "2026-10-01T09:00:00+08:00")], defaultTitleWord: "Memories" });
    expect(m.title).toBe("2026-10-01 Memories");
    expect(gen({ media: [photo("a", 100, 100)], defaultTitleWord: "Memories" }).title).toBe("Memories");
  });

  it("canvas matches the chosen ratio", () => {
    expect(gen({ media: landscapePhotos(2), aspectRatio: "9:16" }).canvas).toEqual({ aspectRatio: "9:16", width: 1080, height: 1920, background: "#000000", backdrop: "blur" });
    expect(gen({ media: landscapePhotos(2) }).canvas).toMatchObject({ aspectRatio: "16:9", width: 1920, height: 1080 });
  });

  it("keeps optional asset fields (capture time, original, hasAudio)", () => {
    const m = gen({ media: [{ ...photo("a", 100, 100, at(0)), original: "originals/a.HEIC" }, { ...video("v", 4, at(1)), hasAudio: false }] });
    expect(m.assets[0]).toMatchObject({ capturedAt: at(0), original: "originals/a.HEIC" });
    expect(m.assets[1]).toMatchObject({ hasAudio: false, duration: 4 });
  });
});

describe("generateManifest errors", () => {
  const code = (fn: () => unknown): string | undefined => {
    try {
      fn();
    } catch (e) {
      return e instanceof GenerateError ? e.code : "other";
    }
    return undefined;
  };

  it("rejects bad input with a stable code", () => {
    expect(code(() => gen({ media: [] }))).toBe("no-media");
    expect(code(() => gen({ media: landscapePhotos(GENERATOR_LIMITS.maxMedia + 1) }))).toBe("too-many-media");
    expect(code(() => gen({ media: landscapePhotos(2), templateId: "nope" }))).toBe("unknown-template");
    expect(code(() => gen({ media: [photo("a", 1, 1), photo("a", 1, 1)] }))).toBe("duplicate-media-id");
    expect(code(() => gen({ media: [photo("a", 0, 10)] }))).toBe("invalid-media");
    expect(code(() => gen({ media: [{ ...video("v", 5), duration: 0 }] }))).toBe("invalid-media");
    expect(code(() => gen({ media: landscapePhotos(2), music: { ...music(10), id: "m000" } }))).toBe("duplicate-media-id");
    expect(code(() => gen({ media: landscapePhotos(2), music: music(0) }))).toBe("invalid-media");
  });
});

describe("素材信息和格式版本", () => {
  it("写 formatVersion 0.3，素材和配乐都带 mimeType 和 source，且通过校验", () => {
    const converted: MediaInput = { ...photo("m001", 2560, 1707, at(0)), mimeType: JPEG, source: { mimeType: "image/heic", transcoded: true } };
    const m = gen({ media: [converted, video("m002", 5, at(1))], music: music(30) });
    expect(m.formatVersion).toBe("0.3");
    expect(m.assets[0]).toMatchObject({ mimeType: JPEG, source: { mimeType: "image/heic", transcoded: true } });
    expect(m.assets[1]).toMatchObject({ mimeType: MP4, source: { mimeType: MP4, transcoded: false } });
    expect(m.assets[2]).toMatchObject({ type: "audio", mimeType: M4A, source: { mimeType: M4A, transcoded: false } });
    expectValid(m);
  });
});

describe("Ken Burns（格式 0.3 的 motion）", () => {
  const mixed = (n: number): MediaInput[] => Array.from({ length: n }, (_, i) => (i % 3 === 1 ? photo(`m${i}`, 1707, 2560, at(i)) : photo(`m${i}`, 2560, 1707, at(i))));

  it("只有单张照片页有 motion：拼图页和视频页没有", () => {
    const m = gen({ media: [...mixed(20), video("v1", 6, at(30))], seed: 7 });
    let single = 0;
    for (const page of m.pages) {
      const isVideo = page.items.some((i) => m.assets.find((a) => a.id === i.assetId)!.type === "video");
      for (const item of page.items) {
        if (page.items.length === 1 && !isVideo) {
          single++;
          expect(item.motion).toBeDefined();
        } else {
          expect(item.motion).toBeUndefined();
        }
      }
    }
    expect(single).toBeGreaterThan(3);
    expectValid(m);
  });

  it("cover 的照片始终盖满格子：scale 不小于 1，偏移不超过 (scale-1)/2，两端都满足", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const m = gen({ media: mixed(24), seed, templateId: "clean" });
      for (const item of m.pages.flatMap((p) => p.items)) {
        if (!item.motion || item.fit !== "cover") continue;
        for (const s of [item.motion.from, item.motion.to]) {
          expect(s.scale).toBeGreaterThanOrEqual(1);
          expect(s.scale).toBeLessThanOrEqual(GENERATOR_LIMITS.kenBurnsMaxScale + 1e-9);
          expect(Math.abs(s.x)).toBeLessThanOrEqual((s.scale - 1) / 2 + 1e-9);
          expect(Math.abs(s.y)).toBeLessThanOrEqual((s.scale - 1) / 2 + 1e-9);
        }
      }
    }
  });

  it("contain 的照片只在 0.94 到 1.00 之间缩放，不超出格子，不平移", () => {
    let seen = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const m = gen({ media: mixed(24), seed, templateId: "clean" });
      for (const item of m.pages.flatMap((p) => p.items)) {
        if (!item.motion || item.fit !== "contain") continue;
        seen++;
        for (const s of [item.motion.from, item.motion.to]) {
          expect(s.scale).toBeGreaterThanOrEqual(GENERATOR_LIMITS.kenBurnsContainMinScale - 1e-9);
          expect(s.scale).toBeLessThanOrEqual(1);
          expect([s.x, s.y]).toEqual([0, 0]);
        }
      }
    }
    expect(seen).toBeGreaterThan(10);
  });

  it("六种动作都会出现（推近、拉远、四个方向的平移）", () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const m = gen({ media: landscapePhotos(30), seed, templateId: "clean" });
      for (const { motion } of m.pages.flatMap((p) => p.items)) {
        if (!motion) continue;
        const { from, to } = motion;
        if (from.scale < to.scale) kinds.add("in");
        else if (from.scale > to.scale) kinds.add("out");
        else if (to.x > from.x) kinds.add("right");
        else if (to.x < from.x) kinds.add("left");
        else if (to.y > from.y) kinds.add("down");
        else kinds.add("up");
      }
    }
    expect([...kinds].sort()).toEqual(["down", "in", "left", "out", "right", "up"]);
  });

  it("相同输入和种子得到相同的动效；动效不影响转场和版式的选择", () => {
    const a = gen({ media: mixed(24), seed: 11 });
    const b = gen({ media: mixed(24), seed: 11 });
    expect(a).toEqual(b);
    const stripped = JSON.parse(JSON.stringify(a)) as Manifest;
    for (const page of stripped.pages) for (const item of page.items) delete item.motion;
    expect(stripped.pages.map((p) => [p.transitionIn, p.items.map((i) => [i.assetId, i.frame, i.fit, i.enter])])).toEqual(
      a.pages.map((p) => [p.transitionIn, p.items.map((i) => [i.assetId, i.frame, i.fit, i.enter])]),
    );
  });
});

describe("指定转场（generator.transition）", () => {
  const forced = (transition: "fade" | "slide" | "zoom" | "rotate", seed = 3): Manifest => gen({ media: landscapePhotos(24), seed, transition, templateId: "lively" });

  it.each(["fade", "slide", "zoom", "rotate"] as const)("%s：首页淡入，其余页全是这一种，并记录在 generator.transition", (type) => {
    const m = forced(type);
    expect(m.pages[0]!.transitionIn!.type).toBe("fade");
    for (const page of m.pages.slice(1)) expect(page.transitionIn!.type).toBe(type);
    expect(m.generator!.transition).toBe(type);
    expectValid(m);
  });

  it("滑动时方向仍随机，且相邻两页不同方向", () => {
    const pages = forced("slide").pages.slice(1);
    expect(new Set(pages.map((p) => p.transitionIn!.direction)).size).toBeGreaterThan(1);
    pages.slice(1).forEach((p, i) => expect(p.transitionIn!.direction).not.toBe(pages[i]!.transitionIn!.direction));
  });

  it("没有指定时跟随模板，不写 generator.transition", () => {
    const m = gen({ media: landscapePhotos(24), templateId: "clean" });
    expect(m.generator!.transition).toBeUndefined();
    expect(new Set(m.pages.map((p) => p.transitionIn!.type)).has("rotate")).toBe(false);
  });

  it("不认识的转场报 unknown-transition", () => {
    expect(() => gen({ media: landscapePhotos(2), transition: "cube" as never })).toThrowError(expect.objectContaining({ code: "unknown-transition" }));
  });

  it("指定转场不改变版式和动效的选择", () => {
    const strip = (m: Manifest) => m.pages.map((p) => p.items.map((i) => [i.assetId, i.frame, i.fit, i.motion]));
    expect(strip(forced("rotate"))).toEqual(strip(gen({ media: landscapePhotos(24), seed: 3, templateId: "lively" })));
  });
});

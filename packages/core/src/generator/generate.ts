import { CANVAS_SIZE, cellAspect, coverCropLoss, layoutFrames } from "../layout";
import { CURRENT_FORMAT_VERSION, type Asset, type AssetSource, type AspectRatio, type Bgm, type Direction, type Enter, type Item, type Manifest, type Page, type TransitionIn } from "../manifest";
import { createRng, type Rng } from "./rng";
import { findTemplate, type Template } from "./templates";

/** 生成器的取值常量。数值对应 PRD 第 14.1 节的暂定值，编号见注释。 */
export const GENERATOR_LIMITS = {
  /** T-01 单部影片素材数量上限 */
  maxMedia: 100,
  /** T-02 视频片段截取上限（秒） */
  maxVideoClipSeconds: 8,
  /** T-04 照片页基准时长（秒）与缩放系数范围 */
  baseSingleSeconds: 3,
  baseMultiSeconds: 4,
  minScale: 0.7,
  maxScale: 1.6,
  /** T-05 动画时长（秒） */
  transitionSeconds: 0.6,
  enterSeconds: 0.5,
  enterStaggerSeconds: 0.15,
  /** T-14 背景音乐淡入淡出（秒） */
  bgmFadeInSeconds: 1,
  bgmFadeOutSeconds: 2,
  /** T-20 裁切损失超过此比例时改用完整显示 */
  cropLossThreshold: 0.4,
} as const;

export interface MediaInput {
  /** 在清单中作为素材 id，需要唯一 */
  id: string;
  type: "image" | "video";
  /** 包内播放版本的路径 */
  src: string;
  /** 播放文件的类型（格式 0.2，写法见 docs/dev-0.3.0.md 4.3） */
  mimeType: string;
  /** 用户选的原始文件的类型，以及播放文件是否由它转码得到 */
  source: AssetSource;
  /** 排序时用作同时刻的次级键 */
  fileName: string;
  width: number;
  height: number;
  /** 视频必需：素材时长（秒） */
  duration?: number;
  hasAudio?: boolean;
  /** 拍摄时间，ISO 8601；缺失的素材排在最后 */
  capturedAt?: string;
  original?: string;
}

export interface MusicInput {
  id: string;
  src: string;
  mimeType: string;
  source: AssetSource;
  duration: number;
  title?: string;
  license?: string;
}

export interface GenerateOptions {
  media: readonly MediaInput[];
  aspectRatio: AspectRatio;
  templateId: string;
  /** 随机种子：相同输入和种子必定生成相同的清单（除 id 与 createdAt） */
  seed: number;
  music?: MusicInput;
  /** 为 true 时保持 media 的传入顺序，不按拍摄时间排序（用户手动调整过顺序） */
  keepOrder?: boolean;
  title?: string;
  /** 没给标题时，默认标题里“日期 + 词”的那个词，让界面按语言传入；缺省为“回忆” */
  defaultTitleWord?: string;
  /** 缺省时随机生成 */
  id?: string;
  /** 缺省时取当前时间 */
  createdAt?: string;
  generator?: { name: string; version: string };
}

export type GenerateErrorCode = "no-media" | "too-many-media" | "unknown-template" | "invalid-media" | "duplicate-media-id";

export class GenerateError extends Error {
  constructor(
    readonly code: GenerateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GenerateError";
  }
}

/** 按素材中占多数的方向给出默认画面比例（PRD F-OPT-01）。竖向多于横向时用 9:16，其余用 16:9。 */
export function defaultAspectRatio(media: readonly Pick<MediaInput, "width" | "height">[]): AspectRatio {
  const portrait = media.filter((m) => m.height > m.width).length;
  const landscape = media.filter((m) => m.width > m.height).length;
  return portrait > landscape ? "9:16" : "16:9";
}

/** 排序（PRD F-GEN-01）：拍摄时间升序；同时刻按文件名；再同则按 id。缺少拍摄时间的排在最后。 */
export function sortMedia(media: readonly MediaInput[]): MediaInput[] {
  const time = (m: MediaInput): number => {
    const t = m.capturedAt ? Date.parse(m.capturedAt) : NaN;
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  };
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return [...media].sort((a, b) => {
    const ta = time(a);
    const tb = time(b);
    if (ta !== tb) return ta < tb ? -1 : 1;
    return cmp(a.fileName, b.fileName) || cmp(a.id, b.id);
  });
}

type Group = { kind: "photos"; items: MediaInput[] } | { kind: "video"; item: MediaInput };

type PageSize = 1 | 2 | 3 | 4;

/**
 * 分页（PRD F-GEN-02）：每个视频独占一页；两个视频之间连续的照片按模板权重分成 1~4 张的页。
 * 相邻两页不使用相同张数的多图版式：上一页是多图页时，本页换一个张数（可以是单图）。
 */
function groupMedia(sorted: readonly MediaInput[], template: Template, rng: Rng): Group[] {
  const groups: Group[] = [];
  let run: MediaInput[] = [];
  let previousMultiSize: PageSize | null = null;

  const flushRun = (): void => {
    let index = 0;
    while (index < run.length) {
      const remaining = run.length - index;
      const candidates = ([1, 2, 3, 4] as const)
        .filter((size) => size <= remaining && size !== previousMultiSize)
        .map((size) => ({ value: size as PageSize, weight: template.sizeWeights[size - 1]! }));
      // 单图页的权重在每个模板中都大于 0，所以过滤后候选不会为空；兜底保证不会死循环
      const size = candidates.some((c) => c.weight > 0) ? rng.weighted(candidates) : 1;
      groups.push({ kind: "photos", items: run.slice(index, index + size) });
      previousMultiSize = size > 1 ? size : null;
      index += size;
    }
    run = [];
  };

  for (const item of sorted) {
    if (item.type === "video") {
      flushRun();
      groups.push({ kind: "video", item });
      previousMultiSize = null;
    } else {
      run.push(item);
    }
  }
  flushRun();
  return groups;
}

function permutations(n: number): number[][] {
  if (n <= 1) return [[0]];
  const result: number[][] = [];
  const rest = permutations(n - 1);
  for (const p of rest) {
    for (let at = 0; at <= p.length; at++) result.push([...p.slice(0, at), n - 1, ...p.slice(at)]);
  }
  // 保证恒等排列排第一：并列时保留拍摄时间顺序
  return result.sort((a, b) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
    return 0;
  });
}

/** 版式匹配（PRD F-GEN-03）：在页内重排照片，使总体裁切损失最小，并列时保持原顺序。 */
function matchToCells(photos: readonly MediaInput[], aspectRatio: AspectRatio): { photo: MediaInput; frame: Item["frame"] }[] {
  const frames = layoutFrames(photos.length as PageSize, aspectRatio);
  let best: number[] = photos.map((_, i) => i);
  let bestLoss = Number.POSITIVE_INFINITY;
  for (const perm of permutations(photos.length)) {
    let loss = 0;
    perm.forEach((photoIndex, cell) => {
      const p = photos[photoIndex]!;
      loss += coverCropLoss(p.width, p.height, cellAspect(frames[cell]!, aspectRatio));
    });
    if (loss < bestLoss - 1e-9) {
      bestLoss = loss;
      best = perm;
    }
  }
  return best.map((photoIndex, cell) => ({ photo: photos[photoIndex]!, frame: frames[cell]! }));
}

const DIRECTIONS: readonly Direction[] = ["left", "right", "up", "down"];
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

interface PageDraft {
  items: { media: MediaInput; frame: Item["frame"]; clipStart?: number }[];
  multi: boolean;
  /** 毫秒 */
  baseMs: number;
  isVideo: boolean;
}

function validateInput(options: GenerateOptions): Template {
  if (options.media.length === 0) throw new GenerateError("no-media", "at least one media file is required");
  if (options.media.length > GENERATOR_LIMITS.maxMedia) {
    throw new GenerateError("too-many-media", `at most ${GENERATOR_LIMITS.maxMedia} media files are supported`);
  }
  const template = findTemplate(options.templateId);
  if (!template) throw new GenerateError("unknown-template", `unknown template "${options.templateId}"`);
  const ids = new Set<string>();
  for (const m of options.media) {
    if (ids.has(m.id)) throw new GenerateError("duplicate-media-id", `duplicate media id ${m.id}`);
    ids.add(m.id);
    if (!(m.width > 0) || !(m.height > 0)) throw new GenerateError("invalid-media", `${m.id}: width and height must be positive`);
    if (m.type === "video" && !(m.duration !== undefined && m.duration > 0)) {
      throw new GenerateError("invalid-media", `${m.id}: a video needs a positive duration`);
    }
  }
  if (options.music && ids.has(options.music.id)) {
    throw new GenerateError("duplicate-media-id", `music id ${options.music.id} collides with a media id`);
  }
  if (options.music && !(options.music.duration > 0)) {
    throw new GenerateError("invalid-media", "music duration must be positive");
  }
  return template;
}

/**
 * 规则式自动生成（PRD 6.3）：素材 + 选项 + 种子 → 清单。纯函数，不访问文件、网络和界面。
 * 视频的截取通过 clipStart 表达，素材本身不改动；导出为包时才真正裁剪视频（PRD F-PKG-02）。
 */
export function generateManifest(options: GenerateOptions): Manifest {
  const template = validateInput(options);
  const rng = createRng(options.seed);
  const { aspectRatio } = options;

  const ordered = options.keepOrder ? [...options.media] : sortMedia(options.media);
  const groups = groupMedia(ordered, template, rng);

  // 1. 页草稿：版式、裁切方式、视频截取
  const drafts: PageDraft[] = groups.map((group): PageDraft => {
    if (group.kind === "video") {
      const v = group.item;
      const clipSeconds = Math.min(v.duration!, GENERATOR_LIMITS.maxVideoClipSeconds);
      const clipStart = v.duration! > clipSeconds ? round3((v.duration! - clipSeconds) / 2) : 0;
      return {
        items: [{ media: v, frame: layoutFrames(1, aspectRatio)[0]!, clipStart }],
        multi: false,
        baseMs: Math.floor(clipSeconds * 1000),
        isVideo: true,
      };
    }
    const placed = matchToCells(group.items, aspectRatio);
    const multi = placed.length > 1;
    return {
      items: placed.map((p) => ({ media: p.photo, frame: p.frame })),
      multi,
      baseMs: Math.round((multi ? GENERATOR_LIMITS.baseMultiSeconds : GENERATOR_LIMITS.baseSingleSeconds) * 1000),
      isVideo: false,
    };
  });

  // 2. 节奏（PRD 6.3.1）：按音乐时长缩放照片页
  const videoMs = drafts.filter((d) => d.isVideo).reduce((s, d) => s + d.baseMs, 0);
  const photoMs = drafts.filter((d) => !d.isVideo).reduce((s, d) => s + d.baseMs, 0);
  let scale = 1;
  if (options.music && photoMs > 0) {
    const musicMs = options.music.duration * 1000;
    scale = Math.min(GENERATOR_LIMITS.maxScale, Math.max(GENERATOR_LIMITS.minScale, (musicMs - videoMs) / photoMs));
  }
  const durationsMs = drafts.map((d) => (d.isVideo ? d.baseMs : Math.round(d.baseMs * scale)));
  const totalMs = durationsMs.reduce((s, d) => s + d, 0);

  // 3. 转场、入场、组装页
  const pages: Page[] = [];
  let startMs = 0;
  let previousTransition: TransitionIn | undefined;
  drafts.forEach((draft, index) => {
    const duration = durationsMs[index]! / 1000;
    const trSeconds = round3(Math.min(GENERATOR_LIMITS.transitionSeconds, duration / 2));
    const transition = index === 0 ? ({ type: "fade", duration: trSeconds } as TransitionIn) : pickTransition(template, rng, previousTransition, trSeconds);
    previousTransition = transition;

    const items: Item[] = draft.items.map((it, itemIndex) => {
      const cropLoss = coverCropLoss(it.media.width, it.media.height, cellAspect(it.frame, aspectRatio));
      const item: Item = {
        assetId: it.media.id,
        frame: it.frame,
        fit: cropLoss > GENERATOR_LIMITS.cropLossThreshold ? "contain" : "cover",
      };
      if (it.clipStart !== undefined) item.clipStart = it.clipStart;
      if (draft.multi) {
        // PRD 8.3：入场延迟从页开始计时，与转场并行；多图页内各图依次错开
        item.enter = pickEnter(template, rng, round3(itemIndex * GENERATOR_LIMITS.enterStaggerSeconds));
      }
      return item;
    });

    pages.push({
      id: `p${String(index + 1).padStart(3, "0")}`,
      start: startMs / 1000,
      duration,
      transitionIn: transition,
      items,
    });
    startMs += durationsMs[index]!;
  });

  // 4. 素材表与背景音乐
  const assets: Asset[] = ordered.map((m) => {
    const asset: Asset = { id: m.id, type: m.type, src: m.src, mimeType: m.mimeType, source: m.source, width: m.width, height: m.height };
    if (m.type === "video") {
      asset.duration = m.duration;
      asset.hasAudio = m.hasAudio ?? false;
    }
    if (m.capturedAt) asset.capturedAt = m.capturedAt;
    if (m.original) asset.original = m.original;
    return asset;
  });

  let bgm: Bgm | undefined;
  if (options.music) {
    const music = options.music;
    assets.push({
      id: music.id,
      type: "audio",
      src: music.src,
      mimeType: music.mimeType,
      source: music.source,
      duration: music.duration,
      ...(music.title !== undefined && { title: music.title }),
      ...(music.license !== undefined && { license: music.license }),
    });
    const filmSeconds = totalMs / 1000;
    bgm = {
      assetId: music.id,
      volume: 1,
      // 影片比音乐长（音乐偏短）时循环；影片比音乐短时在影片结束处淡出（PRD A-04）
      loop: filmSeconds > music.duration + 1e-6,
      fadeIn: round3(Math.min(GENERATOR_LIMITS.bgmFadeInSeconds, filmSeconds / 2)),
      fadeOut: round3(Math.min(GENERATOR_LIMITS.bgmFadeOutSeconds, filmSeconds / 2)),
    };
  }

  const earliest = ordered.map((m) => m.capturedAt).filter((t): t is string => !!t).sort()[0];
  const titleWord = options.defaultTitleWord ?? "回忆";
  const defaultTitle = earliest ? `${earliest.slice(0, 10)} ${titleWord}` : titleWord;

  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    id: options.id ?? randomId(),
    title: options.title ?? defaultTitle,
    createdAt: options.createdAt ?? new Date().toISOString(),
    generator: {
      name: options.generator?.name ?? "qyPlayer",
      version: options.generator?.version ?? "0.0.0",
      templateId: template.id,
      seed: options.seed,
    },
    canvas: { aspectRatio, ...CANVAS_SIZE[aspectRatio], background: "#000000", backdrop: "blur" },
    duration: totalMs / 1000,
    assets,
    ...(bgm && { bgm }),
    pages,
  };
}

/** 浏览器与 Node 18+ 都提供 crypto.randomUUID；core 不依赖 DOM 或 Node 类型，所以这里只声明用到的部分 */
function randomId(): string {
  return (globalThis as unknown as { crypto: { randomUUID(): string } }).crypto.randomUUID();
}

/** 选转场：尽量不与上一页重复（同类型，或同为滑动且方向相同）。 */
function pickTransition(template: Template, rng: Rng, previous: TransitionIn | undefined, duration: number): TransitionIn {
  const differing = template.transitions.filter((t) => t.type === "slide" || t.type !== previous?.type);
  const pool = differing.length > 0 ? differing : template.transitions;
  const type = rng.weighted(pool.map((t) => ({ value: t.type, weight: t.weight })));
  if (type !== "slide") return { type, duration };
  const directions = previous?.type === "slide" ? DIRECTIONS.filter((d) => d !== previous.direction) : DIRECTIONS;
  return { type, direction: rng.pick(directions), duration };
}

function pickEnter(template: Template, rng: Rng, delay: number): Enter {
  const type = rng.weighted(template.enters.map((e) => ({ value: e.type, weight: e.weight })));
  const duration = GENERATOR_LIMITS.enterSeconds;
  return type === "slide" ? { type, direction: rng.pick(DIRECTIONS), delay, duration } : { type, delay, duration };
}

import { framedItem } from "../framing";
import { CANVAS_SIZE, cellAspect, coverCropLoss, layoutFrames } from "../layout";
import { CURRENT_FORMAT_VERSION, KNOWN_LOOKS, type Look, type Asset, type AssetSource, type AspectRatio, type Bgm, type Direction, type Enter, type Fit, type Item, type Manifest, type Motion, type Page, type TitleCard, type TransitionIn } from "../manifest";
import { createRng, type Rng } from "./rng";
import { planProblems, type EnterChoice, type ItemPlan, type KenBurns, type PagePlan } from "./plan";
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
  /** 0.4.0 Ken Burns：cover 照片的最大放大倍数；contain 照片的最小缩小倍数；平移时每个方向的偏移（格子宽高的比例） */
  kenBurnsMaxScale: 1.08,
  kenBurnsContainMinScale: 0.94,
  kenBurnsPanOffset: 0.035,
  /** 0.4.0 片头标题卡：开始显示的时刻、最晚结束的时刻、淡入淡出时长（秒） */
  titleStartSeconds: 0.3,
  titleEndSeconds: 3,
  titleFadeSeconds: 0.5,
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

/** 片头标题图片：制作器画好的、与画布同尺寸的透明 PNG，由调用方放进包里 */
export interface TitleCardInput {
  id: string;
  src: string;
  mimeType: string;
  width: number;
  height: number;
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
  /** 指定后全片（除首页）都用这一种转场；缺省跟随模板。会写进 generator.transition 以便重新打开时还原 */
  transition?: TransitionChoice;
  /** 整片滤镜，写进清单 look；缺省是原片 */
  look?: Look;
  /** 片头标题图片；缺省则影片没有片头标题。显示时间由生成器按第一页的长度决定 */
  titleCard?: TitleCardInput;
  /** 副标题文字，写进清单 subtitle，仅用于还原编辑设置 */
  subtitle?: string;
  /** 没给标题时，默认标题里“日期 + 词”的那个词，让界面按语言传入；缺省为“回忆” */
  defaultTitleWord?: string;
  /** 缺省时随机生成 */
  id?: string;
  /** 缺省时取当前时间 */
  createdAt?: string;
  generator?: { name: string; version: string };
  /** 手动编排（docs/dev-0.4.1.md 2）：给了就不再自动分页，按它排页；缺省时由 planPages 自动编排 */
  pages?: readonly PagePlan[];
}

export type GenerateErrorCode = "no-media" | "too-many-media" | "unknown-template" | "unknown-transition" | "unknown-look" | "invalid-media" | "duplicate-media-id" | "invalid-plan";

/** 用户可以指定的转场（缺省跟随模板）。首页固定淡入 */
export const TRANSITION_CHOICES = ["fade", "slide", "zoom", "rotate"] as const;
export type TransitionChoice = (typeof TRANSITION_CHOICES)[number];

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

/** 动效使用独立的随机数流：加不加动效都不改变版式、转场和入场的选择结果 */
const MOTION_SEED_SALT = 0x4b1d;

/** 单张照片页 Ken Burns 的种类（docs/dev-0.4.0.md 4.2）：cover 从六种里随机，contain 只有推近和拉远 */
function pickKenBurns(rng: Rng, fit: Fit): KenBurns {
  if (fit === "contain") return rng.next() < 0.5 ? "in" : "out";
  return rng.pick(["in", "out", "left", "right", "up", "down"] as const);
}

/**
 * Ken Burns 种类对应的 motion。cover：推近、拉远、或保持放大并沿四个方向之一平移，
 * 偏移不超过 (scale-1)/2，所以素材始终盖满格子；contain：只在 0.94 到 1.00 之间缩放，不超出格子（方向类按不动处理）。
 * 缺省和 none 没有 motion。
 */
export function motionFor(kind: KenBurns | undefined, fit: Fit): Motion | undefined {
  const { kenBurnsMaxScale: max, kenBurnsContainMinScale: min, kenBurnsPanOffset: d } = GENERATOR_LIMITS;
  const still = { x: 0, y: 0 };
  if (fit === "contain") {
    if (kind === "in") return { from: { scale: min, ...still }, to: { scale: 1, ...still } };
    if (kind === "out") return { from: { scale: 1, ...still }, to: { scale: min, ...still } };
    return undefined;
  }
  switch (kind) {
    case "in":
      return { from: { scale: 1, ...still }, to: { scale: max, ...still } };
    case "out":
      return { from: { scale: max, ...still }, to: { scale: 1, ...still } };
    case "left":
      return { from: { scale: max, x: d, y: 0 }, to: { scale: max, x: -d, y: 0 } };
    case "right":
      return { from: { scale: max, x: -d, y: 0 }, to: { scale: max, x: d, y: 0 } };
    case "up":
      return { from: { scale: max, x: 0, y: d }, to: { scale: max, x: 0, y: -d } };
    case "down":
      return { from: { scale: max, x: 0, y: -d }, to: { scale: max, x: 0, y: d } };
    default:
      return undefined;
  }
}

/** 没指定 fit 时的自动选择：裁切损失超过阈值就完整显示（PRD F-GEN-04、T-20） */
function autoFit(media: Pick<MediaInput, "width" | "height">, frame: Item["frame"], aspectRatio: AspectRatio): Fit {
  return coverCropLoss(media.width, media.height, cellAspect(frame, aspectRatio)) > GENERATOR_LIMITS.cropLossThreshold ? "contain" : "cover";
}

/** 组装用的页草稿：该页的素材和时长（毫秒） */
interface Draft {
  plan: PagePlan;
  media: MediaInput[];
  multi: boolean;
  isVideo: boolean;
  baseMs: number;
  /** 时长已由编排指定（视频页的片段长度也算），不随配乐缩放 */
  fixed: boolean;
  clipStart?: number;
}

function validateInput(options: GenerateOptions): Template {
  if (options.media.length === 0) throw new GenerateError("no-media", "at least one media file is required");
  if (options.media.length > GENERATOR_LIMITS.maxMedia) {
    throw new GenerateError("too-many-media", `at most ${GENERATOR_LIMITS.maxMedia} media files are supported`);
  }
  const template = findTemplate(options.templateId);
  if (!template) throw new GenerateError("unknown-template", `unknown template "${options.templateId}"`);
  if (options.transition !== undefined && !TRANSITION_CHOICES.includes(options.transition)) {
    throw new GenerateError("unknown-transition", `unknown transition "${String(options.transition)}"`);
  }
  if (options.look !== undefined && !KNOWN_LOOKS.includes(options.look)) {
    throw new GenerateError("unknown-look", `unknown look "${String(options.look)}"`);
  }
  const ids = new Set<string>();
  for (const m of options.media) {
    if (ids.has(m.id)) throw new GenerateError("duplicate-media-id", `duplicate media id ${m.id}`);
    ids.add(m.id);
    if (!(m.width > 0) || !(m.height > 0)) throw new GenerateError("invalid-media", `${m.id}: width and height must be positive`);
    if (m.type === "video" && !(m.duration !== undefined && m.duration > 0)) {
      throw new GenerateError("invalid-media", `${m.id}: a video needs a positive duration`);
    }
  }
  if (options.titleCard) {
    const card = options.titleCard;
    if (ids.has(card.id) || card.id === options.music?.id) {
      throw new GenerateError("duplicate-media-id", `title card id ${card.id} collides with another asset id`);
    }
    if (!(card.width > 0) || !(card.height > 0)) throw new GenerateError("invalid-media", "title card width and height must be positive");
  }
  if (options.music && ids.has(options.music.id)) {
    throw new GenerateError("duplicate-media-id", `music id ${options.music.id} collides with a media id`);
  }
  if (options.music && !(options.music.duration > 0)) {
    throw new GenerateError("invalid-media", "music duration must be positive");
  }
  return template;
}

/** 视频页的片段（秒）：长度不超过素材时长和 wanted；起点缺省居中，指定时夹在素材内 */
function videoClip(media: MediaInput, wanted: number | undefined, clipStart: number | undefined): { seconds: number; start: number } {
  const seconds = Math.min(media.duration!, wanted ?? GENERATOR_LIMITS.maxVideoClipSeconds);
  const last = Math.max(0, media.duration! - seconds);
  const start = clipStart !== undefined ? Math.min(Math.max(0, clipStart), last) : media.duration! > seconds ? round3(last / 2) : 0;
  return { seconds, start };
}

/**
 * 自动编排：素材 + 选项 + 种子 → 页的编排（分页、版式匹配、转场、入场、Ken Burns 种类）。纯函数。
 * 随机数的消耗顺序与 0.4.0 的整片生成完全一致，所以同样的输入得到同样的影片。
 */
export function planPages(options: GenerateOptions): PagePlan[] {
  const template = validateInput(options);
  return planWith(options, template, options.keepOrder ? [...options.media] : sortMedia(options.media));
}

function planWith(options: GenerateOptions, template: Template, ordered: readonly MediaInput[]): PagePlan[] {
  const rng = createRng(options.seed);
  const motionRng = createRng((options.seed ^ MOTION_SEED_SALT) >>> 0);
  const { aspectRatio } = options;
  const groups = groupMedia(ordered, template, rng);

  let previous: TransitionIn | undefined;
  return groups.map((group, index): PagePlan => {
    const transition = index === 0 ? ({ type: "fade" } as TransitionIn) : pickTransition(template, rng, previous, options.transition);
    previous = transition;
    const base = { transition: { type: transition.type, ...(transition.direction !== undefined && { direction: transition.direction }) } };

    if (group.kind === "video") {
      const { start } = videoClip(group.item, undefined, undefined);
      return { items: [{ assetId: group.item.id, clipStart: start }], ...base };
    }
    const placed = matchToCells(group.items, aspectRatio);
    const multi = placed.length > 1;
    const items = placed.map((p): ItemPlan => {
      const item: ItemPlan = { assetId: p.photo.id };
      if (!multi) item.kenBurns = pickKenBurns(motionRng, autoFit(p.photo, p.frame, aspectRatio));
      else item.enter = pickEnter(template, rng);
      return item;
    });
    return { items, ...base };
  });
}

/**
 * 规则式自动生成（PRD 6.3）：素材 + 选项 + 种子 → 清单。纯函数，不访问文件、网络和界面。
 * 视频的截取通过 clipStart 表达，素材本身不改动；导出为包时才真正裁剪视频（PRD F-PKG-02）。
 * 给了 options.pages 就按这份编排组装（单页编辑），否则先自动编排。
 */
export function generateManifest(options: GenerateOptions): Manifest {
  const template = validateInput(options);
  const { aspectRatio } = options;

  let ordered: readonly MediaInput[];
  let plans: readonly PagePlan[];
  if (options.pages) {
    const problem = planProblems(options.pages, options.media);
    if (problem) throw new GenerateError("invalid-plan", problem);
    ordered = [...options.media];
    plans = options.pages;
  } else {
    ordered = options.keepOrder ? [...options.media] : sortMedia(options.media);
    plans = planWith(options, template, ordered);
  }
  const byId = new Map(ordered.map((m) => [m.id, m]));

  // 1. 页草稿：该页的素材、时长（毫秒）
  const drafts = plans.map((plan): Draft => {
    const media = plan.items.map((it) => byId.get(it.assetId)!);
    const multi = media.length > 1;
    if (media[0]!.type === "video") {
      const { seconds, start } = videoClip(media[0]!, plan.duration, plan.items[0]!.clipStart);
      return { plan, media, multi, isVideo: true, baseMs: Math.floor(seconds * 1000), fixed: true, clipStart: start };
    }
    if (plan.duration !== undefined) return { plan, media, multi, isVideo: false, baseMs: Math.round(plan.duration * 1000), fixed: true };
    const base = multi ? GENERATOR_LIMITS.baseMultiSeconds : GENERATOR_LIMITS.baseSingleSeconds;
    return { plan, media, multi, isVideo: false, baseMs: Math.round(base * 1000), fixed: false };
  });

  // 2. 节奏（PRD 6.3.1）：按音乐时长缩放没有指定时长的照片页
  const fixedMs = drafts.filter((d) => d.fixed).reduce((s, d) => s + d.baseMs, 0);
  const autoMs = drafts.filter((d) => !d.fixed).reduce((s, d) => s + d.baseMs, 0);
  let scale = 1;
  if (options.music && autoMs > 0) {
    const musicMs = options.music.duration * 1000;
    scale = Math.min(GENERATOR_LIMITS.maxScale, Math.max(GENERATOR_LIMITS.minScale, (musicMs - fixedMs) / autoMs));
  }
  const durationsMs = drafts.map((d) => (d.fixed ? d.baseMs : Math.round(d.baseMs * scale)));
  const totalMs = durationsMs.reduce((s, d) => s + d, 0);

  // 3. 转场、入场、组装页
  const pages: Page[] = [];
  let startMs = 0;
  drafts.forEach((draft, index) => {
    const duration = durationsMs[index]! / 1000;
    const trSeconds = round3(Math.min(GENERATOR_LIMITS.transitionSeconds, duration / 2));
    const choice = index === 0 ? undefined : draft.plan.transition;
    const transition: TransitionIn =
      choice?.type === "slide"
        ? { type: "slide", direction: choice.direction ?? "left", duration: trSeconds }
        : { type: choice?.type ?? "fade", duration: trSeconds };

    const frames = layoutFrames(draft.media.length as PageSize, aspectRatio, draft.plan.layout);
    const items: Item[] = draft.plan.items.map((it, itemIndex) => {
      const media = draft.media[itemIndex]!;
      const frame = frames[itemIndex]!;
      const item: Item = { assetId: media.id, frame, fit: it.fit ?? autoFit(media, frame, aspectRatio) };
      if (draft.clipStart !== undefined) item.clipStart = draft.clipStart;
      const kenBurns = draft.multi ? undefined : it.kenBurns;
      if (it.crop && media.type === "image" && it.fit !== "contain") {
        // 取景：按完整显示再放大平移，Ken Burns 叠加在取景之上（docs/dev-0.4.1.md 4）
        const framed = framedItem(media, cellAspect(frame, aspectRatio), it.crop, kenBurns);
        item.fit = framed.fit;
        item.motion = framed.motion;
      } else if (!draft.multi && !draft.isVideo) {
        const motion = motionFor(kenBurns, item.fit!);
        if (motion) item.motion = motion;
      }
      if (draft.multi) {
        // PRD 8.3：入场延迟从页开始计时，与转场并行；多图页内各图依次错开
        item.enter = enterOf(it.enter, round3(itemIndex * GENERATOR_LIMITS.enterStaggerSeconds));
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

  if (options.titleCard) {
    const card = options.titleCard;
    assets.push({ id: card.id, type: "image", src: card.src, mimeType: card.mimeType, source: { mimeType: card.mimeType, transcoded: false }, width: card.width, height: card.height });
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
      ...(options.transition !== undefined && { transition: options.transition }),
    },
    canvas: { aspectRatio, ...CANVAS_SIZE[aspectRatio], background: "#000000", backdrop: "blur" },
    duration: totalMs / 1000,
    assets,
    ...(bgm && { bgm }),
    pages,
    ...(options.look !== undefined && { look: options.look }),
    ...(options.subtitle && { subtitle: options.subtitle }),
    ...(options.titleCard && { titleCard: titleCardTiming(options.titleCard.id, durationsMs[0]! / 1000, totalMs / 1000) }),
  };
}

/** 浏览器与 Node 18+ 都提供 crypto.randomUUID；core 不依赖 DOM 或 Node 类型，所以这里只声明用到的部分 */
function randomId(): string {
  return (globalThis as unknown as { crypto: { randomUUID(): string } }).crypto.randomUUID();
}

/** 标题从 0.3 秒显示到 3 秒；第一页或整片不足 3 秒则在其结束时淡出完 */
function titleCardTiming(assetId: string, firstPageSeconds: number, filmSeconds: number): TitleCard {
  const start = GENERATOR_LIMITS.titleStartSeconds;
  const end = Math.min(GENERATOR_LIMITS.titleEndSeconds, firstPageSeconds, filmSeconds);
  const duration = Math.max(0, round3(end - start));
  const fade = round3(Math.min(GENERATOR_LIMITS.titleFadeSeconds, duration / 2));
  return { assetId, start, duration, fadeIn: fade, fadeOut: fade };
}

/** 选转场：尽量不与上一页重复（同类型，或同为滑动且方向相同）。时长由组装部分算 */
function pickTransition(template: Template, rng: Rng, previous: TransitionIn | undefined, forced?: TransitionChoice): TransitionIn {
  const type: string = forced ?? pickTransitionType(template, rng, previous);
  if (type !== "slide") return { type, duration: 0 };
  const directions = previous?.type === "slide" ? DIRECTIONS.filter((d) => d !== previous.direction) : DIRECTIONS;
  return { type, direction: rng.pick(directions), duration: 0 };
}

function pickTransitionType(template: Template, rng: Rng, previous: TransitionIn | undefined): string {
  const differing = template.transitions.filter((t) => t.type === "slide" || t.type !== previous?.type);
  const pool = differing.length > 0 ? differing : template.transitions;
  return rng.weighted(pool.map((t) => ({ value: t.type, weight: t.weight })));
}

/** 入场的选择（类型和方向）；延迟和时长由组装部分按页内顺序算 */
function pickEnter(template: Template, rng: Rng): EnterChoice {
  const type = rng.weighted(template.enters.map((e) => ({ value: e.type, weight: e.weight })));
  return type === "slide" ? { type, direction: rng.pick(DIRECTIONS) } : { type };
}

function enterOf(choice: EnterChoice | undefined, delay: number): Enter {
  const type = choice?.type ?? "fade";
  const duration = GENERATOR_LIMITS.enterSeconds;
  return type === "slide" ? { type, direction: choice?.direction ?? "left", delay, duration } : { type, delay, duration };
}

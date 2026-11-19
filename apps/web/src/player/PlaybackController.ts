import { bgmGainAt, bgmPositionAt, stateAt, videoAudioGain, type Asset, type FrameState, type Layer, type Manifest } from "@qyplayer/core";
import type { OpenedPackage } from "@qyplayer/qyp";
import { renderFrame, type DrawableAsset, type PlaceholderAsset } from "@qyplayer/renderer";
import { browserPreflightEnv, pagesUsing, playbackMimeType, preflightAssets, type PreflightEnv } from "./preflight";
import { nextPageTime, pageIndexAt, pageSeekTime, previousPageTime } from "./pages";
import { PageThumbnails, renderPageThumbnail } from "./thumbnails";
import { Clock, distance } from "./timing";

export type PlayState = "paused" | "playing" | "ended";

/** 不影响继续播放的提示。只给代码，文字由界面按语言翻译 */
export interface PlayerWarning {
  code: "bgm-decode" | "bgm-read" | "asset-failed" | "autoplay-blocked" | "assets-unsupported";
  /** asset-failed 时是出问题的包内路径 */
  src?: string;
  /** assets-unsupported 时：无法播放的素材个数，和用到它们的页码（从 1 开始、升序，完整列表，由界面决定列出几个） */
  count?: number;
  pages?: number[];
}

export interface CreateOptions {
  /** 预检要读文件试解码（较慢）时调用一次，用于显示“正在检查素材” */
  onChecking?: () => void;
  /** 测试用：替换浏览器能力查询 */
  preflightEnv?: PreflightEnv;
}

export interface PlayerEvents {
  onTime(time: number): void;
  onState(state: PlayState): void;
  onWarning(warning: PlayerWarning): void;
}

/** 解码后的位图最长边上限：1080p 画布用不到更大的图，省内存 */
const IMAGE_MAX_SIDE = 2048;
/** 提前加载当前页前后各几页；超出保留范围的素材会释放 */
const PREFETCH_PAGES = 1;
const KEEP_PAGES = 2;
/** 视频与影片时间的允许偏差（秒）：播放中 / 暂停拖动中 */
const VIDEO_DRIFT_PLAYING = 0.3;
const VIDEO_DRIFT_PAUSED = 0.1;
/** 预先定位下一页视频时，已在起点附近就不再重复 seek */
const VIDEO_PRIME_TOLERANCE = 0.05;
/** 无音乐循环时，音频偏离应有位置多少秒就硬校正 */
const AUDIO_DRIFT = 0.25;
/** 音频做主时钟时，影片时间偏离音频多少秒就被拉回 */
const CLOCK_DRIFT = 0.08;

interface VideoSlot {
  element: HTMLVideoElement;
  url: string;
}

/**
 * 播放控制：把时间线引擎（stateAt）、渲染器（renderFrame）和浏览器的音视频元素接在一起。
 * - 时钟：有背景音乐且不循环时，音频是主时钟；其余情况用墙钟，循环音频按位置校正。
 * - 素材按页滑动窗口加载与释放，内存与素材总量无关（PRD N-PERF-04）。
 * - 声音规则：有背景音乐时所有视频静音，否则视频自带声音正常播放（PRD 第 9 节）。
 */
export class PlaybackController {
  readonly canvas: HTMLCanvasElement;
  /** 打开期间累计的、不影响播放的提示（素材无法解码等） */
  readonly warnings: PlayerWarning[] = [];

  private readonly manifest: Manifest;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly clock: Clock;
  private readonly assets = new Map<string, Asset>();
  private readonly pageAssets: string[][];
  private readonly images = new Map<string, ImageBitmap>();
  private readonly videos = new Map<string, VideoSlot>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly failed = new Set<string>();
  /** 预检判定本设备无法播放的素材 id */
  private readonly unsupported: ReadonlySet<string>;
  private placeholderText = "";
  private readonly audio: HTMLAudioElement | null = null;
  private audioUrl: string | null = null;
  private readonly audioIsMaster: boolean;

  private thumbnails: PageThumbnails<HTMLCanvasElement> | null = null;
  private events: PlayerEvents | null = null;
  private playState: PlayState = "paused";
  private volumeValue = 1;
  private mutedValue = false;
  private rafId = 0;
  private lastSweepPage = -1;
  private disposed = false;

  private readonly onVisibility = (): void => {
    if (document.hidden) this.pause();
  };

  private constructor(
    private readonly pkg: OpenedPackage,
    unsupported: ReadonlySet<string>,
  ) {
    this.manifest = pkg.manifest;
    this.unsupported = unsupported;
    this.clock = new Clock(this.manifest.duration);
    for (const asset of this.manifest.assets) this.assets.set(asset.id, asset);
    this.pageAssets = this.manifest.pages.map((p) => [...new Set(p.items.map((i) => i.assetId))]);
    // 片头标题图片不属于任何一页：在它显示期间碰到的页里，都要保留这张图
    const card = this.manifest.titleCard;
    if (card) {
      this.manifest.pages.forEach((page, index) => {
        if (page.start < card.start + card.duration && page.start + page.duration > card.start) this.pageAssets[index]!.push(card.assetId);
      });
    }

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.manifest.canvas.width;
    this.canvas.height = this.manifest.canvas.height;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;

    const bgm = this.manifest.bgm;
    this.audioIsMaster = bgm !== undefined && !bgm.loop;
    if (bgm) {
      this.audio = new Audio();
      this.audio.preload = "auto";
      this.audio.loop = bgm.loop === true;
      this.audio.addEventListener("error", () => this.warn({ code: "bgm-decode" }));
    }
    document.addEventListener("visibilitychange", this.onVisibility);

    // 背景音乐无法播放走原有的 bgm-decode 提示；画面素材汇总成一条带页码的提示
    const visual = new Set([...unsupported].filter((id) => id !== bgm?.assetId));
    if (bgm && unsupported.has(bgm.assetId)) this.warnings.push({ code: "bgm-decode" });
    if (visual.size > 0) this.warnings.push({ code: "assets-unsupported", count: visual.size, pages: pagesUsing(this.manifest, visual) });
  }

  /** 先预检素材（0.2 包），再创建控制器并准备好第一帧（第一页的素材已就绪），之后即可 play()。 */
  static async create(pkg: OpenedPackage, options: CreateOptions = {}): Promise<PlaybackController> {
    let unsupported: ReadonlySet<string>;
    try {
      ({ unsupported } = await preflightAssets(pkg.manifest, (path) => pkg.readBlob(path), options.preflightEnv ?? browserPreflightEnv(), options.onChecking));
    } catch (error) {
      void pkg.close();
      throw error;
    }
    const controller = new PlaybackController(pkg, unsupported);
    await controller.prepare();
    return controller;
  }

  /** 占位画面上的文字（界面语言相关，由界面传入）；变化后补画一帧 */
  setPlaceholderText(text: string): void {
    if (text === this.placeholderText) return;
    this.placeholderText = text;
    this.redrawIfIdle();
  }

  get state(): PlayState {
    return this.playState;
  }
  get duration(): number {
    return this.manifest.duration;
  }
  get title(): string {
    return this.manifest.title;
  }
  get pageCount(): number {
    return this.manifest.pages.length;
  }
  /** 影片时间 t（缺省为当前时间）所在页的下标 */
  pageIndexAt(t: number = this.currentTime): number {
    return pageIndexAt(this.manifest, t);
  }
  get currentTime(): number {
    return this.clock.time(performance.now());
  }
  /** 当前时刻的素材都已就绪：没有加载在途，视频都已定位完成。用于测量拖动定位耗时 */
  isSettled(): boolean {
    return this.pending.size === 0 && [...this.videos.values()].every((v) => !v.element.seeking && v.element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
  }

  /** 内部状态快照，仅供开发和自动化测试检查同步情况 */
  debugInfo(): { time: number; audioTime: number | null; audioPaused: boolean | null; videos: { id: string; time: number; paused: boolean; muted: boolean; volume: number }[] } {
    return {
      time: this.currentTime,
      audioTime: this.audio ? this.audio.currentTime : null,
      audioPaused: this.audio ? this.audio.paused : null,
      videos: [...this.videos].map(([id, v]) => ({ id, time: v.element.currentTime, paused: v.element.paused, muted: v.element.muted, volume: v.element.volume })),
    };
  }
  get volume(): number {
    return this.volumeValue;
  }
  get muted(): boolean {
    return this.mutedValue;
  }

  setEvents(events: PlayerEvents | null): void {
    this.events = events;
  }

  play(): void {
    if (this.disposed || this.playState === "playing") return;
    const now = performance.now();
    if (this.playState === "ended") this.clock.seek(0, now);
    this.clock.play(now);
    this.setState("playing");
    this.rafId = requestAnimationFrame(this.tick);
  }

  pause(): void {
    if (this.disposed || this.playState !== "playing") return;
    cancelAnimationFrame(this.rafId);
    this.clock.pause(performance.now());
    this.setState("paused");
    this.draw(this.clock.time(performance.now()));
  }

  toggle(): void {
    if (this.playState === "playing") this.pause();
    else this.play();
  }

  seek(time: number): void {
    if (this.disposed) return;
    const now = performance.now();
    this.clock.seek(time, now);
    const t = this.clock.time(now);
    if (this.audio) {
      const position = bgmPositionAt(this.manifest, t);
      if (position !== null) this.audio.currentTime = position;
    }
    if (this.playState === "ended" && t < this.manifest.duration) this.setState("paused");
    this.draw(t);
  }

  /** 跳到第 index 页：定位到该页转场结束、画面完整出现的时刻 */
  seekToPage(index: number): void {
    this.seek(pageSeekTime(this.manifest, index));
  }

  /** 本页刚开始时回到上一页，否则回到本页开头 */
  previousPage(): void {
    this.seek(previousPageTime(this.manifest, this.currentTime));
  }

  /** 跳到下一页；已经是最后一页时什么也不做 */
  nextPage(): void {
    const target = nextPageTime(this.manifest, this.currentTime);
    if (target !== undefined) this.seek(target);
  }

  /** 第 index 页的缩略图（画布）。第一次请求时才开始，所有页一次画一个，结果缓存 */
  pageThumbnail(index: number): Promise<HTMLCanvasElement> {
    this.thumbnails ??= new PageThumbnails((page) =>
      renderPageThumbnail({ manifest: this.manifest, readBlob: (path) => this.pkg.readBlob(path), unsupported: this.unsupported }, page),
    );
    return this.thumbnails.get(index);
  }

  setVolume(volume: number): void {
    this.volumeValue = Math.min(1, Math.max(0, volume));
    this.applyVolume();
  }

  setMuted(muted: boolean): void {
    this.mutedValue = muted;
    this.applyVolume();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.thumbnails?.dispose();
    cancelAnimationFrame(this.rafId);
    document.removeEventListener("visibilitychange", this.onVisibility);
    for (const id of [...this.videos.keys()]) this.unloadVideo(id);
    for (const bitmap of this.images.values()) bitmap.close();
    this.images.clear();
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
    }
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    void this.pkg.close();
    this.events = null;
  }

  // ---------- 内部：准备与素材窗口 ----------

  private async prepare(): Promise<void> {
    const bgm = this.manifest.bgm;
    if (bgm && this.audio) {
      const asset = this.assets.get(bgm.assetId);
      if (asset && !this.unsupported.has(asset.id)) {
        try {
          this.audioUrl = URL.createObjectURL(await this.pkg.readBlob(asset.src));
          this.audio.src = this.audioUrl;
        } catch {
          this.warn({ code: "bgm-read" });
        }
      }
    }
    this.sweep(0);
    await Promise.allSettled([...this.pending.values()]);
    this.draw(0);
  }

  private setState(state: PlayState): void {
    this.playState = state;
    this.events?.onState(state);
  }

  private warn(warning: PlayerWarning): void {
    this.warnings.push(warning);
    this.events?.onWarning(warning);
  }

  /** 按页窗口加载将要用到的素材，释放用不到的。只在页变化时执行。 */
  private sweep(pageIndex: number): void {
    if (pageIndex === this.lastSweepPage) return;
    this.lastSweepPage = pageIndex;
    const wanted = new Set<string>();
    const keep = new Set<string>();
    this.pageAssets.forEach((ids, i) => {
      const gap = Math.abs(i - pageIndex);
      if (gap <= PREFETCH_PAGES) ids.forEach((id) => wanted.add(id));
      if (gap <= KEEP_PAGES) ids.forEach((id) => keep.add(id));
    });
    for (const id of wanted) this.load(id);
    for (const id of [...this.images.keys()]) {
      if (!keep.has(id)) {
        this.images.get(id)?.close();
        this.images.delete(id);
      }
    }
    for (const id of [...this.videos.keys()]) if (!keep.has(id)) this.unloadVideo(id);
  }

  private load(id: string): void {
    const asset = this.assets.get(id);
    if (!asset || this.unsupported.has(id) || this.failed.has(id) || this.images.has(id) || this.videos.has(id) || this.pending.has(id)) return;
    const task = (asset.type === "video" ? this.loadVideo(asset) : this.loadImage(asset))
      .catch(() => this.fail(asset))
      .finally(() => {
        this.pending.delete(id);
        this.redrawIfIdle();
      });
    this.pending.set(id, task);
  }

  /** 包里某个图片文件被换掉后（改标题时换标题图片），丢掉旧的解码结果，重新读入。只处理已经载入过的图片 */
  refreshAsset(id: string): void {
    const pending = this.pending.get(id);
    if (pending) {
      void pending.then(() => this.refreshAsset(id));
      return;
    }
    const bitmap = this.images.get(id);
    if (!bitmap) return;
    bitmap.close();
    this.images.delete(id);
    this.failed.delete(id);
    this.load(id);
  }

  private fail(asset: Asset): void {
    if (this.failed.has(asset.id)) return;
    this.failed.add(asset.id);
    this.warn({ code: "asset-failed", src: asset.src });
  }

  private async loadImage(asset: Asset): Promise<void> {
    const blob = await this.pkg.readBlob(asset.src);
    const { width, height } = asset;
    const scale = width && height ? Math.min(1, IMAGE_MAX_SIDE / Math.max(width, height)) : 1;
    const bitmap =
      scale < 1 && width && height
        ? await createImageBitmap(blob, { resizeWidth: Math.round(width * scale), resizeHeight: Math.round(height * scale), resizeQuality: "high" })
        : await createImageBitmap(blob);
    if (this.disposed) {
      bitmap.close();
      return;
    }
    this.images.set(asset.id, bitmap);
  }

  private async loadVideo(asset: Asset): Promise<void> {
    const blob = await this.pkg.readBlob(asset.src);
    // 0.2 包按清单里的类型建 Blob，MOV 换成 video/mp4，浏览器才肯播
    const url = URL.createObjectURL(asset.mimeType ? blob.slice(0, blob.size, playbackMimeType(asset.mimeType)) : blob);
    if (this.disposed) {
      URL.revokeObjectURL(url);
      return;
    }
    const element = document.createElement("video");
    element.playsInline = true;
    element.preload = "auto";
    element.src = url;
    element.addEventListener("error", () => {
      this.unloadVideo(asset.id);
      this.fail(asset);
    });
    // 暂停时拖动或视频刚解出第一帧后，补画一帧
    element.addEventListener("seeked", () => this.redrawIfIdle());
    element.addEventListener("loadeddata", () => this.redrawIfIdle());
    this.videos.set(asset.id, { element, url });
    this.applyVolume();
  }

  private unloadVideo(id: string): void {
    const slot = this.videos.get(id);
    if (!slot) return;
    this.videos.delete(id);
    slot.element.pause();
    slot.element.removeAttribute("src");
    slot.element.load();
    URL.revokeObjectURL(slot.url);
  }

  private redrawIfIdle(): void {
    if (!this.disposed && this.playState !== "playing") this.draw(this.clock.time(performance.now()));
  }

  private applyVolume(): void {
    // 有背景音乐时视频静音；没有时视频声音按主音量播放
    const muteVideos = this.manifest.bgm !== undefined || this.mutedValue;
    for (const { element } of this.videos.values()) {
      element.muted = muteVideos;
      element.volume = this.volumeValue;
    }
  }

  // ---------- 内部：绘制与同步 ----------

  private readonly resolve = (assetId: string, layer: Layer): DrawableAsset | PlaceholderAsset | undefined => {
    if (this.unsupported.has(assetId)) return { placeholder: true };
    if (layer.kind === "image") {
      const bitmap = this.images.get(assetId);
      return bitmap && { source: bitmap, width: bitmap.width, height: bitmap.height, still: true };
    }
    const element = this.videos.get(assetId)?.element;
    if (!element || element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || element.videoWidth === 0) return undefined;
    return { source: element, width: element.videoWidth, height: element.videoHeight };
  };

  private readonly tick = (now: number): void => {
    if (this.disposed || this.playState !== "playing") return;
    let t = this.clock.time(now);

    const audio = this.audio;
    if (this.audioIsMaster && audio && !audio.paused && !audio.ended && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      if (Math.abs(audio.currentTime - t) > CLOCK_DRIFT) {
        this.clock.seek(audio.currentTime, now);
        t = this.clock.time(now);
      }
    }

    if (t >= this.manifest.duration) {
      this.clock.pause(now);
      this.setState("ended");
      this.draw(this.manifest.duration);
      return;
    }
    this.draw(t);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private draw(t: number): void {
    const state = stateAt(this.manifest, t);
    this.sweep(state.pageIndex);
    renderFrame(this.ctx, this.manifest, state, this.resolve, { placeholderText: this.placeholderText });
    this.syncMedia(state, t);
    this.events?.onTime(t);
  }

  private syncMedia(state: FrameState, t: number): void {
    const playing = this.clock.playing;
    this.syncAudio(t, playing);
    this.syncVideos(state, playing, t);
  }

  private syncAudio(t: number, playing: boolean): void {
    const audio = this.audio;
    const bgm = this.manifest.bgm;
    if (!audio || !bgm) return;
    audio.volume = this.mutedValue ? 0 : Math.min(1, Math.max(0, this.volumeValue * bgmGainAt(this.manifest, t)));
    const position = bgmPositionAt(this.manifest, t);
    if (!playing || position === null) {
      if (!audio.paused) audio.pause();
      return;
    }
    if (audio.paused) {
      audio.currentTime = position;
      audio.play().catch((error: unknown) => {
        // 被浏览器策略拦截时停下来让用户再点一次；被 pause() 打断（AbortError）是正常的
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          this.pause();
          this.warn({ code: "autoplay-blocked" });
        }
      });
    } else if (!this.audioIsMaster) {
      const asset = this.assets.get(bgm.assetId);
      if (distance(audio.currentTime, position, asset?.duration) > AUDIO_DRIFT) audio.currentTime = position;
    }
  }

  /** 紧接着的下一页若用到这段视频，返回它的起始位置（素材时间，秒） */
  private nextVideoStart(assetId: string, pageIndex: number): number | undefined {
    const item = this.manifest.pages[pageIndex + 1]?.items.find((i) => i.assetId === assetId);
    return item && (item.clipStart ?? 0);
  }

  private syncVideos(state: FrameState, playing: boolean, t: number): void {
    const currentPage = this.manifest.pages[state.pageIndex];
    const currentPageId = currentPage?.id;
    const active = new Map<string, Layer>();
    for (const layer of state.layers) if (layer.kind === "video") active.set(layer.assetId, layer);

    for (const [id, { element }] of this.videos) {
      const layer = active.get(id);
      if (!layer || layer.videoTime === undefined) {
        if (!element.paused) element.pause();
        // 下一页要用这段视频时先停在起点，页一开始就能出画面，避免 seek 耗时造成的滞后和空白
        const start = this.nextVideoStart(id, state.pageIndex);
        if (start !== undefined && Math.abs(element.currentTime - start) > VIDEO_PRIME_TOLERANCE) element.currentTime = start;
        continue;
      }
      // 转场中上一页的视频停在末帧；暂停时一律停在目标帧
      const shouldRun = playing && layer.pageId === currentPageId;
      // 没有背景音乐时，视频原声每页首尾各淡 0.1 秒，避免相邻视频页切换时爆音（A-05）
      if (shouldRun && currentPage && this.manifest.bgm === undefined) {
        element.volume = this.volumeValue * videoAudioGain(t - currentPage.start, currentPage.duration);
      }
      const tolerance = shouldRun ? VIDEO_DRIFT_PLAYING : VIDEO_DRIFT_PAUSED;
      if (Math.abs(element.currentTime - layer.videoTime) > tolerance) element.currentTime = layer.videoTime;
      if (shouldRun) {
        if (element.paused) void element.play().catch(() => undefined);
      } else if (!element.paused) {
        element.pause();
      }
    }
  }
}

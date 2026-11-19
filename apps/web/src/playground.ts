// 渲染器试验页（仅开发使用）：用程序生成的占位素材渲染清单，便于肉眼检查转场、版式和裁切。
//   /playground.html                      示例清单（16:9）在关键时间点的联系表
//   /playground.html?m=portrait           竖屏（9:16）清单的联系表
//   /playground.html?t=5.1&w=960          在指定时间渲染一帧大图
//   /playground.html?m=gen&seed=3&template=lively&aspect=9:16
//                                         用生成器按一组横竖混合的素材生成清单，每页取一帧（0.4.0 的画面效果）
//   /playground.html?m=gen&title=标题&subtitle=副标题&t=1.5
//                                         在 gen 模式的第一页上叠片头标题图片（与制作器画的是同一张）
//   /playground.html?m=layouts&aspect=9:16
//                                         每种版式一页（再加几页取景示例），每页取一帧（0.4.1 的版式与取景）
//   /playground.html?m=looks              同一张模拟照片套上 原片 和 四款滤镜 的对比
import { CANVAS_SIZE, LAYOUTS, generateManifest, KNOWN_LOOKS, validateManifest, type Layer, type Manifest, type MediaInput, type PagePlan } from "@qyplayer/core";
import { renderFrame, type DrawableAsset } from "@qyplayer/renderer";
import { TITLE_ASSET_ID, TITLE_PATH, renderTitleCard } from "./create/titleCard";
import example from "../../../spec/examples/example.manifest.json";

const params = new URLSearchParams(location.search);

/** 手写的 9:16 清单：覆盖单图、上下两图、三图（上一下二）与 contain 留边。 */
function portraitManifest(): Manifest {
  const gapX = 0.01;
  const gapY = 10.8 / 1920;
  const half = (1 - gapY) / 2;
  const m = {
    formatVersion: "0.1",
    id: "playground-portrait",
    title: "portrait playground",
    createdAt: "2026-11-18T00:00:00+08:00",
    canvas: { aspectRatio: "9:16", width: 1080, height: 1920, background: "#000000" },
    duration: 16,
    assets: [
      { id: "p1", type: "image", src: "media/p1.jpg", width: 1707, height: 2560 },
      { id: "l2", type: "image", src: "media/l2.jpg", width: 2560, height: 1707 },
      { id: "l3", type: "image", src: "media/l3.jpg", width: 2560, height: 1707 },
      { id: "p4", type: "image", src: "media/p4.jpg", width: 1707, height: 2560 },
      { id: "l5", type: "image", src: "media/l5.jpg", width: 2560, height: 1707 },
      { id: "l6", type: "image", src: "media/l6.jpg", width: 2560, height: 1707 },
      { id: "l7", type: "image", src: "media/l7.jpg", width: 2560, height: 1707 },
    ],
    pages: [
      {
        id: "q1", start: 0, duration: 4, transitionIn: { type: "fade", duration: 0.6 },
        items: [{ assetId: "p1", frame: { x: 0, y: 0, w: 1, h: 1 }, fit: "cover" }],
      },
      {
        id: "q2", start: 4, duration: 4, transitionIn: { type: "slide", direction: "up", duration: 0.6 },
        items: [
          { assetId: "l2", frame: { x: 0, y: 0, w: 1, h: half }, fit: "cover" },
          { assetId: "l3", frame: { x: 0, y: half + gapY, w: 1, h: half }, fit: "cover" },
        ],
      },
      {
        id: "q3", start: 8, duration: 4, transitionIn: { type: "zoom", duration: 0.6 },
        items: [
          { assetId: "p4", frame: { x: 0, y: 0, w: 1, h: half }, fit: "cover" },
          { assetId: "l5", frame: { x: 0, y: half + gapY, w: (1 - gapX) / 2, h: half }, fit: "cover" },
          { assetId: "l6", frame: { x: (1 + gapX) / 2, y: half + gapY, w: (1 - gapX) / 2, h: half }, fit: "cover" },
        ],
      },
      {
        id: "q4", start: 12, duration: 4, transitionIn: { type: "fade", duration: 0.6 },
        items: [{ assetId: "l7", frame: { x: 0, y: 0, w: 1, h: 1 }, fit: "contain" }],
      },
    ],
  };
  return m as unknown as Manifest;
}

/** 横竖混合的占位素材，经生成器得到清单（与制作器走同一份生成逻辑） */
function generatedManifest(): Manifest {
  const sizes: [number, number][] = [[2560, 1707], [1707, 2560], [2560, 1440], [1707, 2560], [2560, 1707], [1200, 1200], [1707, 2560], [2560, 1707], [3000, 2000], [1707, 2560], [2560, 1707], [2560, 1707]];
  const media: MediaInput[] = sizes.map(([width, height], i) => ({
    id: `g${String(i + 1).padStart(2, "0")}`,
    type: "image",
    src: `media/g${i + 1}.jpg`,
    mimeType: "image/jpeg",
    source: { mimeType: "image/jpeg", transcoded: false },
    fileName: `g${i + 1}.jpg`,
    width,
    height,
    capturedAt: new Date(Date.UTC(2026, 9, 1, 8, i * 7)).toISOString(),
  }));
  return generateManifest({
    media,
    aspectRatio: params.get("aspect") === "9:16" ? "9:16" : "16:9",
    templateId: params.get("template") ?? "classic",
    seed: Number(params.get("seed") ?? 1),
    keepOrder: true,
    ...(params.has("title") && { titleCard: { id: TITLE_ASSET_ID, src: TITLE_PATH, mimeType: "image/png", ...CANVAS_SIZE[params.get("aspect") === "9:16" ? "9:16" : "16:9"] } }),
    id: "playground-generated",
    createdAt: "2026-11-19T00:00:00+08:00",
  });
}

/** 版式联系表：每个张数的每种版式一页，再加三页取景（放大 2 倍取左上、右下、居中），都由 options.pages 手工编排 */
function layoutsManifest(): Manifest {
  const sizes: [number, number][] = [[2560, 1707], [1707, 2560], [2560, 1440], [1200, 1200]];
  const media: MediaInput[] = [];
  const photo = (): string => {
    const [width, height] = sizes[media.length % sizes.length]!;
    const id = `l${String(media.length + 1).padStart(2, "0")}`;
    media.push({ id, type: "image", src: `media/${id}.jpg`, mimeType: "image/jpeg", source: { mimeType: "image/jpeg", transcoded: false }, fileName: `${id}.jpg`, width, height, capturedAt: new Date(Date.UTC(2026, 9, 1, 8, media.length)).toISOString() });
    return id;
  };
  const pages: PagePlan[] = [];
  for (const count of [1, 2, 3, 4] as const)
    for (const layout of LAYOUTS[count]) pages.push({ layout, items: Array.from({ length: count }, () => ({ assetId: photo() })), duration: 3 });
  for (const [x, y] of [[0, 0], [1, 1], [0.5, 0.5]] as const) pages.push({ items: [{ assetId: photo(), crop: { zoom: 2, x, y } }], duration: 3 });
  return generateManifest({
    media,
    pages,
    aspectRatio: params.get("aspect") === "9:16" ? "9:16" : "16:9",
    templateId: "classic",
    seed: 1,
    keepOrder: true,
    id: "playground-layouts",
    createdAt: "2026-11-19T00:00:00+08:00",
  });
}

/** 滤镜对比用的单张照片清单 */
function looksManifest(): Manifest {
  return generateManifest({
    media: [{ id: "s01", type: "image", src: "media/s01.jpg", mimeType: "image/jpeg", source: { mimeType: "image/jpeg", transcoded: false }, fileName: "s01.jpg", width: 1600, height: 900 }],
    aspectRatio: "16:9",
    templateId: "classic",
    seed: 1,
    id: "playground-looks",
    createdAt: "2026-11-19T00:00:00+08:00",
  });
}

/** 模拟一张照片：天空、草地、肤色、白衣、深色门窗、灰阶条和红绿蓝黄色块，便于判断滤镜对各类颜色的作用 */
function scene(width: number, height: number): DrawableAsset {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  const sky = g.createLinearGradient(0, 0, 0, height * 0.6);
  sky.addColorStop(0, "#4a90d9");
  sky.addColorStop(1, "#cfe6f7");
  g.fillStyle = sky;
  g.fillRect(0, 0, width, height);
  g.fillStyle = "#4f8f3a";
  g.fillRect(0, height * 0.6, width, height * 0.4);
  g.fillStyle = "#3b6b2b";
  g.beginPath();
  g.ellipse(width * 0.2, height * 0.6, width * 0.3, height * 0.12, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = "#f2f2f2";
  g.fillRect(width * 0.42, height * 0.45, width * 0.16, height * 0.38);
  g.fillStyle = "#e0ac8c";
  g.beginPath();
  g.arc(width * 0.5, height * 0.36, height * 0.09, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#1c1c22";
  g.fillRect(width * 0.7, height * 0.1, width * 0.12, height * 0.2);
  const swatches = ["#d93a3a", "#3aa84a", "#3a5fd9", "#e8c92f"];
  swatches.forEach((color, i) => {
    g.fillStyle = color;
    g.fillRect(width * (0.05 + i * 0.07), height * 0.7, width * 0.06, height * 0.1);
  });
  for (let i = 0; i < 8; i++) {
    const v = Math.round((i / 7) * 255);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(width * (0.7 + i * 0.03), height * 0.75, width * 0.03, height * 0.12);
  }
  return { source: canvas, width, height, still: true };
}

function pickManifest(): Manifest {
  const mode = params.get("m");
  const raw = mode === "looks" ? looksManifest() : mode === "portrait" ? portraitManifest() : mode === "gen" || mode === "layouts" ? (mode === "gen" ? generatedManifest() : layoutsManifest()) : (example as unknown as Manifest);
  const result = validateManifest(raw);
  if (!result.ok) throw new Error("playground manifest invalid: " + JSON.stringify(result.errors));
  return result.manifest!;
}

function hue(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** 生成占位素材：渐变底 + 白边 + 对角线 + 编号 + 朝上标记，便于一眼看出裁切、方向和留边。 */
function placeholder(id: string, w: number, h: number, label: string): DrawableAsset {
  const scale = 800 / Math.max(w, h);
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext("2d")!;
  const gradient = g.createLinearGradient(0, 0, cw, ch);
  gradient.addColorStop(0, `hsl(${hue(id)} 70% 45%)`);
  gradient.addColorStop(1, `hsl(${(hue(id) + 60) % 360} 70% 30%)`);
  g.fillStyle = gradient;
  g.fillRect(0, 0, cw, ch);
  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.lineWidth = 10;
  g.strokeRect(5, 5, cw - 10, ch - 10);
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(cw, ch); g.moveTo(cw, 0); g.lineTo(0, ch);
  g.stroke();
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.font = `bold ${Math.round(Math.min(cw, ch) / 4)}px sans-serif`;
  g.fillText(id, cw / 2, ch / 2 + Math.min(cw, ch) / 12);
  g.font = `${Math.round(Math.min(cw, ch) / 14)}px sans-serif`;
  g.fillText(label, cw / 2, ch / 2 + Math.min(cw, ch) / 4);
  g.fillText("TOP", cw / 2, Math.min(cw, ch) / 9 + 10);
  return { source: canvas, width: cw, height: ch, still: true };
}

const manifest = pickManifest();
const assetById = new Map(manifest.assets.map((a) => [a.id, a]));

const sceneAsset = params.get("m") === "looks" ? scene(1600, 900) : undefined;

let titleBitmap: ImageBitmap | undefined;

function resolve(assetId: string, layer: Layer): DrawableAsset | undefined {
  if (sceneAsset) return sceneAsset;
  if (assetId === TITLE_ASSET_ID) return titleBitmap && { source: titleBitmap, width: titleBitmap.width, height: titleBitmap.height, still: true };
  const asset = assetById.get(assetId);
  if (!asset?.width || !asset.height) return undefined;
  const label = layer.kind === "video" ? `video @ ${layer.videoTime?.toFixed(2)}s` : `${asset.width}x${asset.height}`;
  return placeholder(assetId, asset.width, asset.height, label);
}

function addFrame(root: HTMLElement, t: number, displayWidth: number): void {
  const ratio = manifest.canvas.width / manifest.canvas.height;
  const canvas = document.createElement("canvas");
  canvas.width = displayWidth;
  canvas.height = Math.round(displayWidth / ratio);
  const state = renderFrame(canvas.getContext("2d")!, manifest, t, resolve);
  const figure = document.createElement("figure");
  const caption = document.createElement("figcaption");
  caption.textContent = `t=${t.toFixed(2)}s  page ${state.pageIndex + 1}  layers ${state.layers.length}`;
  figure.append(canvas, caption);
  root.append(figure);
}

const root = document.getElementById("root")!;
void (async () => {
  if (params.has("title")) {
    const { width, height } = manifest.canvas;
    titleBitmap = await createImageBitmap(await renderTitleCard({ title: params.get("title")!, subtitle: params.get("subtitle") ?? "", width, height }));
  }
  buildSheet();
  document.title = "playground ready";
})();

function buildSheet(): void {
if (params.get("m") === "looks") {
  for (const look of [undefined, ...KNOWN_LOOKS]) {
    const canvas = document.createElement("canvas");
    canvas.width = 260;
    canvas.height = 146;
    renderFrame(canvas.getContext("2d")!, { ...manifest, ...(look && { look }) }, 1.5, resolve);
    const figure = document.createElement("figure");
    const caption = document.createElement("figcaption");
    caption.textContent = look ?? "original";
    figure.append(canvas, caption);
    root.append(figure);
  }
} else if (params.has("t")) {
  addFrame(root, Number(params.get("t")), Number(params.get("w") ?? 960));
} else {
  const portrait = params.get("m") === "portrait";
  const generated = params.get("m") === "gen" || params.get("m") === "layouts";
  const times = generated
    ? manifest.pages.map((p) => p.start + p.duration * 0.75)
    : portrait
      ? [0.3, 2, 4.3, 6, 8.3, 10, 12.3, 14]
      : [0.3, 2, 4.8, 5.1, 5.5, 7, 11.5, 15, 19.5, 20.05, 22, 25.6];
  const width = manifest.canvas.height > manifest.canvas.width ? 180 : portrait ? 180 : 320;
  for (const t of times) addFrame(root, t, width);
}
}

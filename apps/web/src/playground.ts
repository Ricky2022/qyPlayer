// 渲染器试验页（仅开发使用）：用程序生成的占位素材渲染清单，便于肉眼检查转场、版式和裁切。
//   /playground.html                      示例清单（16:9）在关键时间点的联系表
//   /playground.html?m=portrait           竖屏（9:16）清单的联系表
//   /playground.html?t=5.1&w=960          在指定时间渲染一帧大图
import { validateManifest, type Layer, type Manifest } from "@qyplayer/core";
import { renderFrame, type DrawableAsset } from "@qyplayer/renderer";
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

function pickManifest(): Manifest {
  const raw = params.get("m") === "portrait" ? portraitManifest() : (example as unknown as Manifest);
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
  return { source: canvas, width: cw, height: ch };
}

const manifest = pickManifest();
const assetById = new Map(manifest.assets.map((a) => [a.id, a]));

function resolve(assetId: string, layer: Layer): DrawableAsset | undefined {
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
if (params.has("t")) {
  addFrame(root, Number(params.get("t")), Number(params.get("w") ?? 960));
} else {
  const portrait = params.get("m") === "portrait";
  const times = portrait
    ? [0.3, 2, 4.3, 6, 8.3, 10, 12.3, 14]
    : [0.3, 2, 4.8, 5.1, 5.5, 7, 11.5, 15, 19.5, 20.05, 22, 25.6];
  const width = portrait ? 180 : 320;
  for (const t of times) addFrame(root, t, width);
}
document.title = "playground ready";

// 清单类型，与 spec/manifest.schema.json 和 PRD 7.5 一一对应。
// type / direction 字段声明为 string：按 PRD 7.6 播放器必须容忍未知取值并降级处理。

export type AspectRatio = "16:9" | "9:16";
export type Direction = "left" | "right" | "up" | "down";
export type Fit = "cover" | "contain";
export type AssetType = "image" | "video" | "audio";

export const KNOWN_TRANSITION_TYPES = ["none", "fade", "slide", "zoom"] as const;
export const KNOWN_ENTER_TYPES = ["none", "fade", "slide", "scale"] as const;
export const KNOWN_DIRECTIONS: readonly Direction[] = ["left", "right", "up", "down"];

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GeneratorInfo {
  name: string;
  version: string;
  templateId?: string;
  seed?: number;
}

export interface Canvas {
  aspectRatio: AspectRatio;
  width: number;
  height: number;
  background: string;
}

/** 素材转码前的类型；包格式 0.2 起每个素材都记录（见 docs/dev-0.3.0.md 4.2） */
export interface AssetSource {
  mimeType: string;
  transcoded: boolean;
}

export interface Asset {
  id: string;
  type: AssetType;
  src: string;
  /** 包格式 0.2 起必填；0.1 的包没有 */
  mimeType?: string;
  source?: AssetSource;
  width?: number;
  height?: number;
  duration?: number;
  hasAudio?: boolean;
  capturedAt?: string;
  original?: string;
  title?: string;
  license?: string;
}

export interface Bgm {
  assetId: string;
  volume?: number;
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
}

export interface TransitionIn {
  type: string;
  direction?: string;
  duration: number;
}

export interface Enter {
  type: string;
  direction?: string;
  delay?: number;
  duration: number;
}

export interface Item {
  assetId: string;
  frame: Frame;
  fit?: Fit;
  clipStart?: number;
  enter?: Enter;
}

export interface Page {
  id: string;
  start: number;
  duration: number;
  transitionIn?: TransitionIn;
  items: Item[];
}

export interface Manifest {
  formatVersion: string;
  id: string;
  title: string;
  createdAt: string;
  generator?: GeneratorInfo;
  canvas: Canvas;
  duration: number;
  cover?: string;
  assets: Asset[];
  bgm?: Bgm;
  pages: Page[];
}

/** 本实现支持的清单格式版本。1.0 之前只接受列表里的版本（PRD 7.6）；0.2 起新写入的包用最后一个。 */
export const SUPPORTED_FORMAT_VERSIONS: readonly string[] = ["0.1", "0.2"];

/** 清单引用的全部包内路径（素材、原片、封面），用于路径安全校验和缺失文件检查。 */
export function referencedPaths(manifest: Manifest): string[] {
  const paths = new Set<string>();
  for (const asset of manifest.assets) {
    paths.add(asset.src);
    if (asset.original) paths.add(asset.original);
  }
  if (manifest.cover) paths.add(manifest.cover);
  return [...paths];
}

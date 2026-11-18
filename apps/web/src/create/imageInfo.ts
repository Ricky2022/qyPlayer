// 读取图片的显示尺寸（已按 EXIF 方向转正，docs/dev-0.3.0.md 4.2、5.3）。

export interface PixelSize {
  width: number;
  height: number;
}

/** EXIF 方向 5 到 8 表示图片要转 90 度显示，宽高对调；其他方向宽高不变 */
export function displaySizeFor(width: number, height: number, orientation: number | undefined): PixelSize {
  return orientation !== undefined && orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}

/** 文件头里一般就有尺寸和 EXIF；读这么多字节用来解析 */
const HEADER_BYTES = 4 * 1024 * 1024;

/**
 * 先用 createImageBitmap 取（默认已按 EXIF 方向转正）；浏览器解不了（例如 Chrome 里的 HEIC）就解析文件头，
 * 方向要自己处理。仍然取不到返回 undefined，由调用方报 decode。
 */
export async function readImageSize(file: Blob): Promise<PixelSize | undefined> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    // 继续用文件头解析
  }
  try {
    const { imageSize } = await import("image-size");
    const bytes = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
    const parsed = imageSize(bytes);
    if (!parsed.width || !parsed.height) return undefined;
    const orientation = parsed.orientation ?? (await readOrientation(file));
    return displaySizeFor(parsed.width, parsed.height, orientation);
  } catch {
    return undefined;
  }
}

async function readOrientation(file: Blob): Promise<number | undefined> {
  try {
    const { default: exifr } = await import("exifr");
    return await exifr.orientation(file);
  } catch {
    return undefined;
  }
}

// 用 libheif-js 解码 HEIC/HEIF（docs/dev-0.3.0.md 5.5、9.2）。
// libheif 作为独立的 .wasm 和 JS 文件输出，不与应用代码合并；第一次用到时才动态加载。
import type createLibheif from "libheif-js/libheif-wasm/libheif.js";

type Libheif = ReturnType<typeof createLibheif>;

let loading: Promise<Libheif> | undefined;

const loadLibheif = async function loadLibheif(): Promise<Libheif> {
    loading ??= (async () => {
        const [{default: create}, {default: wasmUrl}] = await Promise.all([
            import("libheif-js/libheif-wasm/libheif.js"),
            import("libheif-js/libheif-wasm/libheif.wasm?url"),
        ]);
        const response = await fetch(wasmUrl);
        if (!response.ok) {
            throw new Error(`libheif wasm: HTTP ${response.status}`);
        }
        const wasmBinary = await response.arrayBuffer();
        return new Promise<Libheif>((resolve, reject) => {
            try {
                // 回调可能在 create 返回前就触发，放到下一个微任务里再取 module
                // eslint-disable-next-line @stylistic/max-len, no-void
                const module: Libheif = create({wasmBinary, onRuntimeInitialized: () => void Promise.resolve().then(() => resolve(module))});
            } catch (error) {
                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                reject(error);
            }
        });
    })();
    // 加载失败不缓存，下次还能重试
    loading.catch(() => {
        loading = undefined;
    });
    return loading;
};

/** 解码后的像素，RGBA，已按图片自带的旋转和镜像转正 */
export interface DecodedHeic {
    data: Uint8ClampedArray<ArrayBuffer>;
    width: number;
    height: number;
}

/** 解码 HEIC/HEIF 的主图。文件损坏或不是 HEIC 时抛出错误 */
export const decodeHeic = async function decodeHeic(file: Blob): Promise<DecodedHeic> {
    const libheif = await loadLibheif();
    const images = new libheif.HeifDecoder().decode(new Uint8Array(await file.arrayBuffer()));
    const [first, ...others] = images;
    if (!first) {
        throw new Error("heic: no image found");
    }
    // 文件里可能同时有缩略图，取面积最大的
    // eslint-disable-next-line @stylistic/max-len
    const image = others.reduce((best, candidate) => candidate.get_width() * candidate.get_height() > best.get_width() * best.get_height() ? candidate : best, first);
    const width = image.get_width();
    const height = image.get_height();
    const target = {data: new Uint8ClampedArray(width * height * 4), width, height};
    await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        image.display(target, (result) => result ? resolve() : reject(new Error("heic: decode failed")));
    });
    return target;
};

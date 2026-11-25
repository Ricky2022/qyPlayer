// 封面（docs/dev-0.3.0.md 5.7）：保存包时写入 cover.jpg，内容是第一页第一个素材的画面。
// 取不到画面（本机解不了、没有转码）时不写 cover，也不报错。
import type {Manifest} from "@qyplayer/core";
import {ALL_FORMATS, BlobSource, CanvasSink, Input} from "mediabunny";
import type {BlobFile} from "./buildPackage";
import {fitWithin} from "./files";

export const COVER_PATH = "cover.jpg";
/** 封面长边不超过的像素数（T-25） */
export const COVER_MAX_SIDE = 640;
const COVER_QUALITY = 0.8;

export interface CoverTarget {
    /** 播放文件（原样放入的原始文件，或转码后的结果） */
    blob: Blob;
    type: "image" | "video";
    /** 视频取这个时间点的帧（秒） */
    clipStart: number;
}

/** 第一页第一个素材和它对应的文件；清单里找不到素材或文件时返回 undefined */
export const coverTarget = function coverTarget(manifest: Manifest, files: readonly BlobFile[]): CoverTarget | undefined {
    const item = manifest.pages[0]?.items[0];
    const asset = item && manifest.assets.find((a) => a.id === item.assetId);
    if (!item || !asset || (asset.type !== "image" && asset.type !== "video")) {
        return undefined;
    }
    const file = files.find((f) => f.path === asset.src);
    return file && {blob: file.data, type: asset.type, clipStart: item.clipStart ?? 0};
};

/** 把封面放进文件列表，并让清单的 cover 指向它 */
export const withCover = function withCover(manifest: Manifest, files: readonly BlobFile[], cover: Blob): {
    manifest: Manifest;
    files: BlobFile[];
} {
    return {manifest: {...manifest, cover: COVER_PATH}, files: [...files, {path: COVER_PATH, data: cover}]};
};

const encodeJpeg = async function encodeJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("canvas is not available");
    }
    ctx.drawImage(source, 0, 0, width, height);
    return canvas.convertToBlob({type: "image/jpeg", quality: COVER_QUALITY});
};

const imageCover = async function imageCover(blob: Blob): Promise<Blob> {
    const bitmap = await createImageBitmap(blob);
    try {
        const {width, height} = fitWithin(bitmap.width, bitmap.height, COVER_MAX_SIDE);
        return await encodeJpeg(bitmap, width, height);
    } finally {
        bitmap.close();
    }
};

const videoCover = async function videoCover(blob: Blob, clipStart: number): Promise<Blob | undefined> {
    const input = new Input({source: new BlobSource(blob), formats: ALL_FORMATS});
    try {
        const track = await input.getPrimaryVideoTrack();
        if (!track || !await track.canDecode()) {
            return undefined;
        }
        const {width, height} = fitWithin(await track.getDisplayWidth(), await track.getDisplayHeight(), COVER_MAX_SIDE);
        const sink = new CanvasSink(track, {width, height, fit: "fill"});
        const frame = await sink.getCanvas(clipStart) ?? await sink.getCanvas(await track.getFirstTimestamp());
        return frame ? await encodeJpeg(frame.canvas, width, height) : undefined;
    } finally {
        input.dispose();
    }
};

/** 渲染封面；解不了画面时返回 undefined */
export const renderCover = async function renderCover(target: CoverTarget): Promise<Blob | undefined> {
    try {
        return target.type === "image" ? await imageCover(target.blob) : await videoCover(target.blob, target.clipStart);
    } catch {
        return undefined;
    }
};

/** 给包加上封面；取不到画面就原样返回 */
export const addCover = async function addCover(manifest: Manifest, files: readonly BlobFile[]): Promise<{
    manifest: Manifest;
    files: BlobFile[];
}> {
    const target = coverTarget(manifest, files);
    const cover = target && await renderCover(target);
    return cover ? withCover(manifest, files, cover) : {manifest, files: [...files]};
};

// 导出时按帧提供素材画面：图片解码成位图，视频用 mediabunny 从头到尾顺序解码。
// 素材只在用到的那几页里保持打开，页过去就释放，所以内存不随素材数量增长。
import type {FrameState, Manifest} from "@qyplayer/core";
import type {AssetResolver, DrawableAsset} from "@qyplayer/renderer";
import {ALL_FORMATS, BlobSource, CanvasSink, Input, type WrappedCanvas} from "mediabunny";
import {fitWithin} from "../files";
import {videoLayers, videoTimestamps} from "./spec";

/** 视频帧缩到长边不超过这个值：输出最大 1920 像素，更大的画面只会白白占内存 */
const VIDEO_MAX_SIDE = 1920;

export interface FrameProvider {
    /** 为这一帧准备好所有图层的素材。必须在 renderFrame 前调用，且按帧的先后顺序逐帧调用 */
    prepare: (state: FrameState) => Promise<void>;
    readonly resolve: AssetResolver;
    dispose: () => void;
}

interface VideoSlot {
    input: Input;
    frames: AsyncGenerator<WrappedCanvas | null, void, unknown>;
    /** 上一次取到的帧；解码器这一次没给出帧时继续用它 */
    last: WrappedCanvas | undefined;
}

// eslint-disable-next-line @stylistic/max-len
export const createFrameProvider = function createFrameProvider(manifest: Manifest, readBlob: (path: string) => Promise<Blob>): FrameProvider {
    const assets = new Map(manifest.assets.map((a) => [a.id, a]));
    const timestamps = videoTimestamps(manifest);
    const images = new Map<string, ImageBitmap>();
    const videos = new Map<string, VideoSlot>();
    let ready = new Map<string, DrawableAsset>();

    const releaseVideo = (slot: VideoSlot): void => {
        void slot.frames.return(undefined);
        slot.input.dispose();
    };

    const openVideo = async (assetId: string): Promise<VideoSlot> => {
        const asset = assets.get(assetId);
        const list = timestamps.get(assetId);
        if (!asset || !list) {
            throw new Error(`export: no video ${assetId}`);
        }
        const input = new Input({source: new BlobSource(await readBlob(asset.src)), formats: ALL_FORMATS});
        try {
            const track = await input.getPrimaryVideoTrack();
            if (!track) {
                throw new Error(`export: ${asset.src} has no video track`);
            }
            const size = fitWithin(await track.getDisplayWidth(), await track.getDisplayHeight(), VIDEO_MAX_SIDE);
            const sink = new CanvasSink(track, {...size, fit: "fill"});
            return {input, frames: sink.canvasesAtTimestamps(list), last: undefined};
        } catch (error) {
            input.dispose();
            throw error;
        }
    };

    return {
        async prepare(state) {
            const present = new Set(state.layers.map((layer) => layer.assetId));
            for (const [id, bitmap] of images) {
                if (present.has(id)) {
                    continue;
                }
                bitmap.close();
                images.delete(id);
            }
            for (const [id, slot] of videos) {
                if (present.has(id)) {
                    continue;
                }
                releaseVideo(slot);
                videos.delete(id);
            }

            ready = new Map();
            for (const layer of state.layers) {
                if (layer.kind !== "image" || ready.has(layer.assetId)) {
                    continue;
                }
                let bitmap = images.get(layer.assetId);
                if (!bitmap) {
                    const asset = assets.get(layer.assetId);
                    if (!asset) {
                        continue;
                    }
                    bitmap = await createImageBitmap(await readBlob(asset.src));
                    images.set(layer.assetId, bitmap);
                }
                ready.set(layer.assetId, {source: bitmap, width: bitmap.width, height: bitmap.height, still: true});
            }
            for (const layer of videoLayers(state)) {
                if (ready.has(layer.assetId)) {
                    continue;
                }
                let slot = videos.get(layer.assetId);
                if (!slot) {
                    slot = await openVideo(layer.assetId);
                    videos.set(layer.assetId, slot);
                }
                const next = await slot.frames.next();
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                const frame = next.done ? slot.last : next.value ?? slot.last;
                if (!frame) {
                    continue;
                }
                slot.last = frame;
                ready.set(layer.assetId, {source: frame.canvas, width: frame.canvas.width, height: frame.canvas.height});
            }
        },
        resolve: (assetId) => ready.get(assetId),
        dispose() {
            for (const bitmap of images.values()) {
                bitmap.close();
            }
            images.clear();
            for (const slot of videos.values()) {
                releaseVideo(slot);
            }
            videos.clear();
        },
    };
};

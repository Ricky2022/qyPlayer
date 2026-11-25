// 导出前的检查（docs/dev-0.3.0.md 10.2）：影片里有任何素材在本机无法解码，就不能导出。
import type {Manifest} from "@qyplayer/core";
import {ALL_FORMATS, BlobSource, Input} from "mediabunny";
import {browserPreflightEnv, preflightAssets, type PreflightEnv} from "../../player/preflight";

export interface ExportCheckEnv extends PreflightEnv {
    /** 导出用 WebCodecs 逐帧解码视频，所以除了能播放，还要问一次解码器 */
    canDecodeVideo: (blob: Blob) => Promise<boolean>;
}

export const browserExportCheckEnv = function browserExportCheckEnv(): ExportCheckEnv {
    return {
        ...browserPreflightEnv(),
        canDecodeVideo: async (blob) => {
            const input = new Input({source: new BlobSource(blob), formats: ALL_FORMATS});
            try {
                const track = await input.getPrimaryVideoTrack();
                return track !== null && await track.canDecode();
            } finally {
                input.dispose();
            }
        },
    };
};

/**
 * 找出本机无法解码的素材，返回素材 id（按清单顺序，包含背景音乐）。
 * 先做播放预检（6.1：视频和音频问 canPlayType，不在白名单的图片试解码），
 * 再对通过预检的视频问 WebCodecs 能否解码。读取素材失败（包损坏）直接抛出。
 */
// eslint-disable-next-line @stylistic/max-len
export const findUndecodable = async function findUndecodable(manifest: Manifest, readBlob: (path: string) => Promise<Blob>, env: ExportCheckEnv): Promise<string[]> {
    const {unsupported} = await preflightAssets(manifest, readBlob, env);
    const bad = new Set(unsupported);
    for (const asset of manifest.assets) {
        if (asset.type !== "video" || bad.has(asset.id)) {
            continue;
        }
        const blob = await readBlob(asset.src);
        let ok: boolean;
        try {
            ok = await env.canDecodeVideo(blob);
        } catch {
            ok = false;
        }
        if (!ok) {
            bad.add(asset.id);
        }
    }
    return manifest.assets.filter((asset) => bad.has(asset.id)).map((asset) => asset.id);
};

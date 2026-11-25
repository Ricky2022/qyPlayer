// 读取视频的元数据（docs/dev-0.3.0.md 5.3、5.4），用 mediabunny 解析 MP4、M4V、MOV，不重新编码。
import {MediaFormatError} from "@qyplayer/qyp/inspect";
import {BlobSource, Input, MP4, QTFF} from "mediabunny";
import {containerCapturedAt} from "./capturedAt";
import {withCodecs} from "./mediaType";

export interface VideoProbe {
    /** 显示尺寸：已按旋转信息（0、90、180、270 度）转正 */
    width: number;
    height: number;
    /** 秒 */
    duration: number;
    hasAudio: boolean;
    /** 4.3 的写法：容器（ftyp 品牌为 qt 的写 video/quicktime，其余写 video/mp4）加编码字符串，取不到编码时省略 */
    mimeType: string;
    /** 容器的创建时间（UTC，不带毫秒）；没有或不可信时缺省 */
    capturedAt?: string;
}

/** 解析一个视频文件。读不了、没有视频轨、时长读不到时抛出 MediaFormatError */
export const probeVideo = async function probeVideo(file: Blob, name: string): Promise<VideoProbe> {
    const input = new Input({source: new BlobSource(file), formats: [MP4, QTFF]});
    try {
        const format = await input.getFormat().catch((cause: unknown) => {
            throw new MediaFormatError("unreadable", `${name}: cannot be read; the file may be damaged or in an unsupported format`, {name}, {cause});
        });
        const video = await input.getPrimaryVideoTrack();
        if (!video) {
            throw new MediaFormatError("no-video-track", `${name}: no video track found`, {name});
        }
        const audio = await input.getPrimaryAudioTrack();
        const duration = await input.computeDuration();
        if (!Number.isFinite(duration) || duration <= 0) {
            throw new MediaFormatError("no-duration", `${name}: duration cannot be determined`, {name});
        }

        const [width, height, videoCodec, audioCodec, tags] = await Promise.all([
            video.getDisplayWidth(),
            video.getDisplayHeight(),
            video.getCodecParameterString(),
            audio ? audio.getCodecParameterString() : Promise.resolve(null),
            input.getMetadataTags(),
        ]);
        if (!width || !height) {
            throw new MediaFormatError("no-video-track", `${name}: video size cannot be determined`, {name});
        }
        const capturedAt = containerCapturedAt(tags.creationTime ?? tags.date);
        return {
            width,
            height,
            duration,
            hasAudio: audio !== null,
            mimeType: withCodecs(format.mimeType, [videoCodec, audioCodec]),
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            ...capturedAt && {capturedAt},
        };
    } catch (error) {
        if (error instanceof MediaFormatError) {
            throw error;
        }
        throw new MediaFormatError("unreadable", `${name}: cannot be read; the file may be damaged or in an unsupported format`, {name}, {cause: error});
    } finally {
        input.dispose();
    }
};

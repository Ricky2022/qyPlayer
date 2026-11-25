// 保存时的转码流程（docs/dev-0.3.0.md 5.5）：先按当前编辑状态生成清单，再逐个素材转码，最后把结果写回。
// 具体的解码和编码由 TranscodeWorkers 提供（浏览器环境），这里只负责挑选素材、缓存、进度、取消和失败回退。
import type {Manifest} from "@qyplayer/core";
import {idFor, type BlobFile, type MediaEntry, type MusicEntry} from "../buildPackage";
import {baseMimeType} from "../mediaType";
import {TranscodeCache} from "./cache";
import {applyTranscoded, type TranscodedAsset} from "./patch";

/** 视频要保留的区间（秒），位于源文件的时间轴上 */
export interface ClipRange {
    start: number;
    end: number;
}

/** 具体的转码实现。进度参数是 0 到 1；收到 signal 的 abort 后应尽快停止并抛出 AbortError */
export interface TranscodeWorkers {
    image: (blob: Blob, mimeType: string, signal: AbortSignal) => Promise<TranscodedAsset>;
    // eslint-disable-next-line @stylistic/max-len
    video: (blob: Blob, entry: MediaEntry, range: ClipRange, onProgress: (fraction: number) => void, signal: AbortSignal) => Promise<TranscodedAsset>;
    audio: (blob: Blob, onProgress: (fraction: number) => void, signal: AbortSignal) => Promise<TranscodedAsset>;
}

export interface TranscodeProgress {
    /** 正在处理第几个（从 1 开始）和一共几个 */
    index: number;
    total: number;
    /** 整体进度，0 到 1 */
    fraction: number;
}

/** 参与转码的素材：final 为真表示 blob 已是最终文件（从包还原），不再转码 */
export type TranscodeMedia = MediaEntry & {final?: boolean};

export interface TranscodeRequest {
    manifest: Manifest;
    files: readonly BlobFile[];
    media: readonly TranscodeMedia[];
    music?: MusicEntry;
    /** 编码器能否输出 AAC；不能时 WAV 配乐原样放入 */
    audioEncode: boolean;
    cache: TranscodeCache;
    workers: TranscodeWorkers;
    signal: AbortSignal;
    onProgress?: (progress: TranscodeProgress) => void;
}

export interface TranscodeOutcome {
    manifest: Manifest;
    files: BlobFile[];
    /** 转码失败、已原样放入的素材名称 */
    failed: string[];
}

export const abortError = function abortError(): DOMException {
    return new DOMException("The operation was aborted.", "AbortError");
};

export const isAbortError = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";

interface Job {
    assetId: string;
    name: string;
    blob: Blob;
    cacheKey: string;
    run: (onProgress: (fraction: number) => void) => Promise<TranscodedAsset>;
}

const planJobs = function planJobs(request: TranscodeRequest): Job[] {
    const {manifest, workers, signal} = request;
    const jobs: Job[] = [];
    request.media.forEach((entry, index) => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (entry.final || entry.source.transcoded) {
            return;
        }
        const assetId = idFor(index);
        const base = {assetId, name: entry.fileName, blob: entry.blob};
        if (entry.type === "image") {
            jobs.push({...base, cacheKey: "image", run: async () => workers.image(entry.blob, entry.mimeType, signal)});
            return;
        }
        const page = manifest.pages.find((p) => p.items.some((item) => item.assetId === assetId));
        const item = page?.items.find((i) => i.assetId === assetId);
        if (!page || !item) {
            return;
        }
        const start = item.clipStart ?? 0;
        const range = {start, end: start + page.duration};
        jobs.push({...base, cacheKey: `video:${range.start}:${range.end}`, run: async (onProgress) => workers.video(entry.blob, entry, range, onProgress, signal)});
    });

    const {music} = request;
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (music && request.audioEncode && baseMimeType(music.mimeType) === "audio/wav" && !music.source?.transcoded) {
        jobs.push({assetId: "bgm", name: music.title ?? "audio", blob: music.blob, cacheKey: "audio", run: async (onProgress) => workers.audio(music.blob, onProgress, signal)});
    }
    return jobs;
};

/**
 * 转码需要转码的素材（图片、视频、WAV 配乐），结果按“素材 + 参数”缓存。
 * 某个素材失败时它原样放入并记入 failed，不影响其他素材；取消（signal abort）时抛出 AbortError。
 */
export const transcodeForSave = async function transcodeForSave(request: TranscodeRequest): Promise<TranscodeOutcome> {
    const jobs = planJobs(request);
    const results = new Map<string, TranscodedAsset>();
    const failed: string[] = [];
    const report = (index: number, fraction: number): void =>
        request.onProgress?.({index: Math.min(index + 1, jobs.length), total: jobs.length, fraction: (index + fraction) / jobs.length});

    for (const [index, job] of jobs.entries()) {
        if (request.signal.aborted) {
            throw abortError();
        }
        report(index, 0);
        const cached = request.cache.get(job.blob, job.cacheKey);
        if (cached) {
            results.set(job.assetId, cached);
            continue;
        }
        try {
            const result = await job.run((fraction) => report(index, Math.min(1, Math.max(0, fraction))));
            request.cache.set(job.blob, job.cacheKey, result);
            results.set(job.assetId, result);
        } catch (error) {
            if (request.signal.aborted || isAbortError(error)) {
                throw abortError();
            }
            failed.push(job.name);
        }
    }
    if (jobs.length > 0) {
        report(jobs.length, 0);
    }
    return {...applyTranscoded(request.manifest, request.files, results), failed};
};

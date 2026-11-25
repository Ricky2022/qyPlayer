import {describe, expect, it, vi} from "vitest";
import {validateManifest} from "@qyplayer/core";
import {planPackage, type MediaEntry, type MusicEntry} from "../buildPackage";
import {TranscodeCache} from "./cache";
import {abortError, isAbortError, transcodeForSave, type TranscodeProgress, type TranscodeRequest, type TranscodeWorkers} from "./run";

const MOV = "video/quicktime; codecs=\"hvc1.1.2.l120.90, mp4a.40.2\"";
const MP4 = "video/mp4; codecs=\"avc1.640028, mp4a.40.2\"";
const AAC = "audio/mp4; codecs=\"mp4a.40.2\"";

const photo = function photo(name: string, mimeType = "image/heic"): MediaEntry {
    return {fileName: name, type: "image", blob: new Blob([name]), mimeType, source: {mimeType, transcoded: false}, width: 4032, height: 3024};
};

const movie = function movie(name: string, duration = 40): MediaEntry {
    return {fileName: name, type: "video", blob: new Blob([name]), mimeType: MOV, source: {mimeType: MOV, transcoded: false}, width: 3840, height: 2160, duration, hasAudio: true};
};

const wav: MusicEntry = {blob: new Blob(["wav"]), mimeType: "audio/wav", duration: 30, title: "song.wav"};

const makeWorkers = function makeWorkers(overrides: Partial<TranscodeWorkers> = {}): TranscodeWorkers {
    return {
        image: vi.fn(async (blob: Blob) => ({blob: new Blob([`jpeg:${await blob.text()}`]), mimeType: "image/jpeg", width: 2560, height: 1920})),
        video: vi.fn(async (blob: Blob, _entry: MediaEntry, range: {
            start: number;
            end: number;
        }) => ({
            blob: new Blob([`mp4:${await blob.text()}`]),
            mimeType: MP4,
            width: 1920,
            height: 1080,
            duration: range.end - range.start,
        })),
        // eslint-disable-next-line @typescript-eslint/require-await
        audio: vi.fn(async () => ({blob: new Blob(["aac"]), mimeType: AAC})),
        ...overrides,
    };
};

const request = function request(media: MediaEntry[], extra: Partial<TranscodeRequest> & {music?: MusicEntry} = {}): TranscodeRequest {
    const {manifest, files} = planPackage({media, ...extra.music && {music: extra.music}, templateId: "classic", seed: 7});
    // eslint-disable-next-line @stylistic/max-len
    return {manifest, files, media, audioEncode: true, cache: new TranscodeCache(), workers: makeWorkers(), signal: new AbortController().signal, ...extra};
};

describe("transcodeForSave", () => {
    it("把 HEIC 转成 JPEG：新路径、新类型、transcoded 为 true，source 保持原始类型", async () => {
        const outcome = await transcodeForSave(request([photo("a.heic")]));
        const asset = outcome.manifest.assets[0]!;
        expect(asset).toMatchObject({src: "media/m001.jpg", mimeType: "image/jpeg", width: 2560, height: 1920, source: {mimeType: "image/heic", transcoded: true}});
        expect(outcome.files.map((f) => f.path)).toEqual(["media/m001.jpg"]);
        expect(await outcome.files[0]!.data.text()).toBe("jpeg:a.heic");
        expect(outcome.failed).toEqual([]);
    });

    it("视频只留页内使用的片段，clipStart 改为 0，时长等于片段时长", async () => {
        const req = request([movie("clip.mov")]);
        const page = req.manifest.pages[0]!;
        const clipStart = page.items[0]!.clipStart!;
        expect(clipStart).toBeGreaterThan(0);

        const outcome = await transcodeForSave(req);
        // eslint-disable-next-line @stylistic/max-len
        expect(req.workers.video).toHaveBeenCalledWith(expect.anything(), expect.anything(), {start: clipStart, end: clipStart + page.duration}, expect.any(Function), req.signal);
        const asset = outcome.manifest.assets[0]!;
        expect(asset).toMatchObject({src: "media/m001.mp4", mimeType: MP4, duration: page.duration, source: {mimeType: MOV, transcoded: true}});
        expect(outcome.manifest.pages[0]!.items[0]!.clipStart).toBe(0);
        expect(outcome.manifest.pages[0]!.duration).toBe(page.duration);
        expect(validateManifest(outcome.manifest).errors).toEqual([]);
    });

    it("WAV 配乐转成 AAC；编码器不支持 AAC 时原样放入且不算失败", async () => {
        const converted = await transcodeForSave(request([photo("a.jpg", "image/jpeg")], {music: wav}));
        const bgm = converted.manifest.assets.find((a) => a.id === "bgm")!;
        expect(bgm).toMatchObject({src: "audio/bgm.m4a", mimeType: AAC, source: {mimeType: "audio/wav", transcoded: true}});

        const skipped = await transcodeForSave(request([photo("a.jpg", "image/jpeg")], {music: wav, audioEncode: false}));
        expect(skipped.manifest.assets.find((a) => a.id === "bgm")).toMatchObject({src: "audio/bgm.wav", mimeType: "audio/wav", source: {transcoded: false}});
        expect(skipped.failed).toEqual([]);
    });

    it("MP3 和 M4A 配乐不动", async () => {
        const mp3: MusicEntry = {blob: new Blob(["mp3"]), mimeType: "audio/mpeg", duration: 30};
        const req = request([photo("a.jpg", "image/jpeg")], {music: mp3});
        await transcodeForSave(req);
        expect(req.workers.audio).not.toHaveBeenCalled();
    });

    it("已转码的素材和从包还原的素材（final）不再转码", async () => {
        const done = {...photo("done.jpg", "image/jpeg"), source: {mimeType: "image/heic", transcoded: true}};
        const restored = {...movie("restored.mp4"), final: true};
        const req = request([done, restored]);
        const outcome = await transcodeForSave(req);
        expect(req.workers.image).not.toHaveBeenCalled();
        expect(req.workers.video).not.toHaveBeenCalled();
        expect(outcome.manifest).toEqual(req.manifest);
        expect(outcome.files).toEqual(req.files);
    });

    it("某个素材失败：它原样放入并列在 failed 里，其余素材正常，整次保存不失败", async () => {
        const workers = makeWorkers({
            image: vi.fn(async (blob: Blob) => {
                if (await blob.text() === "bad.heic") {
                    throw new Error("decode failed");
                }
                return {blob: new Blob(["ok"]), mimeType: "image/jpeg", width: 100, height: 80};
            }),
        });
        const outcome = await transcodeForSave(request([photo("bad.heic"), photo("good.heic")], {workers}));
        expect(outcome.failed).toEqual(["bad.heic"]);
        expect(outcome.manifest.assets[0]).toMatchObject({src: "media/m001.heic", mimeType: "image/heic", source: {transcoded: false}});
        expect(outcome.manifest.assets[1]).toMatchObject({src: "media/m002.jpg", source: {transcoded: true}});
        expect(await outcome.files[0]!.data.text()).toBe("bad.heic");
    });

    it("同一素材和参数的结果用缓存，不重复转码；片段变了才重新转码", async () => {
        const media = [photo("a.heic"), movie("clip.mov")];
        const first = request(media);
        await transcodeForSave(first);
        expect(first.workers.image).toHaveBeenCalledTimes(1);
        expect(first.workers.video).toHaveBeenCalledTimes(1);

        const again = request(media, {cache: first.cache});
        await transcodeForSave(again);
        expect(again.workers.image).not.toHaveBeenCalled();
        expect(again.workers.video).not.toHaveBeenCalled();

        const shorter = request([photo("a.heic"), {...movie("clip.mov"), blob: media[1]!.blob, duration: 9}], {cache: first.cache});
        await transcodeForSave(shorter);
        expect(shorter.workers.video).toHaveBeenCalledTimes(1);

        first.cache.clear();
        const cleared = request(media, {cache: first.cache});
        await transcodeForSave(cleared);
        expect(cleared.workers.image).toHaveBeenCalledTimes(1);
    });

    it("按素材个数报告进度，最后一次是 100%", async () => {
        const seen: TranscodeProgress[] = [];
        await transcodeForSave(request([photo("a.heic"), photo("b.heic")], {onProgress: (p) => seen.push(p)}));
        expect(seen[0]).toEqual({index: 1, total: 2, fraction: 0});
        expect(seen.some((p) => p.index === 2 && p.total === 2)).toBe(true);
        expect(seen.at(-1)?.fraction).toBe(1);
    });

    it("取消：已经取消就不开始，处理中取消就中止并抛出 AbortError，不写任何结果", async () => {
        const controller = new AbortController();
        const workers = makeWorkers({
            // eslint-disable-next-line @typescript-eslint/require-await
            image: vi.fn(async () => {
                controller.abort();
                throw abortError();
            }),
        });
        const req = request([photo("a.heic"), photo("b.heic")], {workers, signal: controller.signal});
        await expect(transcodeForSave(req)).rejects.toSatisfy(isAbortError);
        expect(workers.image).toHaveBeenCalledTimes(1);

        await expect(transcodeForSave(request([photo("a.heic")], {signal: controller.signal}))).rejects.toSatisfy(isAbortError);
    });

    it("没有需要转码的素材时原样返回", async () => {
        const req = request([photo("a.jpg", "image/jpeg")].map((m) => ({...m, source: {mimeType: "image/jpeg", transcoded: true}})));
        const outcome = await transcodeForSave(req);
        expect(outcome).toEqual({manifest: req.manifest, files: req.files, failed: []});
    });
});

import type {Asset, Manifest} from "@qyplayer/core";
import {describe, expect, it, vi} from "vitest";
import {pagesUsing, playbackMimeType, preflightAssets, type PreflightEnv} from "./preflight";

const asset = function asset(id: string, type: Asset["type"], mimeType: string): Asset {
    return {id, type, src: `media/${id}`, mimeType, source: {mimeType, transcoded: false}};
};

const manifestOf = function manifestOf(assets: Asset[], formatVersion = "0.2"): Manifest {
    return {formatVersion, assets, pages: []} as unknown as Manifest;
};

const stubEnv = function stubEnv(overrides: Partial<PreflightEnv> = {}): PreflightEnv {
    return {
        canPlayVideo: vi.fn(() => "probably"),
        canPlayAudio: vi.fn(() => "probably"),
        // eslint-disable-next-line @typescript-eslint/require-await
        decodeImage: vi.fn(async () => undefined),
        ...overrides,
    };
};

// eslint-disable-next-line @typescript-eslint/require-await
const read = async (): Promise<Blob> => new Blob(["x"]);

describe("preflightAssets", () => {
    it("0.1 的包不检查", async () => {
        const env = stubEnv({canPlayVideo: () => "", decodeImage: async () => Promise.reject(new Error("bad"))});
        const onChecking = vi.fn();
        const m = manifestOf([asset("a", "image", "image/heic"), asset("v", "video", "video/mp4")], "0.1");
        const {unsupported} = await preflightAssets(m, read, env, onChecking);
        expect(unsupported.size).toBe(0);
        expect(onChecking).not.toHaveBeenCalled();
    });

    it("jpeg/png/webp 视为支持，不读文件也不解码", async () => {
        const env = stubEnv();
        const readBlob = vi.fn(read);
        const onChecking = vi.fn();
        const m = manifestOf([asset("a", "image", "image/jpeg"), asset("b", "image", "image/png"), asset("c", "image", "image/webp")]);
        const {unsupported} = await preflightAssets(m, readBlob, env, onChecking);
        expect(unsupported.size).toBe(0);
        expect(readBlob).not.toHaveBeenCalled();
        expect(env.decodeImage).not.toHaveBeenCalled();
        expect(onChecking).not.toHaveBeenCalled();
    });

    it("其他图片试解码一次：成功算支持，失败算不支持，并先提示正在检查", async () => {
        const decodeImage = vi.fn(async (blob: Blob) => {
            if (await blob.text() === "bad") {
                throw new Error("cannot decode");
            }
        });
        // eslint-disable-next-line @typescript-eslint/require-await
        const readBlob = async (path: string): Promise<Blob> => new Blob([path.endsWith("bad") ? "bad" : "ok"]);
        const onChecking = vi.fn();
        const m = manifestOf([asset("good", "image", "image/heic"), asset("bad", "image", "image/avif")]);
        const {unsupported} = await preflightAssets(m, readBlob, stubEnv({decodeImage}), onChecking);
        expect([...unsupported]).toEqual(["bad"]);
        expect(decodeImage).toHaveBeenCalledTimes(2);
        expect(onChecking).toHaveBeenCalledTimes(1);
    });

    it("试解码最多 2 个并行", async () => {
        let running = 0;
        let peak = 0;
        const decodeImage = async (): Promise<void> => {
            running++;
            peak = Math.max(peak, running);
            await new Promise((resolve) => setTimeout(resolve, 5));
            running--;
        };
        const m = manifestOf(Array.from({length: 7}, (_, i) => asset(`h${i}`, "image", "image/heic")));
        await preflightAssets(m, read, stubEnv({decodeImage}));
        expect(peak).toBe(2);
    });

    it("读文件失败（包损坏）直接抛出，不当作不支持", async () => {
        const m = manifestOf([asset("h", "image", "image/heic")]);
        await expect(preflightAssets(m, async () => Promise.reject(new Error("damaged")), stubEnv())).rejects.toThrow("damaged");
    });

    it("视频用 canPlayType 询问；MOV 换成 video/mp4 并保留 codecs", async () => {
        const canPlayVideo = vi.fn((type: string) => type.includes("hvc1") ? "" : "maybe");
        const m = manifestOf([
            asset("hevc", "video", "video/quicktime; codecs=\"hvc1.1.6.L93.B0\""),
            asset("h264", "video", "video/mp4; codecs=\"avc1.640028\""),
            asset("plain", "video", "video/quicktime"),
        ]);
        const {unsupported} = await preflightAssets(m, read, stubEnv({canPlayVideo}));
        expect(canPlayVideo.mock.calls.map((c) => c[0])).toEqual(["video/mp4; codecs=\"hvc1.1.6.L93.B0\"", "video/mp4; codecs=\"avc1.640028\"", "video/mp4"]);
        expect([...unsupported]).toEqual(["hevc"]);
    });

    it("音频：wav 和 mpeg 视为支持，其他问 canPlayType", async () => {
        const canPlayAudio = vi.fn((type: string) => type.startsWith("audio/ogg") ? "" : "probably");
        const m = manifestOf([
            asset("wav", "audio", "audio/wav"),
            asset("mp3", "audio", "audio/mpeg"),
            asset("m4a", "audio", "audio/mp4; codecs=\"mp4a.40.2\""),
            asset("ogg", "audio", "audio/ogg"),
        ]);
        const {unsupported} = await preflightAssets(m, read, stubEnv({canPlayAudio}));
        expect(canPlayAudio.mock.calls.map((c) => c[0])).toEqual(["audio/mp4; codecs=\"mp4a.40.2\"", "audio/ogg"]);
        expect([...unsupported]).toEqual(["ogg"]);
    });
});

describe("playbackMimeType", () => {
    it("只替换 video/quicktime", () => {
        expect(playbackMimeType("video/quicktime")).toBe("video/mp4");
        expect(playbackMimeType("video/quicktime; codecs=\"avc1\"")).toBe("video/mp4; codecs=\"avc1\"");
        expect(playbackMimeType("video/mp4")).toBe("video/mp4");
        expect(playbackMimeType("video/webm")).toBe("video/webm");
    });
});

describe("pagesUsing", () => {
    it("页码从 1 开始、去重、升序", () => {
        const m = {
            pages: [
                {items: [{assetId: "a"}, {assetId: "b"}]},
                {items: [{assetId: "c"}]},
                {items: [{assetId: "b"}, {assetId: "b"}]},
            ],
        } as unknown as Manifest;
        expect(pagesUsing(m, new Set(["b"]))).toEqual([1, 3]);
        expect(pagesUsing(m, new Set(["x"]))).toEqual([]);
    });
});

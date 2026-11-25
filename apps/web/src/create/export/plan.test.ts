import type {Manifest} from "@qyplayer/core";
import {describe, expect, it, vi} from "vitest";
import example from "../../../../../spec/examples/example.manifest.json";
import {findUndecodable, type ExportCheckEnv} from "./plan";

const manifest = example as unknown as Manifest;
// eslint-disable-next-line @typescript-eslint/require-await
const read = async (): Promise<Blob> => new Blob(["x"]);

const env = function env(overrides: Partial<ExportCheckEnv> = {}): ExportCheckEnv {
    return {
        canPlayVideo: vi.fn(() => "probably"),
        canPlayAudio: vi.fn(() => "probably"),
        // eslint-disable-next-line @typescript-eslint/require-await
        decodeImage: vi.fn(async () => undefined),
        // eslint-disable-next-line @typescript-eslint/require-await
        canDecodeVideo: vi.fn(async () => true),
        ...overrides,
    };
};

describe("findUndecodable", () => {
    it("finds nothing when everything can be decoded", async () => {
        expect(await findUndecodable(manifest, read, env())).toEqual([]);
    });

    it("flags a video the decoder cannot handle even though the browser can play it", async () => {
        // eslint-disable-next-line @typescript-eslint/require-await
        expect(await findUndecodable(manifest, read, env({canDecodeVideo: async () => false}))).toEqual(["m004"]);
    });

    it("flags a video whose probing fails", async () => {
        const failing = env({canDecodeVideo: async () => Promise.reject(new Error("broken"))});
        expect(await findUndecodable(manifest, read, failing)).toEqual(["m004"]);
    });

    it("does not probe a video that already failed the playback check", async () => {
        const e = env({canPlayVideo: () => ""});
        expect(await findUndecodable(manifest, read, e)).toEqual(["m004"]);
        expect(e.canDecodeVideo).not.toHaveBeenCalled();
    });

    it("includes the background music and returns ids in manifest order", async () => {
        // eslint-disable-next-line @typescript-eslint/require-await
        const e = env({canPlayAudio: () => "", canDecodeVideo: async () => false});
        expect(await findUndecodable(manifest, read, e)).toEqual(["m004", "a001"]);
    });
});

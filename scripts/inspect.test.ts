import {existsSync} from "node:fs";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {inspectAudio, inspectVideo} from "@qyplayer/qyp/inspect";
import {DOWNLOADS_DIR} from "./fixtures/records";

// 真实素材由 pnpm fixtures:fetch 下载，不入库；没下载时跳过
describe.skipIf(!existsSync(resolve(DOWNLOADS_DIR, "artemis2-rollout.mp4")))("inspect real fixtures", () => {
    it("reads the H.264 + AAC sample video", async () => {
        const blob = new Blob([await readFile(resolve(DOWNLOADS_DIR, "artemis2-rollout.mp4"))]);
        const info = await inspectVideo(blob, "artemis2-rollout.mp4");
        expect(info).toMatchObject({width: 1080, height: 608, hasAudio: true});
        expect(info.duration).toBeCloseTo(12.23, 1);
    });

    it("reads the sample music", async () => {
        const blob = new Blob([await readFile(resolve(DOWNLOADS_DIR, "bgm-goldberg-var1.mp3"))]);
        expect((await inspectAudio(blob, "bgm-goldberg-var1.mp3")).duration).toBeCloseTo(115.5, 0);
    });
});

import {describe, expect, it} from "vitest";
import {inspectAudio, inspectVideo, MediaFormatError} from "./inspect";

/** 单声道 16 位 PCM 的 WAV：格式合法，但不是 MP3 或 AAC */
const wav = function wav(seconds: number): Blob {
    const rate = 8000;
    const bytes = new Uint8Array(44 + (rate * seconds * 2));
    const view = new DataView(bytes.buffer);
    const text = (offset: number, s: string): void => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    text(0, "RIFF");
    view.setUint32(4, bytes.length - 8, true);
    text(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, rate * seconds * 2, true);
    return new Blob([bytes]);
};

/** 恒定码率 MP3：MPEG-1 Layer 3，128 kbps，44.1 kHz，每帧 417 字节、约 26.1 毫秒，内容为静音 */
const mp3 = function mp3(frames: number): Blob {
    const frame = new Uint8Array(417);
    frame.set([0xff, 0xfb, 0x90, 0x00]);
    return new Blob(Array.from({length: frames}, () => frame));
};

describe("inspectAudio", () => {
    it("accepts an MP3 and reports its duration", async () => {
        const info = await inspectAudio(mp3(100), "tone.mp3");
        expect(info.duration).toBeGreaterThan(2.4);
        expect(info.duration).toBeLessThan(2.8);
    });

    it("rejects audio that is neither MP3 nor AAC, naming the file and the codec", async () => {
        const error = await inspectAudio(wav(1), "tone.wav").catch((e: unknown) => e);
        expect(error).toBeInstanceOf(MediaFormatError);
        expect((error as Error).message).toContain("tone.wav");
        expect((error as Error).message).toMatch(/PCM/i);
    });

    it("reports unreadable files as a MediaFormatError", async () => {
        const junk = new Blob([new Uint8Array(2048).fill(7)]);
        await expect(inspectAudio(junk, "junk.mp3")).rejects.toBeInstanceOf(MediaFormatError);
    });
});

describe("inspectVideo", () => {
    it("reports unreadable files as a MediaFormatError", async () => {
        const junk = new Blob([new Uint8Array(2048).fill(7)]);
        await expect(inspectVideo(junk, "junk.mp4")).rejects.toBeInstanceOf(MediaFormatError);
    });

    it("rejects a file that has no video track", async () => {
        const error = await inspectVideo(wav(1), "tone.wav").catch((e: unknown) => e);
        expect(error).toBeInstanceOf(MediaFormatError);
        expect((error as Error).message).toContain("tone.wav");
    });
});

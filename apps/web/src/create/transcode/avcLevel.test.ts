import {describe, expect, it} from "vitest";
import {codecMimeWithLevel, minimalAvcLevel, patchAvcLevel} from "./avcLevel";

describe("minimalAvcLevel", () => {
    const high = {fps: 30, bitrate: 8_000_000, refFrames: 1, profile: "high" as const};

    it("1080x608、30 帧、8 Mbps、1 个参考帧是 3.1", () => {
        expect(minimalAvcLevel({width: 1080, height: 608, ...high})).toBe(31);
    });

    it("1920x1080 是 4.0", () => {
        expect(minimalAvcLevel({width: 1920, height: 1080, ...high})).toBe(40);
    });

    it("码率放不进任何级别时返回 null", () => {
        expect(minimalAvcLevel({width: 320, height: 240, ...high, bitrate: 80_000_000})).toBeNull();
    });
});

describe("codecMimeWithLevel", () => {
    it("只换级别那两位", () => {
        expect(codecMimeWithLevel("video/mp4; codecs=\"avc1.640032, mp4a.40.2\"", 31)).toBe("video/mp4; codecs=\"avc1.64001f, mp4a.40.2\"");
    });

    it("没有 avc1 时原样返回", () => {
        expect(codecMimeWithLevel("video/mp4", 31)).toBe("video/mp4");
    });
});

/** 往比特流里写，用来造一个能解析的 SPS */
class Bits {
    private readonly bits: number[] = [];

    bit(value: number): void {
        this.bits.push(value);
    }

    u(count: number, value: number): void {
        for (let i = count - 1; i >= 0; i--) {
            this.bit(Math.floor(value / (2 ** i)) % 2);
        }
    }

    ue(value: number): void {
        const code = value + 1;
        const width = 32 - Math.clz32(code);
        for (let i = 0; i < width - 1; i++) {
            this.bit(0);
        }
        this.u(width, code);
    }

    bytes(): Uint8Array {
        const out = new Uint8Array(Math.ceil(this.bits.length / 8));
        this.bits.forEach((value, index) => {
            const shift = 7 - (index % 8);
            const at = Math.floor(index / 8);
            out[at] = (out[at] ?? 0) + (value * (2 ** shift));
        });
        return out;
    }
}

/** High profile 的 SPS：宽高按 16 对齐，1 个参考帧，级别写成 5.0 */
const sps = function sps(width: number, height: number): Uint8Array {
    const bits = new Bits();
    bits.u(8, 0x67);
    bits.u(8, 100);
    bits.u(8, 0);
    bits.u(8, 50);
    bits.ue(0);
    bits.ue(1);
    bits.ue(0);
    bits.ue(0);
    bits.bit(0);
    bits.bit(0);
    bits.ue(0);
    bits.ue(0);
    bits.ue(0);
    bits.ue(1);
    bits.bit(0);
    bits.ue(Math.ceil(width / 16) - 1);
    bits.ue(Math.ceil(height / 16) - 1);
    bits.bit(1);
    bits.bit(1);
    return bits.bytes();
};

const box = function box(type: string, payload: Uint8Array): Uint8Array {
    const out = new Uint8Array(8 + payload.length);
    new DataView(out.buffer).setUint32(0, out.length);
    out.set(type.split("").map((char) => char.charCodeAt(0)), 4);
    out.set(payload, 8);
    return out;
};

const concat = function concat(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
};

/** 拷成独立的 ArrayBuffer，Blob 的构造才接受 */
const copy = function copy(bytes: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
};

/** moov 里套一层真实的 trak/stsd/avc1，后面再跟一段不该被碰到的 mdat */
const fileWith = function fileWith(width: number, height: number, filler: Uint8Array): Blob {
    const nal = sps(width, height);
    const length = new Uint8Array(2);
    new DataView(length.buffer).setUint16(0, nal.length);
    const config = concat(Uint8Array.of(1, 100, 0, 50, 0xff, 0xe1), length, nal, Uint8Array.of(0));
    const avc1 = concat(new Uint8Array(78), box("avcC", config));
    const stsd = concat(new Uint8Array(8), box("avc1", avc1));
    const moov = box("moov", box("trak", box("mdia", box("minf", box("stbl", box("stsd", stsd))))));
    return new Blob([copy(box("ftyp", Uint8Array.of(1, 2, 3, 4))), copy(moov), copy(box("mdat", filler))], {type: "video/mp4"});
};

describe("patchAvcLevel", () => {
    it("只改 avcC 和 SPS 的级别字节，1080x608 写成 3.1", async () => {
        const filler = Uint8Array.of(9, 8, 7, 6, 5);
        const original = fileWith(1080, 608, filler);
        const before = new Uint8Array(await original.arrayBuffer());
        const patched = await patchAvcLevel(original, {fps: 30, bitrate: 8_000_000});
        expect(patched.changed).toBe(true);
        expect(patched.levelIdc).toBe(31);
        const after = new Uint8Array(await patched.blob.arrayBuffer());
        const changedAt = [...after].flatMap((byte, index) => byte === before[index] ? [] : [index]);
        expect(changedAt).toHaveLength(2);
        for (const index of changedAt) {
            expect(before[index]).toBe(50);
            expect(after[index]).toBe(31);
        }
        expect(after.subarray(after.length - filler.length)).toEqual(filler);
    });

    it("1920x1080 写成 4.0", async () => {
        const patched = await patchAvcLevel(fileWith(1920, 1080, Uint8Array.of(1)), {fps: 30, bitrate: 8_000_000});
        expect(patched.levelIdc).toBe(40);
    });

    it("解析不了时原样返回", async () => {
        const blob = new Blob([copy(Uint8Array.of(1, 2, 3, 4))]);
        const patched = await patchAvcLevel(blob, {fps: 30, bitrate: 8_000_000});
        expect(patched.changed).toBe(false);
        expect(patched.blob).toBe(blob);
    });
});

// 把本工具编码出的 H.264 级别改写成码流实际满足的最低级别（docs/dev-0.6.0.md 第 2 节）。
// Chrome 的硬件编码器会写成级别 5.0，旧手机的解码器看到就拒绝，哪怕画面只有 1080p。

/** H.264 表 A-1。MaxBR 的单位是 1000 bit/s（Baseline、Main）；High 再乘 1.25 */
const AVC_LEVELS: readonly {
    idc: number;
    maxMbps: number;
    maxFs: number;
    maxDpbMbs: number;
    maxBrKbps: number;
}[] = [
    {idc: 30, maxMbps: 40500, maxFs: 1620, maxDpbMbs: 8100, maxBrKbps: 10000},
    {idc: 31, maxMbps: 108000, maxFs: 3600, maxDpbMbs: 18000, maxBrKbps: 14000},
    {idc: 32, maxMbps: 216000, maxFs: 5120, maxDpbMbs: 20480, maxBrKbps: 20000},
    {idc: 40, maxMbps: 245760, maxFs: 8192, maxDpbMbs: 32768, maxBrKbps: 20000},
    {idc: 41, maxMbps: 245760, maxFs: 8192, maxDpbMbs: 32768, maxBrKbps: 50000},
    {idc: 42, maxMbps: 522240, maxFs: 8704, maxDpbMbs: 34816, maxBrKbps: 50000},
];

const BASELINE = 66;
const MAIN = 77;
const HIGH = 100;

export type AvcProfile = "baseline" | "main" | "high";

export interface AvcLevelInput {
    width: number;
    height: number;
    fps: number;
    /** 平均码率，bit/s */
    bitrate: number;
    refFrames: number;
    profile: AvcProfile;
}

/**
 * 同时满足宏块数、每秒宏块数、参考帧和码率（不超过该级别上限的一半，给峰值留余量）的最低级别。
 * 返回 level_idc（3.1 是 31）。没有级别能容下时返回 null。
 */
export const minimalAvcLevel = function minimalAvcLevel(input: AvcLevelInput): number | null {
    const mbs = Math.ceil(input.width / 16) * Math.ceil(input.height / 16);
    const perSecond = mbs * input.fps;
    const dpb = input.refFrames * mbs;
    const kbps = input.bitrate / 1000;
    const brFactor = input.profile === "high" ? 1.25 : 1;
    const level = AVC_LEVELS.find((item) =>
        mbs <= item.maxFs && perSecond <= item.maxMbps && dpb <= item.maxDpbMbs && kbps <= (item.maxBrKbps * brFactor) / 2);
    return level === undefined ? null : level.idc;
};

/** 把 mime 里 avc1 编码串的级别两位换成 levelIdc。没有 avc1 时原样返回 */
export const codecMimeWithLevel = function codecMimeWithLevel(mime: string, levelIdc: number): string {
    const hex = levelIdc.toString(16).padStart(2, "0");
    return mime.replace(/avc1\.([0-9a-fA-F]{4})[0-9a-fA-F]{2}/, `avc1.$1${hex}`);
};

export interface AvcPatchResult {
    blob: Blob;
    changed: boolean;
    /** 改写后的 level_idc；没改时缺省 */
    levelIdc?: number;
}

class BitReader {
    private pos = 0;

    constructor(private readonly data: Uint8Array) {}

    bit(): number {
        const byte = this.data[Math.floor(this.pos / 8)];
        if (byte === undefined) {
            throw new Error("eof");
        }
        const shift = 7 - (this.pos % 8);
        const value = Math.floor(byte / (2 ** shift)) % 2;
        this.pos += 1;
        return value;
    }

    bits(count: number): number {
        let value = 0;
        for (let i = 0; i < count; i++) {
            value = (value * 2) + this.bit();
        }
        return value;
    }

    ue(): number {
        let zeros = 0;
        while (this.bit() === 0) {
            zeros += 1;
            if (zeros > 16) {
                throw new Error("ue");
            }
        }
        return zeros === 0 ? 0 : ((2 ** zeros) + this.bits(zeros)) - 1;
    }

    se(): number {
        const value = this.ue();
        return value % 2 === 0 ? -Math.floor(value / 2) : Math.floor((value + 1) / 2);
    }
}

/** 去掉防竞争字节（00 00 03） */
const stripEmulation = function stripEmulation(nal: Uint8Array): Uint8Array {
    const out: number[] = [];
    let zeros = 0;
    for (const byte of nal) {
        if (zeros === 2 && byte === 3) {
            zeros = 0;
            continue;
        }
        out.push(byte);
        zeros = byte === 0 ? zeros + 1 : 0;
    }
    return Uint8Array.from(out);
};

const skipScalingList = function skipScalingList(bits: BitReader, size: number): void {
    let last = 8;
    let next = 8;
    for (let i = 0; i < size; i++) {
        if (next !== 0) {
            next = (last + bits.se() + 256) % 256;
        }
        last = next === 0 ? last : next;
    }
};

interface SpsInfo {
    profile: AvcProfile;
    levelIdc: number;
    refFrames: number;
    width: number;
    height: number;
}

/** 解析一个 SPS NAL（含 1 字节头）。解析不了返回 null */
const parseSps = function parseSps(nal: Uint8Array): SpsInfo | null {
    try {
        const raw = stripEmulation(nal);
        if ((raw[0] ?? 0) % 32 !== 7 || raw[3] === undefined) {
            return null;
        }
        const profileIdc = raw[1]!;
        const profile: AvcProfile | null = profileIdc === BASELINE ? "baseline" : profileIdc === MAIN ? "main" : profileIdc === HIGH ? "high" : null;
        if (!profile) {
            return null;
        }
        const bits = new BitReader(raw);
        bits.bits(8 + 24);
        bits.ue();
        if (profile === "high") {
            const chroma = bits.ue();
            if (chroma === 3) {
                bits.bit();
            }
            bits.ue();
            bits.ue();
            bits.bit();
            if (bits.bit() === 1) {
                const count = chroma === 3 ? 12 : 8;
                for (let i = 0; i < count; i++) {
                    if (bits.bit() === 1) {
                        skipScalingList(bits, i < 6 ? 16 : 64);
                    }
                }
            }
        }
        bits.ue();
        const order = bits.ue();
        if (order === 0) {
            bits.ue();
        } else if (order === 1) {
            bits.bit();
            bits.se();
            bits.se();
            const cycle = bits.ue();
            for (let i = 0; i < cycle && i < 256; i++) {
                bits.se();
            }
        } else {
            return null;
        }
        const refFrames = bits.ue();
        bits.bit();
        const width = (bits.ue() + 1) * 16;
        const mapUnits = bits.ue() + 1;
        const frameOnly = bits.bit() === 1;
        if (!frameOnly) {
            bits.bit();
        }
        const levelIdc = raw[3];
        return {profile, levelIdc, refFrames, width, height: (frameOnly ? mapUnits : mapUnits * 2) * 16};
    } catch {
        return null;
    }
};

interface Sequence {
    /** 这个 SPS 在 avcC 负载里的 level_idc 下标 */
    levelIndex: number;
    info: SpsInfo;
}

/** 读出 avcC 里的 SPS。结构不对返回 null */
const sequencesOf = function sequencesOf(payload: Uint8Array): Sequence[] | null {
    if (payload.length < 7 || payload[0] !== 1) {
        return null;
    }
    let offset = 5;
    const count = (payload[offset] ?? 0) % 32;
    offset += 1;
    const sequences: Sequence[] = [];
    for (let i = 0; i < count; i++) {
        const length = ((payload[offset] ?? 0) * 256) + (payload[offset + 1] ?? 0);
        offset += 2;
        const nal = payload.subarray(offset, offset + length);
        if (nal.length !== length) {
            return null;
        }
        const info = parseSps(nal);
        // 前 4 个字节里夹了防竞争字节时，第 4 个字节不是级别，不改
        if (!info || nal[3] !== info.levelIdc) {
            return null;
        }
        sequences.push({levelIndex: offset + 3, info});
        offset += length;
    }
    return sequences;
};

const typeAt = function typeAt(bytes: Uint8Array, offset: number): string {
    return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
};

/** 改 avcC 负载。返回写入的 level_idc；不该改或解析不了返回 null，负载保持原样 */
const patchConfig = function patchConfig(payload: Uint8Array, fps: number, bitrate: number): number | null {
    const sequences = sequencesOf(payload);
    const first = sequences?.[0];
    if (!sequences || !first) {
        return null;
    }
    let needed = 0;
    for (const sequence of sequences) {
        const {info} = sequence;
        const level = minimalAvcLevel({
            width: info.width,
            height: info.height,
            fps,
            bitrate,
            refFrames: Math.max(1, info.refFrames),
            profile: info.profile,
        });
        if (level === null) {
            return null;
        }
        needed = Math.max(needed, level);
    }
    if (needed >= payload[3]!) {
        return null;
    }
    payload[3] = needed;
    for (const sequence of sequences) {
        payload[sequence.levelIndex] = needed;
    }
    return needed;
};

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts"]);

/** 在 [start, end) 里找 avcC 并改写。stsd 和 avc1 的头部不是盒子，单独跳过 */
const patchBoxes = function patchBoxes(
    bytes: Uint8Array,
    start: number,
    end: number,
    fps: number,
    bitrate: number,
    skip: number,
): number | null {
    let level: number | null = null;
    let offset = start + skip;
    while (offset + 8 <= end) {
        const size = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
        const type = typeAt(bytes, offset + 4);
        if (size < 8 || offset + size > end) {
            return level;
        }
        const payload = offset + 8;
        if (type === "avcC") {
            const next = patchConfig(bytes.subarray(payload, offset + size), fps, bitrate);
            level = next ?? level;
        } else if (CONTAINERS.has(type)) {
            const next = patchBoxes(bytes, payload, offset + size, fps, bitrate, 0);
            level = next ?? level;
        } else if (type === "stsd") {
            const next = patchBoxes(bytes, payload, offset + size, fps, bitrate, 8);
            level = next ?? level;
        } else if (type === "avc1" || type === "avc3") {
            const next = patchBoxes(bytes, payload, offset + size, fps, bitrate, 78);
            level = next ?? level;
        }
        offset += size;
    }
    return level;
};

const headerOf = async function headerOf(blob: Blob, offset: number): Promise<{
    size: number;
    type: string;
    header: number;
} | null> {
    if (offset + 8 > blob.size) {
        return null;
    }
    const bytes = new Uint8Array(await blob.slice(offset, offset + 16).arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let size = view.getUint32(0);
    const type = typeAt(bytes, 4);
    let header = 8;
    if (size === 1) {
        if (bytes.length < 16) {
            return null;
        }
        size = Number(view.getBigUint64(8));
        header = 16;
    } else if (size === 0) {
        size = blob.size - offset;
    }
    return size >= header ? {size, type, header} : null;
};

/**
 * 找到 moov 里的 avcC，在级别高于码流所需时改写 avcC 和每个 SPS 的级别字节，其余字节不动。
 * 只把 moov 读进内存。解析不了、profile 不是 Baseline/Main/High、或级别已经不高于所需时，返回原来的 blob。
 */
export const patchAvcLevel = async function patchAvcLevel(blob: Blob, info: {
    fps: number;
    bitrate: number;
}): Promise<AvcPatchResult> {
    let offset = 0;
    while (offset + 8 <= blob.size) {
        const box = await headerOf(blob, offset);
        if (!box) {
            return {blob, changed: false};
        }
        if (box.type === "moov") {
            const moov = new Uint8Array(await blob.slice(offset, offset + box.size).arrayBuffer());
            const levelIdc = patchBoxes(moov, box.header, moov.length, info.fps, info.bitrate, 0);
            if (levelIdc === null) {
                return {blob, changed: false};
            }
            const patched = new Blob([blob.slice(0, offset), moov, blob.slice(offset + box.size)], {type: blob.type});
            return {blob: patched, changed: true, levelIdc};
        }
        offset += box.size;
    }
    return {blob, changed: false};
};

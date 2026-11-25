// 导出的音频混合（docs/dev-0.6.0.md 1.4）：用 OfflineAudioContext 混成 48 kHz 立体声。
// 有背景音乐就混背景音乐；整片原声音量大于 0 就混视频原声，两路可以同时存在（与播放一致）。
// 整部影片按 10 秒一段分别渲染，每段渲染完交给编码器就释放，内存不随影片变长。
import {videoVolumeOf, type Asset, type Manifest} from "@qyplayer/core";
import {ALL_FORMATS, AudioBufferSink, BlobSource, Input} from "mediabunny";
import {AUDIO_WINDOW_SECONDS, EXPORT_SAMPLE_RATE, bgmDuckCurve, bgmGainCurve, pageGainCurve, type GainPoint} from "./spec";

const WINDOW_SAMPLES = EXPORT_SAMPLE_RATE * AUDIO_WINDOW_SECONDS;

export interface AudioMixer {
    /** 总段数 */
    readonly windowCount: number;
    /** 渲染第 index 段（从 0 开始）；返回 48 kHz 立体声 */
    render: (index: number) => Promise<AudioBuffer>;
    dispose: () => void;
}

/** 把折线增益交给 AudioParam；折线时间减去 offset 才是上下文里的时间 */
const scheduleGain = function scheduleGain(param: AudioParam, curve: readonly GainPoint[], offset: number): void {
    curve.forEach((point, i) => {
        const time = Math.max(0, point.time - offset);
        if (i === 0) {
            param.setValueAtTime(point.gain, time);
        } else {
            param.linearRampToValueAtTime(point.gain, time);
        }
    });
};

/** 把一路解码出的片段拼成一个 AudioBuffer，范围是素材内 [from, to) 秒；缺的地方是静音 */
const readClip = async function readClip(sink: AudioBufferSink, from: number, to: number): Promise<AudioBuffer | null> {
    let clip: AudioBuffer | undefined;
    for await (const {buffer, timestamp} of sink.buffers(from, to)) {
        // eslint-disable-next-line @stylistic/max-len
        clip ??= new AudioBuffer({length: Math.max(1, Math.ceil((to - from) * buffer.sampleRate)), numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate});
        const start = Math.round((timestamp - from) * buffer.sampleRate);
        const skip = Math.max(0, -start);
        const count = Math.min(buffer.length - skip, clip.length - Math.max(0, start));
        if (count <= 0) {
            continue;
        }
        for (let channel = 0; channel < Math.min(clip.numberOfChannels, buffer.numberOfChannels); channel++) {
            clip.getChannelData(channel).set(buffer.getChannelData(channel).subarray(skip, skip + count), Math.max(0, start));
        }
    }
    return clip ?? null;
};

interface ClipSource {
    input: Input;
    sink: AudioBufferSink;
}

export const createAudioMixer = function createAudioMixer(manifest: Manifest, readBlob: (path: string) => Promise<Blob>): AudioMixer {
    const totalSamples = Math.max(1, Math.ceil((manifest.duration * EXPORT_SAMPLE_RATE) - 1e-6));
    const assets = new Map<string, Asset>(manifest.assets.map((a) => [a.id, a]));
    let music: AudioBuffer | undefined;
    /** 视频素材的音频读取器；null 表示这个视频没有能解码的音轨 */
    const clips = new Map<string, ClipSource | null>();

    const loadMusic = async (): Promise<AudioBuffer> => {
        if (music) {
            return music;
        }
        const asset = manifest.bgm && assets.get(manifest.bgm.assetId);
        if (!asset) {
            throw new Error("export: the background music is missing");
        }
        const bytes = await (await readBlob(asset.src)).arrayBuffer();
        music = await new OfflineAudioContext(2, 1, EXPORT_SAMPLE_RATE).decodeAudioData(bytes);
        return music;
    };

    const clipSource = async (asset: Asset): Promise<ClipSource | null> => {
        if (clips.has(asset.id)) {
            return clips.get(asset.id) ?? null;
        }
        const input = new Input({source: new BlobSource(await readBlob(asset.src)), formats: ALL_FORMATS});
        const track = await input.getPrimaryAudioTrack();
        // 声音解不了就静音：预览里这样的视频也是没有声音的
        const entry = track && await track.canDecode() ? {input, sink: new AudioBufferSink(track)} : null;
        if (!entry) {
            input.dispose();
        }
        clips.set(asset.id, entry);
        return entry;
    };

    const mixMusic = async (ctx: OfflineAudioContext, from: number, to: number): Promise<void> => {
        const bgm = manifest.bgm;
        if (!bgm) {
            return;
        }
        const buffer = await loadMusic();
        const loop = bgm.loop === true;
        if (!loop && from >= buffer.duration) {
            return;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;
        // 淡入淡出和压低各走一个增益：两条都是分段线性，相乘与播放器的 bgmGainAt 一致
        const fade = ctx.createGain();
        const duck = ctx.createGain();
        scheduleGain(fade.gain, bgmGainCurve(manifest, from, to), from);
        scheduleGain(duck.gain, bgmDuckCurve(manifest, from, to), from);
        source.connect(fade).connect(duck).connect(ctx.destination);
        source.start(0, loop ? from % buffer.duration : from);
    };

    const mixVideoSound = async (ctx: OfflineAudioContext, from: number, to: number): Promise<void> => {
        for (const page of manifest.pages) {
            const pageEnd = page.start + page.duration;
            const a0 = Math.max(from, page.start);
            const a1 = Math.min(to, pageEnd);
            if (a1 <= a0) {
                continue;
            }
            for (const item of page.items) {
                const asset = assets.get(item.assetId);
                if (!asset || asset.type !== "video" || asset.hasAudio === false || item.muted === true) {
                    continue;
                }
                const source = await clipSource(asset);
                if (!source) {
                    continue;
                }
                const clipFrom = (item.clipStart ?? 0) + (a0 - page.start);
                const clipTo = Math.min(clipFrom + (a1 - a0), asset.duration ?? Infinity);
                if (clipTo <= clipFrom) {
                    continue;
                }
                const buffer = await readClip(source.sink, clipFrom, clipTo);
                if (!buffer) {
                    continue;
                }
                const node = ctx.createBufferSource();
                node.buffer = buffer;
                const fade = ctx.createGain();
                const level = ctx.createGain();
                level.gain.value = videoVolumeOf(manifest);
                scheduleGain(fade.gain, pageGainCurve(page.duration, a0 - page.start, a1 - page.start), from - page.start);
                node.connect(fade).connect(level).connect(ctx.destination);
                node.start(a0 - from);
            }
        }
        // 已经播完的页释放解码器
        for (const page of manifest.pages) {
            if (page.start + page.duration > to) {
                continue;
            }
            for (const item of page.items) {
                const entry = clips.get(item.assetId);
                if (entry) {
                    entry.input.dispose();
                }
                clips.delete(item.assetId);
            }
        }
    };

    return {
        windowCount: Math.ceil(totalSamples / WINDOW_SAMPLES),
        async render(index) {
            const start = index * WINDOW_SAMPLES;
            const length = Math.min(WINDOW_SAMPLES, totalSamples - start);
            const from = start / EXPORT_SAMPLE_RATE;
            const to = (start + length) / EXPORT_SAMPLE_RATE;
            const ctx = new OfflineAudioContext(2, length, EXPORT_SAMPLE_RATE);
            if (manifest.bgm) {
                await mixMusic(ctx, from, to);
            }
            if (videoVolumeOf(manifest) > 0) {
                await mixVideoSound(ctx, from, to);
            }
            return ctx.startRendering();
        },
        dispose() {
            for (const entry of clips.values()) {
                entry?.input.dispose();
            }
            clips.clear();
        },
    };
};

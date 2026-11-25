// 仅开发使用：在浏览器里用程序生成素材，经规则式生成器打成 .qyp 包，用于验证播放器。
// 真实素材的示例包由 fixtures 步骤提供。
import {generateManifest, type MediaInput} from "@qyplayer/core";
import {writePackage, type PackageFile} from "@qyplayer/qyp";

const MUSIC_SECONDS = 30;

const makeJpeg = async function makeJpeg(index: number, width: number, height: number): Promise<Blob> {
    const canvas = new OffscreenCanvas(width, height);
    const g = canvas.getContext("2d")!;
    const hue = (index * 47) % 360;
    const gradient = g.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `hsl(${hue} 70% 50%)`);
    gradient.addColorStop(1, `hsl(${(hue + 70) % 360} 70% 25%)`);
    g.fillStyle = gradient;
    g.fillRect(0, 0, width, height);
    g.strokeStyle = "#fff";
    g.lineWidth = Math.max(width, height) / 100;
    g.strokeRect(g.lineWidth, g.lineWidth, width - (2 * g.lineWidth), height - (2 * g.lineWidth));
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.font = `bold ${Math.min(width, height) / 3}px sans-serif`;
    g.fillText(String(index + 1), width / 2, (height / 2) + (Math.min(width, height) / 9));
    return canvas.convertToBlob({type: "image/jpeg", quality: 0.85});
};

/** 16 位单声道 WAV：一段缓慢起伏的和弦，足够听出声音是否同步 */
const makeTone = function makeTone(seconds: number): Uint8Array {
    const rate = 16000;
    const samples = rate * seconds;
    const bytes = new Uint8Array(44 + (samples * 2));
    const view = new DataView(bytes.buffer);
    const text = (offset: number, s: string): void => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    text(0, "RIFF");
    view.setUint32(4, 36 + (samples * 2), true);
    text(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, samples * 2, true);
    for (let i = 0; i < samples; i++) {
        const t = i / rate;
        const beat = 0.5 + (0.5 * Math.sin(2 * Math.PI * 0.5 * t));
        // eslint-disable-next-line @stylistic/max-len
        const value = 0.25 * beat * (Math.sin(2 * Math.PI * 261.6 * t) + Math.sin(2 * Math.PI * 329.6 * t) + Math.sin(2 * Math.PI * 392 * t)) / 3;
        view.setInt16(44 + (i * 2), Math.round(value * 32767), true);
    }
    return bytes;
};

export const buildDemoPackage = async function buildDemoPackage(): Promise<Blob> {
    // eslint-disable-next-line @stylistic/max-len
    const shapes: [number, number][] = [[1600, 1067], [1600, 1067], [1067, 1600], [1600, 1067], [1600, 1067], [1067, 1600], [1600, 1067], [1600, 1067]];
    const media: MediaInput[] = shapes.map(([width, height], i) => ({
        id: `m${String(i + 1).padStart(3, "0")}`,
        type: "image",
        src: `media/m${String(i + 1).padStart(3, "0")}.jpg`,
        mimeType: "image/jpeg",
        source: {mimeType: "image/jpeg", transcoded: false},
        fileName: `IMG_${String(i + 1).padStart(4, "0")}.jpg`,
        width,
        height,
    }));
    const files: PackageFile[] = [];
    for (const [i, m] of media.entries()) {
        files.push({path: m.src, data: await makeJpeg(i, m.width, m.height)});
    }

    // 演示用的 WAV 内容放在 .m4a 路径下（浏览器按内容识别）。仅限开发验证，正式包必须是 AAC 或 MP3。
    files.push({path: "audio/bgm.m4a", data: makeTone(MUSIC_SECONDS)});
    const manifest = generateManifest({
        media,
        aspectRatio: "16:9",
        templateId: "lively",
        seed: 7,
        title: "演示影片（程序生成）",
        music: {id: "bgm", src: "audio/bgm.m4a", mimeType: "audio/mp4; codecs=\"mp4a.40.2\"", source: {mimeType: "audio/mp4; codecs=\"mp4a.40.2\"", transcoded: false}, duration: MUSIC_SECONDS},
    });
    return writePackage(manifest, files);
};

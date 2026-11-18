// 读取 WAV 配乐的时长（docs/dev-0.3.0.md 5.6）。MP3 和 M4A 仍用 qyp 的 inspectAudio；WAV 它不认，这里用 mediabunny。
import { MediaFormatError } from "@qyplayer/qyp/inspect";
import { BlobSource, Input, WAVE } from "mediabunny";

/** 读 WAV 文件的时长（秒）。读不了或时长读不到时抛出 MediaFormatError */
export async function probeWavDuration(file: Blob, name: string): Promise<number> {
  const input = new Input({ source: new BlobSource(file), formats: [WAVE] });
  try {
    const duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0) throw new MediaFormatError("no-duration", `${name}: duration cannot be determined`, { name });
    return duration;
  } catch (error) {
    if (error instanceof MediaFormatError) throw error;
    throw new MediaFormatError("unreadable", `${name}: cannot be read; the file may be damaged or in an unsupported format`, { name }, { cause: error });
  } finally {
    input.dispose();
  }
}

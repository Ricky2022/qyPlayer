import { inspectAudio } from "@qyplayer/qyp/inspect";
import type { MusicEntry } from "./buildPackage";

/** 内置配乐：Kimiko Ishizaka 演奏的哥德堡变奏曲第 1 变奏，CC0（来源见 fixtures/SOURCES.md）。文件随站点发布在 samples/ 下。 */
const BUILTIN_MUSIC_PATH = "samples/bgm-goldberg-var1.mp3";
export const BUILTIN_MUSIC_TITLE = "巴赫：哥德堡变奏曲 第 1 变奏（Kimiko Ishizaka 演奏）";
const BUILTIN_MUSIC_LICENSE = "CC0 1.0";

export async function loadBuiltinMusic(): Promise<MusicEntry> {
  let response: Response;
  try {
    response = await fetch(new URL(BUILTIN_MUSIC_PATH, document.baseURI));
  } catch (error) {
    throw new Error("内置配乐下载失败，请检查网络，或改选“导入音乐”", { cause: error });
  }
  if (!response.ok) throw new Error(`内置配乐不可用（HTTP ${response.status}），请改选“不用配乐”或“导入音乐”`);
  const blob = await response.blob();
  const { duration } = await inspectAudio(blob, "内置配乐");
  return { blob, extension: ".mp3", duration, title: BUILTIN_MUSIC_TITLE, license: BUILTIN_MUSIC_LICENSE };
}

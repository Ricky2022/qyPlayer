import { inspectAudio } from "@qyplayer/qyp/inspect";
import type { MusicEntry } from "./buildPackage";
import { BUILTIN_MUSIC_LICENSE, BUILTIN_MUSIC_PATH, BUILTIN_MUSIC_TITLE_EN } from "./builtinMusicInfo";
import { ImportError } from "./importers";

export async function loadBuiltinMusic(): Promise<MusicEntry> {
  let response: Response;
  try {
    response = await fetch(new URL(BUILTIN_MUSIC_PATH, document.baseURI));
  } catch (error) {
    throw new ImportError("builtin-network", {}, { cause: error });
  }
  if (!response.ok) throw new ImportError("builtin-http", { status: response.status });
  const blob = await response.blob();
  const { duration } = await inspectAudio(blob, "builtin-music");
  // 写进包里的标题用英文，不依赖界面语言
  return { blob, extension: ".mp3", duration, title: BUILTIN_MUSIC_TITLE_EN, license: BUILTIN_MUSIC_LICENSE };
}

import { inspectAudio } from "@qyplayer/qyp/inspect";
import type { MusicEntry } from "./buildPackage";
import { BUILTIN_MUSIC_LICENSE, type BuiltinTrack } from "./builtinMusicInfo";
import { ImportError } from "./importers";

export async function loadBuiltinMusic(track: BuiltinTrack): Promise<MusicEntry> {
  let response: Response;
  try {
    response = await fetch(new URL(track.path, document.baseURI));
  } catch (error) {
    throw new ImportError("builtin-network", {}, { cause: error });
  }
  if (!response.ok) throw new ImportError("builtin-http", { status: response.status });
  const blob = await response.blob();
  const { duration } = await inspectAudio(blob, "builtin-music");
  // 写进包里的标题用英文，不依赖界面语言
  return { blob, mimeType: "audio/mpeg", duration, title: track.titleEn, license: BUILTIN_MUSIC_LICENSE };
}

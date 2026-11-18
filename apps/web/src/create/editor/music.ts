import type { MusicEntry } from "../buildPackage";
import { loadBuiltinMusic } from "../builtinMusic";
import { findBuiltinTrack } from "../builtinMusicInfo";
import type { MusicChoice } from "./state";

const builtinCache = new Map<string, Promise<MusicEntry>>();

/** 把配乐选择换成可以放进包的音频文件；内置曲目下载一次后缓存，失败不缓存 */
export async function resolveMusic(choice: MusicChoice): Promise<MusicEntry | undefined> {
  switch (choice.kind) {
    case "none":
      return undefined;
    case "custom":
      return choice.entry;
    case "builtin": {
      const track = findBuiltinTrack(choice.trackId);
      if (!track) return undefined;
      let loading = builtinCache.get(choice.trackId);
      if (!loading) {
        loading = loadBuiltinMusic(track);
        builtinCache.set(choice.trackId, loading);
        loading.catch(() => builtinCache.delete(choice.trackId));
      }
      return loading;
    }
  }
}

/** 保存和导出前要不要提示用户确认音乐的使用权（5.6）：只有导入的音频需要，内置曲目不需要 */
export const needsMusicRightsConfirm = (choice: MusicChoice): boolean => choice.kind === "custom";

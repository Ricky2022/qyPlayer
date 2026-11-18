import type { MusicEntry } from "../buildPackage";
import { loadBuiltinMusic } from "../builtinMusic";
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
      let loading = builtinCache.get(choice.trackId);
      if (!loading) {
        loading = loadBuiltinMusic();
        builtinCache.set(choice.trackId, loading);
        loading.catch(() => builtinCache.delete(choice.trackId));
      }
      return loading;
    }
  }
}

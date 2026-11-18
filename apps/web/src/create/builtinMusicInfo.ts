// 内置配乐的信息。单独放一个文件，关于页只引用这里，不会把解析音频的库带进播放器。

/** Kimiko Ishizaka 演奏的哥德堡变奏曲第 1 变奏，CC0（来源见 fixtures/SOURCES.md）。文件随制作页一起发布在 samples/ 下。 */
export const BUILTIN_MUSIC_PATH = "samples/bgm-goldberg-var1.mp3";
export const BUILTIN_MUSIC_TITLE = "巴赫：哥德堡变奏曲 第 1 变奏（Kimiko Ishizaka 演奏）";
export const BUILTIN_MUSIC_TITLE_EN = "Bach: Goldberg Variations, Variation 1 (performed by Kimiko Ishizaka)";
export const BUILTIN_MUSIC_LICENSE = "CC0 1.0";

export interface BuiltinTrack {
  id: string;
  /** 界面显示用的曲名（中文、英文） */
  title: string;
  titleEn: string;
  path: string;
}

/** 全部内置曲目。从包还原配乐时，按写入包里的英文曲名认出它们。 */
export const BUILTIN_TRACKS: readonly BuiltinTrack[] = [
  { id: "goldberg-var1", title: BUILTIN_MUSIC_TITLE, titleEn: BUILTIN_MUSIC_TITLE_EN, path: BUILTIN_MUSIC_PATH },
];

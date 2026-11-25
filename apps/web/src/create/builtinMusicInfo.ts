// 内置配乐的信息。单独放一个文件，关于页只引用这里，不会把解析音频的库带进播放器。
// 来源：The Open Goldberg Variations（Internet Archive），作曲 J.S. Bach（公有领域），录音 Kimiko Ishizaka，CC0 1.0。
// 每首的来源链接和许可记录在 fixtures/sources.json（见 docs/dev-0.3.0.md 第 8 节）；文件随制作页一起发布在 samples/ 下。

export const BUILTIN_MUSIC_LICENSE = "CC0 1.0";

export interface BuiltinTrack {
    /** 稳定的编号。从包还原配乐时靠曲名认出内置曲目，编号只在制作器内部使用 */
    id: string;
    /** 相对制作页的文件路径 */
    path: string;
    /** 界面显示用的曲名（中文、英文），英文曲名同时写进包里的 title */
    title: string;
    titleEn: string;
    /** 风格标签 */
    mood: string;
    moodEn: string;
    /** 时长（秒，取整），用于列表显示 */
    duration: number;
}

const PERFORMER = "Kimiko Ishizaka 演奏";
const PERFORMER_EN = "performed by Kimiko Ishizaka";

/** 全部内置曲目，列表里按这个顺序显示 */
export const BUILTIN_TRACKS: readonly BuiltinTrack[] = [
    {
        id: "goldberg-var1",
        path: "samples/bgm-goldberg-var1.mp3",
        title: `巴赫：哥德堡变奏曲 第 1 变奏（${PERFORMER}）`,
        titleEn: `Bach: Goldberg Variations, Variation 1 (${PERFORMER_EN})`,
        mood: "轻快",
        moodEn: "Lively",
        duration: 115,
    },
    {
        id: "goldberg-aria",
        path: "samples/bgm-goldberg-aria.mp3",
        title: `巴赫：哥德堡变奏曲 咏叹调（${PERFORMER}）`,
        titleEn: `Bach: Goldberg Variations, Aria (${PERFORMER_EN})`,
        mood: "宁静",
        moodEn: "Serene",
        duration: 300,
    },
    {
        id: "goldberg-var3",
        path: "samples/bgm-goldberg-var3.mp3",
        title: `巴赫：哥德堡变奏曲 第 3 变奏 卡农（${PERFORMER}）`,
        titleEn: `Bach: Goldberg Variations, Variation 3, Canone all'Unisono (${PERFORMER_EN})`,
        mood: "明亮",
        moodEn: "Bright",
        duration: 117,
    },
    {
        id: "goldberg-var7",
        path: "samples/bgm-goldberg-var7.mp3",
        title: `巴赫：哥德堡变奏曲 第 7 变奏 吉格舞曲速度（${PERFORMER}）`,
        titleEn: `Bach: Goldberg Variations, Variation 7, al tempo di Giga (${PERFORMER_EN})`,
        mood: "欢快",
        moodEn: "Joyful",
        duration: 132,
    },
    {
        id: "goldberg-var13",
        path: "samples/bgm-goldberg-var13.mp3",
        title: `巴赫：哥德堡变奏曲 第 13 变奏（${PERFORMER}）`,
        titleEn: `Bach: Goldberg Variations, Variation 13 (${PERFORMER_EN})`,
        mood: "抒情",
        moodEn: "Lyrical",
        duration: 254,
    },
];

/** 新建影片时默认选中的内置曲目：列表里的第一首。预览和保存都会把它写进包并播放。 */
export const DEFAULT_BUILTIN_TRACK_ID = BUILTIN_TRACKS[0]!.id;

export const findBuiltinTrack = function findBuiltinTrack(id: string): BuiltinTrack | undefined {
    return BUILTIN_TRACKS.find((track) => track.id === id);
};

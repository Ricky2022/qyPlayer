// 单页编辑测试共用的素材和影片（只给测试用，不进应用）
import {addMedia, createEditor, setTemplate, type EditorMediaInput, type EditorState} from "./state";

export const photo = (name: string, width = 1600, height = 1067, capturedAt?: string): EditorMediaInput => ({
    fileName: name,
    type: "image",
    blob: new Blob([name]),
    width,
    height,
    mimeType: "image/jpeg",
    source: {mimeType: "image/jpeg", transcoded: false},
    final: false,
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    ...capturedAt && {capturedAt},
});
export const clip = (name: string): EditorMediaInput => ({
    fileName: name,
    type: "video",
    blob: new Blob([name]),
    width: 1920,
    height: 1080,
    duration: 20,
    hasAudio: true,
    mimeType: "video/mp4",
    source: {mimeType: "video/mp4", transcoded: false},
    final: false,
});

/** 8 张照片（含竖图）加一段视频，“活泼”模板会出现多图页 */
export const filmState = function filmState(): EditorState {
    const inputs = [
        ...Array.from({length: 6}, (_, i) => photo(`p${i}.jpg`, 1600, 1067, `2026-03-0${i + 1}T00:00:00Z`)),
        clip("v.mp4"),
        photo("t1.jpg", 1067, 1600),
        photo("t2.jpg", 1067, 1600),
    ];
    const state = setTemplate(addMedia(createEditor(5, "clean"), inputs).state, "lively");
    return state;
};


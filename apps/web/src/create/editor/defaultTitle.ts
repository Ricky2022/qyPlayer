import {defaultFilmTitle} from "@qyplayer/core";
import {currentDoc, selectedMedia, type EditorState} from "./state";

/**
 * 素材变化后的标题。
 * 从没有素材变成有素材、且标题仍为空时，写入「最早拍摄日期 + 词」。
 * 标题还等于按上一批素材算出的那句，并且最早日期变了，才换成新的一句。
 * 用户改过或删空之后不再填回。
 */
export const syncDefaultTitle = function syncDefaultTitle(before: EditorState, after: EditorState, word: string): EditorState {
    const previous = currentDoc(before);
    const next = currentDoc(after);
    const previousDefault = defaultFilmTitle(selectedMedia(previous).map((item) => item.capturedAt), word);
    const nextDefault = defaultFilmTitle(selectedMedia(next).map((item) => item.capturedAt), word);
    let title = next.title;
    if (previous.media.length === 0 && next.media.length > 0 && next.title.trim() === "") {
        title = nextDefault;
    } else if (previous.title === previousDefault && next.title === previous.title && previousDefault !== nextDefault) {
        title = nextDefault;
    }
    if (title === next.title) {
        return after;
    }
    return {...after, present: {...after.present, doc: {...next, title}}};
};

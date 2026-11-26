import {describe, expect, it} from "vitest";
import {addMedia, createEditor, currentDoc, removeMedia, setTitle, type EditorMediaInput, type EditorState} from "./state";
import {syncDefaultTitle} from "./defaultTitle";

const photo = (name: string, capturedAt?: string): EditorMediaInput => ({
    fileName: name,
    type: "image",
    blob: new Blob([name]),
    width: 1600,
    height: 1067,
    mimeType: "image/jpeg",
    source: {mimeType: "image/jpeg", transcoded: false},
    final: false,
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    ...capturedAt && {capturedAt},
});

const add = (state: EditorState, ...items: EditorMediaInput[]): EditorState => syncDefaultTitle(state, addMedia(state, items).state, "回忆");

describe("syncDefaultTitle", () => {
    it("writes the earliest capture date into an empty title when the film gets its first media", () => {
        const state = add(createEditor(1, "clean"), photo("late.jpg", "2026-03-01T00:00:00Z"), photo("early.jpg", "2026-01-17T08:00:00+08:00"));
        expect(currentDoc(state).title).toBe("2026-01-17 回忆");
    });

    it("uses only the word when nothing has a capture date", () => {
        const state = add(createEditor(1, "clean"), photo("a.jpg"));
        expect(currentDoc(state).title).toBe("回忆");
    });

    it("does not refill a title the user cleared or edited", () => {
        let state = add(createEditor(1, "clean"), photo("a.jpg", "2026-01-17T00:00:00Z"));
        state = setTitle(state, "", 1);
        state = add(state, photo("b.jpg", "2026-02-02T00:00:00Z"));
        expect(currentDoc(state).title).toBe("");

        state = setTitle(state, "春游", 2);
        state = add(state, photo("c.jpg", "2026-01-01T00:00:00Z"));
        expect(currentDoc(state).title).toBe("春游");
    });

    it("updates the date while the title is still the previous automatic one", () => {
        let state = add(createEditor(1, "clean"), photo("early.jpg", "2026-01-17T00:00:00Z"), photo("late.jpg", "2026-05-01T00:00:00Z"));
        const early = currentDoc(state).media[0]!;
        state = syncDefaultTitle(state, removeMedia(state, early.key), "回忆");
        expect(currentDoc(state).title).toBe("2026-05-01 回忆");
    });

    it("uses the word passed in, so the English UI can say Memories", () => {
        const fresh = createEditor(1, "clean");
        const state = syncDefaultTitle(fresh, addMedia(fresh, [photo("a.jpg", "2026-01-17T00:00:00Z")]).state, "Memories");
        expect(currentDoc(state).title).toBe("2026-01-17 Memories");
    });
});

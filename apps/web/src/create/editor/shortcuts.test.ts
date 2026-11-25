import {describe, expect, it} from "vitest";
import {commandForShortcut, shortcutLabel, type KeyInfo} from "./shortcuts";
import {dropMoveTarget} from "./reorder";

// eslint-disable-next-line @stylistic/max-len
const key = (k: string, over: Partial<KeyInfo> = {}): KeyInfo => ({key: k, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, ...over});
const win = {isMac: false, inTextField: false};
const mac = {isMac: true, inTextField: false};

describe("快捷键", () => {
    it("Windows：Ctrl+O/S/E/I/Z/Y", () => {
        expect(commandForShortcut(key("o"), win)).toBe("open");
        expect(commandForShortcut(key("s"), win)).toBe("save");
        expect(commandForShortcut(key("e"), win)).toBe("exportMp4");
        expect(commandForShortcut(key("i"), win)).toBe("addMedia");
        expect(commandForShortcut(key("z"), win)).toBe("undo");
        expect(commandForShortcut(key("y"), win)).toBe("redo");
        expect(commandForShortcut(key("z", {shiftKey: true}), win)).toBe("redo");
        expect(commandForShortcut(key("S"), win)).toBe("save");
    });

    it("Mac：用 Command，Ctrl 不算", () => {
        expect(commandForShortcut(key("s", {ctrlKey: false, metaKey: true}), mac)).toBe("save");
        expect(commandForShortcut(key("s"), mac)).toBeNull();
        expect(commandForShortcut(key("s", {ctrlKey: false, metaKey: true}), win)).toBeNull();
    });

    it("没有修饰键、带 Alt、或不认识的键：没有命令", () => {
        expect(commandForShortcut(key("s", {ctrlKey: false}), win)).toBeNull();
        expect(commandForShortcut(key("s", {altKey: true}), win)).toBeNull();
        expect(commandForShortcut(key("n"), win)).toBeNull();
        expect(commandForShortcut(key("s", {shiftKey: true}), win)).toBeNull();
    });

    it("文本框里不拦截撤销和重做，但仍拦截保存等", () => {
        const field = {isMac: false, inTextField: true};
        expect(commandForShortcut(key("z"), field)).toBeNull();
        expect(commandForShortcut(key("y"), field)).toBeNull();
        expect(commandForShortcut(key("z", {shiftKey: true}), field)).toBeNull();
        expect(commandForShortcut(key("s"), field)).toBe("save");
        expect(commandForShortcut(key("o"), field)).toBe("open");
        expect(commandForShortcut(key("i"), field)).toBe("addMedia");
    });

    it("菜单里的快捷键文字", () => {
        expect(shortcutLabel("save", false)).toBe("Ctrl+S");
        expect(shortcutLabel("redo", false)).toBe("Ctrl+Y");
        expect(shortcutLabel("save", true)).toBe("⌘S");
        expect(shortcutLabel("redo", true)).toBe("⇧⌘Z");
        expect(shortcutLabel("new", false)).toBeUndefined();
        expect(shortcutLabel("about", false)).toBeUndefined();
    });
});

describe("拖动排序落点", () => {
    it("落在自己前后的缝隙：不动", () => {
        expect(dropMoveTarget(2, 2)).toBeNull();
        expect(dropMoveTarget(2, 3)).toBeNull();
    });
    it("往后拖：目标下标比缝隙小 1；往前拖：目标下标等于缝隙", () => {
        expect(dropMoveTarget(0, 3)).toBe(2);
        expect(dropMoveTarget(0, 5)).toBe(4);
        expect(dropMoveTarget(4, 0)).toBe(0);
        expect(dropMoveTarget(4, 1)).toBe(1);
    });
});

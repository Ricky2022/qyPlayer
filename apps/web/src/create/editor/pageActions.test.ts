import { describe, expect, it } from "vitest";
import { applyPageAction, clampPageSeconds } from "./pageActions";
import { autoPages, coversExactly, keysOf } from "./pages";
import { addMedia, currentDoc, selectedMedia, undo, type EditorState } from "./state";
import { filmState, photo } from "./testFixtures";

const pagesOf = (state: EditorState) => currentDoc(state).pages ?? autoPages({ ...currentDoc(state), media: selectedMedia(currentDoc(state)) });
const manual = (state: EditorState) => currentDoc(state).pages!;

describe("页操作 → 编辑状态", () => {
  it("clampPageSeconds：限制在 1 到 15 秒并取整到 0.5 秒", () => {
    expect(clampPageSeconds(0.2)).toBe(1);
    expect(clampPageSeconds(99)).toBe(15);
    expect(clampPageSeconds(4.3)).toBe(4.5);
    expect(clampPageSeconds(4.2)).toBe(4);
  });

  it("movePage：移动并选中目标位置；没有变化时状态不变", () => {
    const state = filmState();
    const first = pagesOf(state)[0]!;
    const moved = applyPageAction(state, { kind: "movePage", from: 0, to: 2 });
    expect(moved.select).toBe(2);
    expect(manual(moved.state)[2]).toEqual(first);
    expect(applyPageAction(state, { kind: "movePage", from: 1, to: 1 })).toEqual({ state });
    expect(applyPageAction(state, { kind: "movePage", from: 0, to: 99 })).toEqual({ state });
  });

  it("removePage：去掉这一页的素材，选中落在它的位置（最后一页则选前一页）", () => {
    const state = filmState();
    const total = pagesOf(state).length;
    const middle = applyPageAction(state, { kind: "removePage", index: 1 });
    expect(middle.select).toBe(1);
    expect(manual(middle.state)).toHaveLength(total - 1);
    const last = applyPageAction(state, { kind: "removePage", index: total - 1 });
    expect(last.select).toBe(total - 2);
    expect(applyPageAction(state, { kind: "removePage", index: 99 }).state).toBe(state);
  });

  it("duration：限制范围；自动编排的第一次修改变成手动编排；undefined 恢复自动；连续拖动合并成一步", () => {
    const state = filmState();
    const a = applyPageAction(state, { kind: "duration", index: 1, seconds: 99, at: 0 }).state;
    expect(manual(a)[1]!.duration).toBe(15);
    const b = applyPageAction(a, { kind: "duration", index: 1, seconds: 6, at: 300 }).state;
    expect(manual(b)[1]!.duration).toBe(6);
    expect(currentDoc(undo(b)).pages).toBeNull();
    const c = applyPageAction(b, { kind: "duration", index: 1, seconds: undefined, at: 400 }).state;
    expect(manual(c)[1]).not.toHaveProperty("duration");
  });

  it("transition / layout / fit 写进对应的页和素材", () => {
    const state = filmState();
    const pages = pagesOf(state);
    const multi = pages.findIndex((p) => p.items.length > 1);
    let next = applyPageAction(state, { kind: "transition", index: 1, transition: { type: "slide", direction: "up" } }).state;
    expect(manual(next)[1]!.transition).toEqual({ type: "slide", direction: "up" });
    next = applyPageAction(next, { kind: "transition", index: 1, transition: undefined }).state;
    expect(manual(next)[1]).not.toHaveProperty("transition");
    next = applyPageAction(next, { kind: "layout", index: multi, layout: "stack" }).state;
    expect(manual(next)[multi]!.layout).toBe("stack");
    next = applyPageAction(next, { kind: "fit", index: multi, item: 0, fit: "contain" }).state;
    expect(manual(next)[multi]!.items[0]!.fit).toBe("contain");
  });

  it("movePhoto / split：选中照片现在所在的页", () => {
    const state = filmState();
    const pages = pagesOf(state);
    const multi = pages.findIndex((p) => p.items.length > 1);
    const split = applyPageAction(state, { kind: "split", index: multi, item: 0 });
    expect(split.select).toBe(multi + 1);
    expect(manual(split.state)[multi + 1]!.items[0]!.key).toBe(pages[multi]!.items[0]!.key);
    // 把单独成页的照片再移回上一页：选中回到合并后的那一页
    const back = applyPageAction(split.state, { kind: "movePhoto", index: multi + 1, item: 0, direction: -1 });
    expect(back.select).toBe(multi);
    expect(coversExactly(manual(back.state), keysOf(pages))).toBe(true);
  });

  it("merge：合并后选中合并的页；不允许时不变", () => {
    const state = filmState();
    const pages = pagesOf(state);
    const multi = pages.findIndex((p) => p.items.length > 1);
    // 先把一张照片拆出去，再合并回来：张数回到原样
    const split = applyPageAction(state, { kind: "split", index: multi, item: 0 }).state;
    const merged = applyPageAction(split, { kind: "merge", index: multi });
    expect(merged.select).toBe(multi);
    expect(manual(merged.state)[multi]!.items).toHaveLength(pages[multi]!.items.length);
    expect(applyPageAction(state, { kind: "merge", index: pages.length - 1 }).state).toBe(state);
  });

  it("手动编排后添加素材仍保留修改（页操作之后再加图）", () => {
    const edited = applyPageAction(filmState(), { kind: "duration", index: 0, seconds: 7, at: 0 }).state;
    const added = addMedia(edited, [photo("late.jpg")]).state;
    expect(manual(added)[0]!.duration).toBe(7);
  });
});

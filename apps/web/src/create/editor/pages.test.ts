import { describe, expect, it } from "vitest";
import { planProblems } from "@qyplayer/core";
import { mediaInputOf, planPackage } from "../buildPackage";
import {
  applyTransitionToAll,
  autoPages,
  coversExactly,
  followPageOrder,
  keysOf,
  mergeWithNext,
  movePage,
  movePhoto,
  moveItemInPage,
  pagesFromPlan,
  pagesToPlan,
  keysById,
  reconcilePages,
  splitPhoto,
  updateItem,
  updatePage,
  type EditorPage,
  type PageContext,
  type PlanningInput,
} from "./pages";
import { buildOptionsOf } from "./preview";
import {
  TWEAK_MERGE_MS,
  addMedia,
  canUndo,
  createEditor,
  currentDoc,
  editPages,
  moveMedia,
  removeMedia,
  removePage,
  resetPages,
  selectedMedia,
  setAspect,
  setLength,
  setLook,
  setSeed,
  setTemplate,
  setTransition,
  sortMediaByCapturedAt,
  undo,
  type EditorMediaInput,
  type EditorState,
} from "./state";

const photo = (name: string, width = 1600, height = 1067, capturedAt?: string): EditorMediaInput => ({
  fileName: name,
  type: "image",
  blob: new Blob([name]),
  width,
  height,
  mimeType: "image/jpeg",
  source: { mimeType: "image/jpeg", transcoded: false },
  final: false,
  ...(capturedAt && { capturedAt }),
});
const clip = (name: string): EditorMediaInput => ({
  fileName: name,
  type: "video",
  blob: new Blob([name]),
  width: 1920,
  height: 1080,
  duration: 20,
  hasAudio: true,
  mimeType: "video/mp4",
  source: { mimeType: "video/mp4", transcoded: false },
  final: false,
});

/** 8 张照片（含竖图）加一段视频，“活泼”模板会出现多图页 */
function filmState(): EditorState {
  const inputs = [
    ...Array.from({ length: 6 }, (_, i) => photo(`p${i}.jpg`, 1600, 1067, `2026-03-0${i + 1}T00:00:00Z`)),
    clip("v.mp4"),
    photo("t1.jpg", 1067, 1600),
    photo("t2.jpg", 1067, 1600),
  ];
  const state = setTemplate(addMedia(createEditor(5, "clean"), inputs).state, "lively");
  return state;
}

const inputOf = (state: EditorState): PlanningInput => ({ ...currentDoc(state), media: selectedMedia(currentDoc(state)) });
const ctxOf = (state: EditorState): PageContext => {
  const videos = new Set(currentDoc(state).media.filter((m) => m.type === "video").map((m) => m.key));
  return { isVideo: (key) => videos.has(key) };
};
const pagesOf = (state: EditorState): readonly EditorPage[] => currentDoc(state).pages ?? autoPages(inputOf(state));
const find = (pages: readonly EditorPage[], pred: (page: EditorPage) => boolean): number => pages.findIndex(pred);

/** 生成的清单与编排一致：每个素材恰好用一次，编排合法 */
function expectConsistent(state: EditorState): void {
  const doc = currentDoc(state);
  const media = selectedMedia(doc);
  expect(doc.pages).not.toBeNull();
  expect(coversExactly(doc.pages!, media.map((m) => m.key))).toBe(true);
  expect(planProblems(pagesToPlan(doc.pages!, media.map((m) => m.key)), media.map(mediaInputOf))).toBeNull();
  // 素材列表的顺序跟随页的顺序
  expect(keysOf(doc.pages!)).toEqual(media.map((m) => m.key));
}

describe("编排与清单的转换", () => {
  it("pagesToPlan / pagesFromPlan 互为逆运算，素材 id 按入选素材的位置编号", () => {
    const state = filmState();
    const pages = autoPages(inputOf(state));
    const keys = selectedMedia(currentDoc(state)).map((m) => m.key);
    const plan = pagesToPlan(pages, keys);
    expect(plan.flatMap((p) => p.items.map((i) => i.assetId)).sort()).toEqual(keys.map((_, i) => `m${String(i + 1).padStart(3, "0")}`));
    expect(pagesFromPlan(plan, keysById(keys))).toEqual(pages);
  });

  it("autoPages 就是 0.4.0 的自动编排：按它生成的清单与不带 pages 生成的清单相同", () => {
    const doc = currentDoc(filmState());
    const options = buildOptionsOf(doc);
    const keys = selectedMedia(doc).map((m) => m.key);
    const withPages = planPackage({ ...options, pages: pagesToPlan(autoPages({ ...doc, media: selectedMedia(doc) }), keys) });
    const auto = planPackage(options);
    delete withPages.manifest.generator!.plan;
    // id 与创建时间每次不同，其余必须一致
    expect({ ...withPages.manifest, id: "x", createdAt: "x" }).toEqual({ ...auto.manifest, id: "x", createdAt: "x" });
  });
});

describe("页操作（纯函数）", () => {
  const state = filmState();
  const pages = pagesOf(state);
  const ctx = ctxOf(state);
  const multi = find(pages, (p) => p.items.length > 1);
  const videoPage = find(pages, (p) => ctx.isVideo(p.items[0]!.key));

  it("前提：有多图页和视频页", () => {
    expect(multi).toBeGreaterThanOrEqual(0);
    expect(videoPage).toBeGreaterThanOrEqual(0);
  });

  it("movePage 移动页；没变化返回同一个数组，越界返回 null", () => {
    const moved = movePage(pages, 0, 2)!;
    expect(keysOf(moved).sort()).toEqual(keysOf(pages).sort());
    expect(moved[2]).toBe(pages[0]);
    expect(movePage(pages, 1, 1)).toBe(pages);
    expect(movePage(pages, 0, 99)).toBeNull();
  });

  it("updatePage / updateItem 改字段，undefined 表示恢复自动，值相同时返回同一个数组", () => {
    const withDuration = updatePage(pages, 1, { duration: 6 })!;
    expect(withDuration[1]!.duration).toBe(6);
    expect(updatePage(withDuration, 1, { duration: 6 })).toBe(withDuration);
    expect(updatePage(withDuration, 1, { duration: undefined })![1]).not.toHaveProperty("duration");
    const single = find(pages, (p) => p.items.length === 1 && !ctx.isVideo(p.items[0]!.key));
    const framed = updateItem(pages, single, 0, { crop: { zoom: 2, x: 0.3, y: 0.4 }, fit: "contain" })!;
    expect(framed[single]!.items[0]).toMatchObject({ crop: { zoom: 2, x: 0.3, y: 0.4 }, fit: "contain" });
    expect(updateItem(pages, single, 9, { fit: "cover" })).toBeNull();
  });

  it("moveItemInPage 换页内格子顺序", () => {
    const next = moveItemInPage(pages, multi, 0, 1)!;
    expect(next[multi]!.items.map((i) => i.key)).toEqual([pages[multi]!.items[1]!.key, pages[multi]!.items[0]!.key, ...pages[multi]!.items.slice(2).map((i) => i.key)]);
    expect(moveItemInPage(pages, multi, 0, 0)).toBe(pages);
  });

  it("movePhoto：向后移到后一页的开头，向前移到前一页的末尾，素材整体顺序不变；原页空了就删除", () => {
    const from = pages.slice(0, -1).findIndex((p, i) => p.items.length < 4 && p.items.every((it) => !ctx.isVideo(it.key)) && pages[i + 1]!.items.length < 4 && pages[i + 1]!.items.every((it) => !ctx.isVideo(it.key)));
    expect(from).toBeGreaterThanOrEqual(0);
    const last = pages[from]!.items.length - 1;
    const forward = movePhoto(pages, ctx, from, last, 1)!;
    expect(keysOf(forward)).toEqual(keysOf(pages));
    expect(forward[from + (pages[from]!.items.length === 1 ? 0 : 1)]!.items[0]!.key).toBe(pages[from]!.items[last]!.key);
    const backward = movePhoto(pages, ctx, from + 1, 0, -1)!;
    expect(keysOf(backward)).toEqual(keysOf(pages));
    expect(coversExactly(backward, keysOf(pages))).toBe(true);
    if (pages[from + 1]!.items.length === 1) expect(backward).toHaveLength(pages.length - 1);
  });

  it("movePhoto：视频不能移，也不能移进视频页，已满的页不能再收", () => {
    expect(movePhoto(pages, ctx, videoPage, 0, 1)).toBeNull();
    const before = videoPage - 1;
    expect(movePhoto(pages, ctx, before, 0, 1)).toBeNull();
    expect(movePhoto(pages, ctx, 0, 0, -1)).toBeNull();
    const full: EditorPage[] = [
      { items: [{ key: 1 }, { key: 2 }, { key: 3 }, { key: 4 }] },
      { items: [{ key: 5 }] },
    ];
    expect(movePhoto(full, { isVideo: () => false }, 1, 0, -1)).toBeNull();
  });

  it("移动照片后页内张数变了，版式换回默认；单张照片没有 Ken Burns 时补上", () => {
    const two: EditorPage[] = [{ items: [{ key: 1 }, { key: 2 }], layout: "stack" }, { items: [{ key: 3, kenBurns: "none" }] }];
    const no = { isVideo: () => false };
    const moved = movePhoto(two, no, 0, 1, 1)!;
    expect(moved[0]).not.toHaveProperty("layout");
    expect(moved[0]!.items).toEqual([{ key: 1, kenBurns: "in" }]);
    expect(moved[1]!.items.map((i) => i.key)).toEqual([2, 3]);
  });

  it("splitPhoto：拆成紧跟其后的单独一页；单张页不能拆", () => {
    const split = splitPhoto(pages, ctx, multi, 0)!;
    expect(split).toHaveLength(pages.length + 1);
    expect(split[multi + 1]!.items).toHaveLength(1);
    expect(split[multi + 1]!.items[0]!.key).toBe(pages[multi]!.items[0]!.key);
    expect(split[multi + 1]!.items[0]!.kenBurns).toBeDefined();
    expect(coversExactly(split, keysOf(pages))).toBe(true);
    const single = find(pages, (p) => p.items.length === 1);
    expect(splitPhoto(pages, ctx, single, 0)).toBeNull();
  });

  it("mergeWithNext：合并相邻照片页，总数不超过 4，视频页不能合并", () => {
    const merged = mergeWithNext([{ items: [{ key: 1, kenBurns: "in" }], duration: 4 }, { items: [{ key: 2, kenBurns: "out" }] }], { isVideo: () => false }, 0)!;
    expect(merged).toHaveLength(1);
    expect(merged[0]!.items.map((i) => i.key)).toEqual([1, 2]);
    expect(merged[0]!.duration).toBe(4);
    expect(mergeWithNext([{ items: [{ key: 1 }, { key: 2 }, { key: 3 }] }, { items: [{ key: 4 }, { key: 5 }] }], { isVideo: () => false }, 0)).toBeNull();
    expect(mergeWithNext(pages, ctx, videoPage)).toBeNull();
    expect(mergeWithNext(pages, ctx, videoPage - 1)).toBeNull();
    expect(mergeWithNext(pages, ctx, pages.length - 1)).toBeNull();
  });

  it("applyTransitionToAll：第 2 页起都用该转场，滑动的方向相邻页不同", () => {
    const next = applyTransitionToAll(pages, "slide");
    expect(next[0]).toBe(pages[0]);
    next.slice(1).forEach((p, i) => {
      expect(p.transition?.type).toBe("slide");
      if (i > 0) expect(p.transition?.direction).not.toBe(next[i]!.transition?.direction);
    });
    expect(applyTransitionToAll(pages, "zoom").slice(1).every((p) => p.transition?.type === "zoom" && p.transition.direction === undefined)).toBe(true);
  });

  it("followPageOrder：入选素材按页序排进原来的位置，未入选的不动", () => {
    const list = [{ key: 1 }, { key: 2 }, { key: 3 }, { key: 4 }];
    const only: EditorPage[] = [{ items: [{ key: 4 }] }, { items: [{ key: 1 }, { key: 3 }] }];
    expect(followPageOrder(list, only).map((m) => m.key)).toEqual([4, 2, 1, 3]);
  });

  it("reconcilePages：去掉没了的素材，新素材分页接在末尾，已有页不动", () => {
    const input = inputOf(state);
    const extra = { ...photo("new.jpg"), key: 999 };
    const grown = reconcilePages(pages, { ...input, media: [...input.media, extra] }, ctx)!;
    expect(grown.slice(0, pages.length)).toEqual(pages);
    expect(grown.slice(pages.length).flatMap((p) => p.items.map((i) => i.key))).toEqual([999]);
    const dropped = input.media.filter((m) => m.key !== pages[multi]!.items[0]!.key);
    const shrunk = reconcilePages(pages, { ...input, media: dropped }, ctx)!;
    expect(shrunk[multi]!.items).toHaveLength(pages[multi]!.items.length - 1);
    expect(shrunk[multi]).not.toHaveProperty("layout");
    expect(reconcilePages(pages, { ...input, media: [] }, ctx)).toBeNull();
  });
});

describe("编辑状态：单页编辑", () => {
  it("第一次修改把自动编排存成手动编排，画面不变，只有被改的地方变", async () => {
    const before = filmState();
    expect(currentDoc(before).pages).toBeNull();
    const target = 1;
    const after = editPages(before, (pages) => updatePage(pages, target, { duration: 7 }));
    expect(currentDoc(after).pages).not.toBeNull();
    expectConsistent(after);
    const a = planPackage(buildOptionsOf(currentDoc(before))).manifest;
    const b = planPackage(buildOptionsOf(currentDoc(after))).manifest;
    expect(b.pages[target]!.duration).toBe(7);
    // 其他页的内容（素材、格子、转场种类、运动）与之前一致；时间会因时长变化而平移
    const strip = (m: typeof a, i: number) => ({ ...m.pages[i]!, id: "", start: 0, duration: 0, transitionIn: { ...m.pages[i]!.transitionIn!, duration: 0 } });
    for (const i of a.pages.keys()) if (i !== target) expect(strip(b, i)).toEqual(strip(a, i));
  });

  it("没有变化或不允许的修改不产生历史", () => {
    const state = filmState();
    expect(editPages(state, (p) => movePage(p, 0, 0))).toBe(state);
    expect(editPages(state, (p) => movePage(p, 0, 99))).toBe(state);
    const edited = editPages(state, (p) => updatePage(p, 0, { duration: 5 }));
    expect(editPages(edited, (p) => updatePage(p, 0, { duration: 5 }))).toBe(edited);
  });

  it("每次修改一步撤销；撤销回到自动编排", () => {
    const state = filmState();
    const one = editPages(state, (p) => updatePage(p, 1, { duration: 5 }));
    const two = editPages(one, (p) => updatePage(p, 1, { duration: 6 }), undefined);
    expect(canUndo(two)).toBe(true);
    expect(currentDoc(undo(two)).pages).toBe(currentDoc(one).pages);
    expect(currentDoc(undo(undo(two))).pages).toBeNull();
  });

  it("滑块连续调整同一项（间隔不超过 1 秒）合并为一步，换一项或隔得久就另起一步", () => {
    const state = editPages(filmState(), (p) => updatePage(p, 1, { duration: 4 }), { key: "page-1-duration", at: 0 });
    const sameSlider = editPages(state, (p) => updatePage(p, 1, { duration: 5 }), { key: "page-1-duration", at: 500 });
    const stillSame = editPages(sameSlider, (p) => updatePage(p, 1, { duration: 6 }), { key: "page-1-duration", at: 500 + TWEAK_MERGE_MS });
    expect(currentDoc(stillSame).pages![1]!.duration).toBe(6);
    expect(undo(stillSame)).toMatchObject({ present: { doc: { pages: null } } });
    const other = editPages(stillSame, (p) => updatePage(p, 2, { duration: 3 }), { key: "page-2-duration", at: 1700 });
    expect(currentDoc(undo(other)).pages![1]!.duration).toBe(6);
    const late = editPages(stillSame, (p) => updatePage(p, 1, { duration: 7 }), { key: "page-1-duration", at: 500 + TWEAK_MERGE_MS + TWEAK_MERGE_MS + 1 });
    expect(currentDoc(undo(late)).pages![1]!.duration).toBe(6);
  });

  it("页移动后素材列表跟着变，且仍与入选素材一一对应", () => {
    const state = editPages(filmState(), (p) => movePage(p, 0, 3));
    expectConsistent(state);
    expect(currentDoc(state).media.map((m) => m.key)).toEqual(keysOf(currentDoc(state).pages!));
  });

  it("removePage 把这一页的素材一并去掉；删光后回到自动编排", () => {
    const state = filmState();
    const pages = pagesOf(state);
    const target = find(pages, (p) => p.items.length > 1);
    const after = removePage(state, target);
    expect(currentDoc(after).media).toHaveLength(currentDoc(state).media.length - pages[target]!.items.length);
    expectConsistent(after);
    expect(removePage(state, 99)).toBe(state);
    let single = addMedia(createEditor(1, "clean"), [photo("only.jpg")]).state;
    single = removePage(single, 0);
    expect(currentDoc(single).media).toHaveLength(0);
    expect(currentDoc(single).pages).toBeNull();
  });

  it("整片重排的操作会丢掉单页修改：换模板、换一版、改时长档、排序、素材列表拖动", () => {
    const edited = editPages(filmState(), (p) => updatePage(p, 1, { duration: 5 }));
    expect(currentDoc(edited).pages).not.toBeNull();
    expect(currentDoc(setTemplate(edited, "classic")).pages).toBeNull();
    expect(currentDoc(setSeed(edited, 999)).pages).toBeNull();
    expect(currentDoc(setLength(edited, "short")).pages).toBeNull();
    expect(currentDoc(moveMedia(edited, 0, 2)).pages).toBeNull();
    // 拍摄时间排序：当前素材列表已经不是拍摄时间顺序时才有变化
    const unsorted = editPages(filmState(), (p) => movePage(p, 0, 3));
    expect(currentDoc(sortMediaByCapturedAt(unsorted)).pages).toBeNull();
  });

  it("画面比例、滤镜、标题等不影响手动编排", () => {
    const edited = editPages(filmState(), (p) => updatePage(p, 1, { duration: 5 }));
    const pages = currentDoc(edited).pages;
    expect(currentDoc(setAspect(edited, "9:16")).pages).toBe(pages);
    expect(currentDoc(setLook(edited, "warm")).pages).toBe(pages);
  });

  it("全片转场：固定类型覆盖各页，选回“跟随模板”不改", () => {
    const edited = editPages(filmState(), (p) => updatePage(p, 1, { duration: 5 }));
    const slid = setTransition(edited, "zoom");
    expect(currentDoc(slid).pages!.slice(1).every((p) => p.transition?.type === "zoom")).toBe(true);
    const auto = setTransition(slid, "auto");
    expect(currentDoc(auto).pages).toBe(currentDoc(slid).pages);
  });

  it("手动编排时添加素材：新素材分页接在末尾，已有页不动；删除素材：从所在页去掉", () => {
    const edited = editPages(filmState(), (p) => updatePage(p, 1, { duration: 5 }));
    const pages = currentDoc(edited).pages!;
    const added = addMedia(edited, [photo("x1.jpg"), photo("x2.jpg")]).state;
    expectConsistent(added);
    expect(currentDoc(added).pages!.slice(0, pages.length)).toEqual(pages);
    expect(currentDoc(added).pages!.length).toBeGreaterThan(pages.length);
    const victim = pages.find((p) => p.items.length > 1)!.items[0]!.key;
    const removed = removeMedia(added, victim);
    expectConsistent(removed);
    expect(keysOf(currentDoc(removed).pages!)).not.toContain(victim);
  });

  it("自动编排时增删素材仍是整片重排（pages 保持 null）", () => {
    const state = filmState();
    expect(currentDoc(addMedia(state, [photo("y.jpg")]).state).pages).toBeNull();
    expect(currentDoc(removeMedia(state, currentDoc(state).media[0]!.key)).pages).toBeNull();
  });

  it("resetPages 恢复自动编排，可撤销", () => {
    const edited = editPages(filmState(), (p) => updatePage(p, 1, { duration: 5 }));
    const back = resetPages(edited);
    expect(currentDoc(back).pages).toBeNull();
    expect(currentDoc(undo(back)).pages).not.toBeNull();
    expect(resetPages(back)).toBe(back);
  });
});

describe("生成与保存", () => {
  it("手动编排的包把 generator.plan 写进清单，素材用清单里的 id；自动编排不写", () => {
    const auto = planPackage(buildOptionsOf(currentDoc(filmState())));
    expect(auto.manifest.generator).not.toHaveProperty("plan");
    const edited = editPages(filmState(), (p) => updatePage(p, 1, { duration: 5 }));
    const { manifest } = planPackage(buildOptionsOf(currentDoc(edited)));
    const plan = manifest.generator!.plan as { items: { assetId: string }[] }[];
    expect(Array.isArray(plan)).toBe(true);
    const ids = new Set(manifest.assets.map((a) => a.id));
    expect(plan.every((page) => page.items.every((i) => ids.has(i.assetId)))).toBe(true);
  });
});

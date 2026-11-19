import { describe, expect, it } from "vitest";
import { classifyDrop } from "./drop";
import { DESKTOP_MEDIA_QUERY, DESKTOP_MIN_WIDTH, layoutFor } from "./layout";
import { menuStatus, type MenuContext } from "./menu";

const file = (name: string): { name: string } => ({ name });

describe("拖入文件分类（3A.5）", () => {
  it("没有文件什么都不做", () => {
    expect(classifyDrop([])).toEqual({ kind: "none" });
  });

  it("只有一个 .qyp：打开（扩展名不区分大小写）", () => {
    const f = file("旅行.QYP");
    expect(classifyDrop([f])).toEqual({ kind: "open", file: f });
  });

  it(".qyp 加照片或视频：添加媒体，忽略 .qyp 并提示", () => {
    const a = file("a.jpg");
    const b = file("b.mp4");
    expect(classifyDrop([a, file("x.qyp"), b])).toEqual({ kind: "add", files: [a, b], ignoredQyp: true });
  });

  it("多个 .qyp：不打开，提示一次只能打开一个（同时拖入媒体也一样不添加）", () => {
    expect(classifyDrop([file("1.qyp"), file("2.qyp")])).toEqual({ kind: "multiple-qyp" });
    expect(classifyDrop([file("1.qyp"), file("2.qyp"), file("a.jpg")])).toEqual({ kind: "multiple-qyp" });
  });

  it("只有媒体：添加，没有忽略任何文件", () => {
    const a = file("a.jpg");
    expect(classifyDrop([a])).toEqual({ kind: "add", files: [a], ignoredQyp: false });
  });
});

const base: MenuContext = { mediaCount: 3, busy: false, canUndo: true, canRedo: true, canExport: true, manualPages: true };

describe("菜单可用状态（3A.3）", () => {
  it("一般情况下全部可用", () => {
    expect(Object.values(menuStatus(base)).every((s) => s === "enabled")).toBe(true);
  });

  it("没有素材：保存、导出、排序灰显，新建、打开、添加、关于可用", () => {
    const s = menuStatus({ ...base, mediaCount: 0 });
    expect(s).toMatchObject({ save: "disabled", exportMp4: "disabled", sortByTime: "disabled", new: "enabled", open: "enabled", addMedia: "enabled", about: "enabled" });
  });

  it("只有 1 个素材：可以保存，不能排序", () => {
    expect(menuStatus({ ...base, mediaCount: 1 })).toMatchObject({ save: "enabled", sortByTime: "disabled" });
    expect(menuStatus({ ...base, mediaCount: 2 }).sortByTime).toBe("enabled");
  });

  it("恢复自动编排：只有做过单页修改（手动编排）且不忙时可用", () => {
    expect(menuStatus(base).resetPages).toBe("enabled");
    expect(menuStatus({ ...base, manualPages: false }).resetPages).toBe("disabled");
    expect(menuStatus({ ...base, busy: true }).resetPages).toBe("disabled");
  });

  it("素材数 99 可以添加，100 不可以", () => {
    expect(menuStatus({ ...base, mediaCount: 99 }).addMedia).toBe("enabled");
    expect(menuStatus({ ...base, mediaCount: 100 }).addMedia).toBe("disabled");
  });

  it("忙碌时新建、打开、保存、导出、添加、撤销、重做都灰显，排序和关于不受影响", () => {
    const s = menuStatus({ ...base, busy: true });
    for (const command of ["new", "open", "save", "exportMp4", "addMedia", "undo", "redo"] as const) expect(s[command], command).toBe("disabled");
    expect(s).toMatchObject({ sortByTime: "enabled", about: "enabled" });
  });

  it("撤销栈或重做栈为空时对应命令灰显", () => {
    expect(menuStatus({ ...base, canUndo: false })).toMatchObject({ undo: "disabled", redo: "enabled" });
    expect(menuStatus({ ...base, canRedo: false })).toMatchObject({ undo: "enabled", redo: "disabled" });
  });

  it("不满足导出条件时整项隐藏，与素材数和忙碌无关", () => {
    expect(menuStatus({ ...base, canExport: false }).exportMp4).toBe("hidden");
    expect(menuStatus({ ...base, canExport: false, mediaCount: 0, busy: true }).exportMp4).toBe("hidden");
  });
});

describe("布局判断（3A.2）", () => {
  it("1000 像素是分界：999 是手机布局，1000 是电脑布局", () => {
    expect(layoutFor(999)).toBe("mobile");
    expect(layoutFor(1000)).toBe("desktop");
    expect(layoutFor(DESKTOP_MIN_WIDTH - 0.5)).toBe("mobile");
  });

  it("媒体查询与分界一致", () => {
    expect(DESKTOP_MEDIA_QUERY).toBe("(min-width: 1000px)");
  });
});

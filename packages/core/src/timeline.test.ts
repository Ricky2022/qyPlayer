import { describe, expect, it } from "vitest";
import example from "../../../spec/examples/example.manifest.json";
import { bgmGainAt, bgmPositionAt, easeInOut, stateAt, type Manifest } from "./index";

const generated = example as unknown as Manifest;

// 示例清单的入场延迟从页开始计时（与转场并行）。为了把转场和入场分开断言，
// 基准清单把每个入场延迟推迟一个转场时长，使入场在转场结束后才开始；并行的情形见最后的“parallel”用例。
const base = (() => {
  const copy = JSON.parse(JSON.stringify(generated)) as Manifest;
  for (const page of copy.pages) {
    for (const item of page.items) {
      if (item.enter) item.enter.delay = (item.enter.delay ?? 0) + (page.transitionIn?.duration ?? 0);
    }
  }
  return copy;
})();

function variant(change: (m: any) => void): Manifest {
  const copy = JSON.parse(JSON.stringify(base));
  change(copy);
  return copy as Manifest;
}

// 示例清单的时间轴：
//   p001 [0, 4.8)    fade 0.6
//   p002 [4.8, 11.2) slide left 0.6, 两张图 fade 入场 delay 0.6 / 0.75
//   p003 [11.2,19.2) fade 0.6, 视频 m004 (8 秒)
//   p004 [19.2,25.6) zoom 0.6, 三张图 slide / scale / scale 入场

describe("easeInOut", () => {
  it("hits the endpoints and midpoint and is symmetric", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(0.25)).toBeCloseTo(0.0625, 10);
    expect(easeInOut(0.75)).toBeCloseTo(0.9375, 10);
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1, 10);
  });

  it("clamps out-of-range input", () => {
    expect(easeInOut(-3)).toBe(0);
    expect(easeInOut(7)).toBe(1);
  });
});

describe("stateAt: time handling", () => {
  it("clamps time to the film", () => {
    expect(stateAt(base, -5).time).toBe(0);
    const end = stateAt(base, 999);
    expect(end.time).toBe(base.duration);
    expect(end.pageIndex).toBe(3);
  });

  it("switches page exactly at the boundary, still showing the previous page first", () => {
    const s = stateAt(base, 4.8);
    expect(s.pageIndex).toBe(1);
    expect(s.layers[0]?.pageId).toBe("p001");
  });
});

describe("stateAt: first page fade-in", () => {
  it("starts invisible, reaches 0.5 at the middle, then fully visible", () => {
    expect(stateAt(base, 0).layers).toHaveLength(1);
    expect(stateAt(base, 0).layers[0]?.opacity).toBe(0);
    expect(stateAt(base, 0.15).layers[0]?.opacity).toBeCloseTo(0.0625, 6);
    expect(stateAt(base, 0.3).layers[0]?.opacity).toBeCloseTo(0.5, 6);
    const done = stateAt(base, 2).layers[0]!;
    expect(done.opacity).toBe(1);
    expect(done.rect).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(done.clip).toEqual(done.rect);
    expect(done.fit).toBe("cover");
  });
});

describe("stateAt: slide transition (p001 -> p002)", () => {
  it("at the start only the previous page is visible and the new page waits off-canvas", () => {
    const s = stateAt(base, 4.8);
    expect(s.layers).toHaveLength(3);
    const [prev, a, b] = s.layers as [any, any, any];
    expect(prev.opacity).toBe(1);
    expect(prev.rect.x).toBeCloseTo(0, 6);
    // 向左滑动：新页从右侧进入，起始位置完整在画布右侧之外
    expect(a.clip.x).toBeCloseTo(1, 6);
    expect(a.opacity).toBe(0); // 入场动画 delay 0.6，尚未开始
    expect(b.opacity).toBe(0);
  });

  it("at the midpoint both pages are half way across", () => {
    const [prev, a, b] = stateAt(base, 5.1).layers as [any, any, any];
    expect(prev.rect.x).toBeCloseTo(-0.5, 6);
    expect(a.clip.x).toBeCloseTo(0.5, 6);
    expect(b.clip.x).toBeCloseTo(0.5028 + 0.5, 6);
  });

  it("after the transition only the new page remains, and entrances run", () => {
    const early = stateAt(base, 5.5);
    expect(early.layers).toHaveLength(2);
    expect(early.layers.every((l) => l.pageId === "p002")).toBe(true);

    const mid = stateAt(base, 5.65).layers as [any, any];
    expect(mid[0].opacity).toBeCloseTo(0.5, 6); // delay 0.6, 经过 0.25/0.5
    expect(mid[1].opacity).toBeCloseTo(easeInOut(0.2), 6); // delay 0.75, 经过 0.1/0.5

    const done = stateAt(base, 7).layers as [any, any];
    expect(done[0].opacity).toBe(1);
    expect(done[1].opacity).toBe(1);
    expect(done[0].rect).toEqual(done[0].clip);
  });
});

describe("stateAt: video page and zoom transition (p003 -> p004)", () => {
  it("plays the video from clipStart and advances with page time", () => {
    const layer = stateAt(base, 13.2).layers.find((l) => l.kind === "video")!;
    expect(layer.videoTime).toBeCloseTo(2, 6);
    const late = stateAt(base, 19.1).layers.find((l) => l.kind === "video")!;
    expect(late.videoTime).toBeCloseTo(7.9, 6);
  });

  it("holds the previous video on its last frame while zooming out", () => {
    const s = stateAt(base, 19.5);
    const prev = s.layers[0]!;
    expect(prev.kind).toBe("video");
    expect(prev.videoTime).toBe(8);
    expect(prev.opacity).toBeCloseTo(0.5, 6);
    expect(prev.rect.w).toBeCloseTo(1.05, 6);
    expect(prev.rect.x).toBeCloseTo(-0.025, 6);
  });

  it("scales the incoming page up from 0.9", () => {
    const s = stateAt(base, 19.5);
    const incoming = s.layers[1]!;
    expect(incoming.clip.w).toBeCloseTo(0.4972 * 0.95, 6);
    // 入场动画尚未开始，素材仍不可见
    expect(incoming.opacity).toBe(0);
  });

  it("freezes a video that is shorter than the page", () => {
    const m = variant((x) => {
      x.assets[3].duration = 3;
    });
    const layer = stateAt(m, 17).layers.find((l) => l.kind === "video")!;
    expect(layer.videoTime).toBe(3);
  });

  it("honours clipStart", () => {
    const m = variant((x) => {
      x.pages[2].items[0].clipStart = 1.5;
    });
    const layer = stateAt(m, 13.2).layers.find((l) => l.kind === "video")!;
    expect(layer.videoTime).toBeCloseTo(3.5, 6);
  });
});

describe("stateAt: entrance animations on p004", () => {
  // p004 从 19.2 开始，转场 0.6，所以 t = 19.2 + pageTime
  it("slide enters from outside the cell, clipped to it", () => {
    const [a] = stateAt(base, 20.05).layers as [any]; // pageTime 0.85，入场 delay 0.6 -> 进度 0.5
    expect(a.opacity).toBe(1);
    expect(a.clip.x).toBe(0);
    // 向右滑动：从格子左侧之外进入，半程时偏移 -0.5 个格子宽度
    expect(a.rect.x).toBeCloseTo(-0.5 * 0.4972, 6);
    expect(a.rect.w).toBeCloseTo(0.4972, 6);
  });

  it("scale grows from 0.9 and fades in around the cell centre", () => {
    const layers = stateAt(base, 20.2).layers as any[]; // pageTime 1.0；第二张 delay 0.75 -> 进度 0.5
    const b = layers[1];
    expect(b.opacity).toBeCloseTo(0.5, 6);
    expect(b.rect.w).toBeCloseTo(0.4972 * 0.95, 6);
    const cellCentre = 0.5028 + 0.4972 / 2;
    expect(b.rect.x + b.rect.w / 2).toBeCloseTo(cellCentre, 6);
    expect(b.clip.w).toBeCloseTo(0.4972, 6);
  });

  it("zero-duration entrance switches on at its delay", () => {
    const m = variant((x) => {
      x.pages[1].items[0].enter = { type: "fade", delay: 1, duration: 0 };
    });
    expect(stateAt(m, 5.7).layers[0]?.opacity).toBe(0); // pageTime 0.9 < 1
    expect(stateAt(m, 5.9).layers[0]?.opacity).toBe(1); // pageTime 1.1
  });
});

describe("stateAt: entrance in parallel with the transition (PRD 8.3)", () => {
  it("shows the first item entering while the page slides in", () => {
    // p002 在 4.8 开始，滑入 0.6 秒；enter.delay 为 0 和 0.15，t = 5.1 时页内时间 0.3
    const [prev, a, b] = stateAt(generated, 5.1).layers as [any, any, any];
    expect(prev.pageId).toBe("p001");
    expect(a.opacity).toBeCloseTo(easeInOut(0.3 / 0.5), 6);
    expect(b.opacity).toBeCloseTo(easeInOut(0.15 / 0.5), 6);
  });

  it("never leaves the new page empty once its first item has started entering", () => {
    const s = stateAt(generated, 4.8 + 0.2);
    expect(s.layers.filter((l) => l.pageId === "p002").some((l) => l.opacity > 0)).toBe(true);
  });
});

describe("stateAt: degradation of unknown types (PRD 7.6)", () => {
  it("treats an unknown transition type as fade", () => {
    const unknown = variant((x) => (x.pages[0].transitionIn.type = "cube3d"));
    expect(stateAt(unknown, 0.3)).toEqual(stateAt(base, 0.3));
  });

  it("treats an unknown entrance type as none: visible from the start of the page", () => {
    const m = variant((x) => (x.pages[1].items[0].enter.type = "sparkle"));
    // 转场结束后立即完全可见，不等 delay
    expect(stateAt(m, 5.5).layers[0]?.opacity).toBe(1);
    expect(stateAt(m, 5.5).layers[0]?.rect).toEqual(stateAt(m, 5.5).layers[0]?.clip);
  });

  it("treats a missing or unknown slide direction as left", () => {
    const missing = variant((x) => delete x.pages[1].transitionIn.direction);
    const unknown = variant((x) => (x.pages[1].transitionIn.direction = "diagonal"));
    expect(stateAt(missing, 5.1)).toEqual(stateAt(base, 5.1));
    expect(stateAt(unknown, 5.1)).toEqual(stateAt(base, 5.1));
  });
});

describe("stateAt: transition types", () => {
  it("none cuts straight to the new page", () => {
    const m = variant((x) => (x.pages[2].transitionIn = { type: "none", duration: 0 }));
    const s = stateAt(m, 11.2);
    expect(s.layers).toHaveLength(1);
    expect(s.layers[0]?.pageId).toBe("p003");
    expect(s.layers[0]?.opacity).toBe(1);
  });

  // [方向, 新页在中点的 [x, y] 偏移, 上一页在中点的 [x, y] 偏移]
  it.each<[string, [number, number], [number, number]]>([
    ["left", [0.5, 0], [-0.5, 0]],
    ["right", [-0.5, 0], [0.5, 0]],
    ["up", [0, 0.5], [0, -0.5]],
    ["down", [0, -0.5], [0, 0.5]],
  ])("slide %s moves the new page along that direction", (direction, incoming, outgoing) => {
    const m = variant((x) => {
      x.pages[2].transitionIn = { type: "slide", direction, duration: 0.6 };
    });
    const s = stateAt(m, 11.5); // 转场中点
    const prev = s.layers[0]!;
    const next = s.layers[s.layers.length - 1]!;
    expect(next.clip.x).toBeCloseTo(incoming[0], 6);
    expect(next.clip.y).toBeCloseTo(incoming[1], 6);
    expect(prev.rect.x).toBeCloseTo(outgoing[0], 6);
    expect(prev.rect.y).toBeCloseTo(outgoing[1], 6);
  });

  it("a transition equal to the page duration still completes at the page end", () => {
    const m = variant((x) => (x.pages[0].transitionIn.duration = 4.8));
    expect(stateAt(m, 4.7).layers[0]?.opacity).toBeGreaterThan(0.99);
  });
});

describe("bgm helpers", () => {
  it("fades in and out per fadeIn / fadeOut (A-03)", () => {
    expect(bgmGainAt(base, 0)).toBe(0);
    expect(bgmGainAt(base, 0.5)).toBeCloseTo(0.5, 6);
    expect(bgmGainAt(base, 10)).toBe(1);
    expect(bgmGainAt(base, base.duration - 1)).toBeCloseTo(0.5, 6);
    expect(bgmGainAt(base, base.duration)).toBe(0);
  });

  it("applies volume and handles zero fades", () => {
    const m = variant((x) => {
      x.bgm.volume = 0.4;
      x.bgm.fadeIn = 0;
      x.bgm.fadeOut = 0;
    });
    expect(bgmGainAt(m, 0)).toBeCloseTo(0.4, 6);
    expect(bgmGainAt(m, m.duration)).toBeCloseTo(0.4, 6);
  });

  it("returns silence and no position without bgm", () => {
    const m = variant((x) => delete x.bgm);
    expect(bgmGainAt(m, 5)).toBe(0);
    expect(bgmPositionAt(m, 5)).toBeNull();
  });

  it("maps film time to audio position, looping or stopping (A-04)", () => {
    expect(bgmPositionAt(base, 10)).toBe(10);
    const shortLoop = variant((x) => {
      x.assets.find((a: any) => a.id === "a001").duration = 10;
      x.bgm.loop = true;
    });
    expect(bgmPositionAt(shortLoop, 25)).toBeCloseTo(5, 6);
    const shortNoLoop = variant((x) => {
      x.assets.find((a: any) => a.id === "a001").duration = 10;
    });
    expect(bgmPositionAt(shortNoLoop, 25)).toBeNull();
    expect(bgmPositionAt(shortNoLoop, 9)).toBe(9);
  });
});

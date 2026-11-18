import { describe, expect, it } from "vitest";
import example from "../../../spec/examples/example.manifest.json";
import example01 from "../../../spec/examples/example-0.1.manifest.json";
import { checkPackagePath, referencedPaths, validateManifest, type Manifest } from "./index";

/** 深拷贝示例清单后按需改动，得到一个只违反一条规则的不合法样本 */
function mutated(change: (m: any) => void): unknown {
  const copy = JSON.parse(JSON.stringify(example));
  change(copy);
  return copy;
}

function codes(input: unknown): string[] {
  return validateManifest(input).errors.map((e) => e.code);
}

describe("validateManifest: valid", () => {
  it("accepts the PRD 7.7 example", () => {
    const result = validateManifest(example);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.manifest?.pages).toHaveLength(4);
  });

  it("accepts the 0.1 example (PRD 7.7), which has no mimeType or source", () => {
    expect(validateManifest(example01).errors).toEqual([]);
    expect(validateManifest(example01).ok).toBe(true);
  });

  it("accepts a manifest without optional fields (no bgm, no cover, no generator)", () => {
    const input = mutated((m) => {
      delete m.bgm;
      delete m.cover;
      delete m.generator;
      m.assets = m.assets.filter((a: any) => a.type !== "audio");
    });
    expect(validateManifest(input).errors).toEqual([]);
  });

  it("ignores unknown fields (PRD 7.6)", () => {
    const input = mutated((m) => {
      m.futureField = { anything: true };
      m.pages[0].items[0].futureHint = 1;
    });
    expect(validateManifest(input).ok).toBe(true);
  });

  it("accepts unknown transition and enter types but warns", () => {
    const input = mutated((m) => {
      m.pages[0].transitionIn.type = "cube3d";
      m.pages[1].items[0].enter.type = "sparkle";
    });
    const result = validateManifest(input);
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.code).sort()).toEqual(["unknown-enter-type", "unknown-transition-type"]);
  });
});

describe("validateManifest: version and structure", () => {
  it("rejects a higher format version with a dedicated code", () => {
    expect(codes(mutated((m) => (m.formatVersion = "0.3")))).toEqual(["unsupported-version"]);
    expect(codes(mutated((m) => (m.formatVersion = "1.0")))).toEqual(["unsupported-version"]);
  });

  it("rejects non-object input", () => {
    expect(codes(null)).toEqual(["schema"]);
    expect(codes([])).toEqual(["schema"]);
    expect(codes("manifest")).toEqual(["schema"]);
  });

  it("rejects a missing required field", () => {
    const result = validateManifest(mutated((m) => delete m.pages));
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe("schema");
  });

  it("rejects a video asset without hasAudio", () => {
    const result = validateManifest(mutated((m) => delete m.assets[3].hasAudio));
    expect(result.errors.some((e) => e.code === "schema" && e.path === "/assets/3")).toBe(true);
  });

  it("rejects more than 4 items on a page", () => {
    const input = mutated((m) => {
      const item = m.pages[1].items[0];
      m.pages[1].items = [item, item, item, item, item];
    });
    expect(codes(input)).toContain("schema");
  });

  it("rejects a bad aspect ratio, bad color and out-of-range frame", () => {
    expect(codes(mutated((m) => (m.canvas.aspectRatio = "4:3")))).toContain("schema");
    expect(codes(mutated((m) => (m.canvas.background = "black")))).toContain("schema");
    expect(codes(mutated((m) => (m.pages[0].items[0].frame.w = 1.2)))).toContain("schema");
  });

  it("does not run semantic checks on structurally invalid input", () => {
    const result = validateManifest(mutated((m) => {
      delete m.canvas;
      m.pages[1].start = 99;
    }));
    expect(new Set(result.errors.map((e) => e.code))).toEqual(new Set(["schema"]));
  });
});

describe("validateManifest: 0.2 asset type info", () => {
  const withAsset = (change: (a: any) => void) => mutated((m) => change(m.assets[0]));

  it("requires mimeType and source on every asset, including audio", () => {
    expect(codes(withAsset((a) => delete a.mimeType))).toContain("schema");
    expect(codes(withAsset((a) => delete a.source))).toContain("schema");
    expect(codes(mutated((m) => delete m.assets[6].source))).toContain("schema");
    expect(codes(withAsset((a) => delete a.source.transcoded))).toContain("schema");
    expect(codes(withAsset((a) => delete a.source.mimeType))).toContain("schema");
  });

  it("does not require them in 0.1, and still accepts them there", () => {
    expect(validateManifest(example01).ok).toBe(true);
    const withInfo = JSON.parse(JSON.stringify(example01));
    withInfo.assets[0].mimeType = "image/jpeg";
    expect(validateManifest(withInfo).ok).toBe(true);
  });

  it("accepts HEIC and MOV sources that were not transcoded", () => {
    const input = mutated((m) => {
      m.assets[0].src = "media/m001.heic";
      m.assets[0].mimeType = "image/heic";
      m.assets[0].source = { mimeType: "image/heic", transcoded: false };
      m.assets[3].src = "media/m004.mov";
      m.assets[3].mimeType = 'video/quicktime; codecs="hvc1.2.4.l120.b0, mp4a.40.2"';
      m.assets[3].source = { mimeType: m.assets[3].mimeType, transcoded: false };
    });
    expect(validateManifest(input).errors).toEqual([]);
  });

  it("rejects mimeType whose top-level type differs from the asset type", () => {
    expect(codes(mutated((m) => (m.assets[1].mimeType = "video/mp4")))).toEqual(["mime-type-mismatch", "source-not-transcoded-mismatch"]);
    expect(codes(withAsset((a) => { a.mimeType = "video/mp4"; a.source = { mimeType: "image/heic", transcoded: true }; }))).toEqual(["mime-type-mismatch"]);
    expect(codes(withAsset((a) => (a.source = { mimeType: "audio/mpeg", transcoded: true })))).toEqual(["mime-type-mismatch"]);
  });

  it("rejects malformed mimeType values", () => {
    for (const bad of ["JPEG", "image/JPEG", "image", "image/jpeg;codecs=<x>", 'image/jpeg; codecs="A"', "text/plain", "image/jpeg ", `image/${"a".repeat(200)}`]) {
      expect(codes(withAsset((a) => { a.mimeType = bad; a.source.mimeType = bad; })), bad).toContain("schema");
    }
    expect(codes(withAsset((a) => (a.source.mimeType = "image/jp eg")))).toContain("schema");
  });

  it("accepts a codecs parameter with or without the space after the semicolon", () => {
    const input = mutated((m) => {
      const v = 'video/mp4;codecs="avc1.640028,mp4a.40.2"';
      m.assets[3].mimeType = v;
      m.assets[3].source = { mimeType: v, transcoded: false };
    });
    expect(validateManifest(input).errors).toEqual([]);
  });

  it("rejects source.transcoded false when the two mimeTypes differ, and accepts the same type when transcoded", () => {
    expect(codes(withAsset((a) => (a.source = { mimeType: "image/heic", transcoded: false })))).toEqual(["source-not-transcoded-mismatch"]);
    expect(codes(withAsset((a) => (a.source = { mimeType: "image/jpeg", transcoded: true })))).toEqual([]);
  });
});

describe("validateManifest: semantics", () => {
  it("rejects canvas size that does not match the ratio", () => {
    expect(codes(mutated((m) => (m.canvas.height = 1920)))).toEqual(["canvas-ratio-mismatch"]);
  });

  it("rejects duplicate asset and page ids", () => {
    expect(codes(mutated((m) => (m.assets[1].id = "m001")))).toContain("duplicate-id");
    expect(codes(mutated((m) => (m.pages[1].id = "p001")))).toContain("duplicate-id");
  });

  it("rejects a page that does not start where the previous one ends", () => {
    expect(codes(mutated((m) => (m.pages[2].start = 12)))).toContain("page-timeline");
  });

  it("rejects a total duration that differs from the page sum", () => {
    expect(codes(mutated((m) => (m.duration = 30)))).toEqual(["duration-mismatch"]);
  });

  it("rejects a transition longer than its page", () => {
    expect(codes(mutated((m) => (m.pages[0].transitionIn.duration = 9)))).toEqual(["transition-too-long"]);
  });

  it("rejects slide without direction for transitions and entrances", () => {
    expect(codes(mutated((m) => delete m.pages[1].transitionIn.direction))).toEqual(["missing-direction"]);
    expect(codes(mutated((m) => delete m.pages[3].items[0].enter.direction))).toEqual(["missing-direction"]);
  });

  it("rejects references to unknown assets and wrong asset types", () => {
    expect(codes(mutated((m) => (m.pages[0].items[0].assetId = "nope")))).toEqual(["unknown-reference"]);
    expect(codes(mutated((m) => (m.pages[0].items[0].assetId = "a001")))).toEqual(["wrong-asset-type"]);
    expect(codes(mutated((m) => (m.bgm.assetId = "m001")))).toEqual(["wrong-asset-type"]);
    expect(codes(mutated((m) => (m.bgm.assetId = "nope")))).toEqual(["unknown-reference"]);
  });

  it("rejects a frame that extends beyond the canvas", () => {
    expect(codes(mutated((m) => (m.pages[1].items[1].frame.x = 0.8)))).toContain("frame-out-of-canvas");
  });

  it("rejects overlapping frames on one page", () => {
    expect(codes(mutated((m) => (m.pages[1].items[1].frame.x = 0.3)))).toContain("frames-overlap");
  });

  it("tolerates frames that touch without overlapping", () => {
    const input = mutated((m) => {
      m.pages[1].items[0].frame.w = 0.5;
      m.pages[1].items[1].frame.x = 0.5;
      m.pages[1].items[1].frame.w = 0.5;
    });
    expect(validateManifest(input).ok).toBe(true);
  });
});

describe("validateManifest: path safety (F-PKG-06)", () => {
  it("rejects escaping, absolute and remote paths in assets, originals and cover", () => {
    expect(codes(mutated((m) => (m.assets[0].src = "../evil.jpg")))).toEqual(["path-escapes-root"]);
    expect(codes(mutated((m) => (m.assets[0].src = "media/../../evil.jpg")))).toEqual(["path-escapes-root"]);
    expect(codes(mutated((m) => (m.assets[0].src = "/etc/passwd")))).toEqual(["absolute-path"]);
    expect(codes(mutated((m) => (m.assets[0].src = "C:/Windows/a.jpg")))).toEqual(["remote-reference"]);
    expect(codes(mutated((m) => (m.assets[0].src = "https://example.com/a.jpg")))).toEqual(["remote-reference"]);
    expect(codes(mutated((m) => (m.assets[0].original = "http://example.com/a.heic")))).toEqual(["remote-reference"]);
    expect(codes(mutated((m) => (m.cover = "../cover.jpg")))).toEqual(["path-escapes-root"]);
  });
});

describe("checkPackagePath", () => {
  it.each([
    ["media/m001.jpg", null],
    ["manifest.json", null],
    ["audio/bgm.m4a", null],
    ["", "empty"],
    ["../a", "path-escapes-root"],
    ["a/../b", "path-escapes-root"],
    ["/abs", "absolute-path"],
    ["//host/share", "remote-reference"],
    ["file:///etc/passwd", "remote-reference"],
    ["data:text/plain,x", "remote-reference"],
    ["a\\b", "invalid-character"],
    ["a//b", "invalid-character"],
    ["dir/", "invalid-character"],
    ["a\u0000b", "invalid-character"],
  ])("%j -> %s", (path, expected) => {
    expect(checkPackagePath(path)).toBe(expected);
  });
});

describe("referencedPaths", () => {
  it("lists every path the manifest points to, once (including the legacy original of a 0.1 manifest)", () => {
    const paths = referencedPaths(example01 as unknown as Manifest).sort();
    expect(paths).toEqual(
      [
        "audio/bgm.m4a",
        "cover.jpg",
        "media/m001.jpg",
        "media/m002.jpg",
        "media/m003.jpg",
        "media/m004.mp4",
        "media/m005.jpg",
        "media/m006.jpg",
        "media/m007.jpg",
        "originals/IMG_0001.HEIC",
      ].sort(),
    );
  });
});

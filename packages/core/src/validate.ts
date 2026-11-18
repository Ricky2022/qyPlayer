import AjvModule from "ajv";
import addFormatsModule from "ajv-formats";
import schema from "../../../spec/manifest.schema.json";
import {
  KNOWN_DIRECTIONS,
  KNOWN_ENTER_TYPES,
  KNOWN_TRANSITION_TYPES,
  SUPPORTED_FORMAT_VERSIONS,
  type Manifest,
} from "./manifest";
import { checkPackagePath } from "./paths";

export interface ValidationIssue {
  /** 稳定的问题类别，界面据此显示用户能看懂的说明 */
  code: string;
  /** 出问题的位置，JSON Pointer 风格，例如 /pages/1/items/0/frame */
  path: string;
  /** 面向开发者的英文说明 */
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  /** 不影响播放的问题，例如未知的转场类型（播放时会降级） */
  warnings: ValidationIssue[];
  /** 仅在 ok 为 true 时存在 */
  manifest?: Manifest;
}

/** 时间比较的容差（秒）。生成器输出按毫秒取整。 */
const TIME_EPSILON = 1e-3;
const GEOMETRY_EPSILON = 1e-9;

// Ajv / ajv-formats 是 CommonJS 包，兼容不同打包器对默认导出的处理
const Ajv = ((AjvModule as unknown as { default?: unknown }).default ?? AjvModule) as typeof AjvModule;
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ??
  addFormatsModule) as typeof addFormatsModule;

let compiled: ReturnType<InstanceType<typeof Ajv>["compile"]> | undefined;
function schemaValidator() {
  if (!compiled) {
    // if/then 分支只写 required，属性定义在外层，因此关闭 strictRequired；其余严格检查保留
    const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
    addFormats(ajv);
    compiled = ajv.compile(schema);
  }
  return compiled;
}

function fail(errors: ValidationIssue[]): ValidationResult {
  return { ok: false, errors, warnings: [] };
}

/**
 * 校验清单对象（PRD F-PKG-05）。分三层：版本 → JSON Schema 结构 → 跨字段语义。
 * 结构不通过时不再做语义校验，避免对残缺数据产生误导性的二次报错。
 */
export function validateManifest(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return fail([{ code: "schema", path: "", message: "manifest must be a JSON object" }]);
  }

  const version = (input as { formatVersion?: unknown }).formatVersion;
  if (typeof version === "string" && !SUPPORTED_FORMAT_VERSIONS.includes(version)) {
    return fail([
      {
        code: "unsupported-version",
        path: "/formatVersion",
        message: `format version ${version} is not supported (supported: ${SUPPORTED_FORMAT_VERSIONS.join(", ")})`,
      },
    ]);
  }

  const validate = schemaValidator();
  if (!validate(input)) {
    return fail(
      (validate.errors ?? []).map((e) => ({
        code: "schema",
        path: e.instancePath,
        message: `${e.instancePath || "/"} ${e.message ?? "is invalid"}`,
      })),
    );
  }

  const manifest = input as unknown as Manifest;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  checkSemantics(manifest, errors, warnings);
  return errors.length > 0 ? { ok: false, errors, warnings } : { ok: true, errors, warnings, manifest };
}

function checkSemantics(m: Manifest, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
  const err = (code: string, path: string, message: string) => errors.push({ code, path, message });

  // 画布比例与尺寸一致
  const expectedRatio = m.canvas.aspectRatio === "16:9" ? 16 / 9 : 9 / 16;
  if (Math.abs(m.canvas.width / m.canvas.height - expectedRatio) > 0.01) {
    err("canvas-ratio-mismatch", "/canvas", `${m.canvas.width}x${m.canvas.height} does not match ${m.canvas.aspectRatio}`);
  }

  // 标识唯一
  const assets = new Map<string, Manifest["assets"][number]>();
  m.assets.forEach((a, i) => {
    if (assets.has(a.id)) err("duplicate-id", `/assets/${i}/id`, `duplicate asset id ${a.id}`);
    assets.set(a.id, a);
  });
  const pageIds = new Set<string>();
  m.pages.forEach((p, i) => {
    if (pageIds.has(p.id)) err("duplicate-id", `/pages/${i}/id`, `duplicate page id ${p.id}`);
    pageIds.add(p.id);
  });

  // 素材类型信息（仅 0.2 起；必需字段由 schema 保证存在）
  if (m.formatVersion === "0.2") {
    m.assets.forEach((a, i) => {
      for (const [key, value] of [
        ["mimeType", a.mimeType],
        ["source/mimeType", a.source?.mimeType],
      ] as const) {
        if (value !== undefined && !value.startsWith(`${a.type}/`)) {
          err("mime-type-mismatch", `/assets/${i}/${key}`, `${key} "${value}" does not match asset type ${a.type}`);
        }
      }
      if (a.source && !a.source.transcoded && a.source.mimeType !== a.mimeType) {
        err("source-not-transcoded-mismatch", `/assets/${i}/source`, "source is not transcoded but its mimeType differs from the asset mimeType");
      }
    });
  }

  // 路径安全（PRD 7.3）
  m.assets.forEach((a, i) => {
    for (const key of ["src", "original"] as const) {
      const value = a[key];
      if (value === undefined) continue;
      const problem = checkPackagePath(value);
      if (problem) err(problem, `/assets/${i}/${key}`, `unsafe path "${value}": ${problem}`);
    }
  });
  if (m.cover !== undefined) {
    const problem = checkPackagePath(m.cover);
    if (problem) err(problem, "/cover", `unsafe path "${m.cover}": ${problem}`);
  }

  // 背景音乐引用
  if (m.bgm) {
    const a = assets.get(m.bgm.assetId);
    if (!a) err("unknown-reference", "/bgm/assetId", `bgm refers to unknown asset ${m.bgm.assetId}`);
    else if (a.type !== "audio") err("wrong-asset-type", "/bgm/assetId", `bgm asset ${a.id} is ${a.type}, expected audio`);
  }

  // 页：时间连续、转场、素材引用、格子
  let expectedStart = 0;
  m.pages.forEach((page, pi) => {
    const at = `/pages/${pi}`;
    if (Math.abs(page.start - expectedStart) > TIME_EPSILON) {
      err("page-timeline", `${at}/start`, `page ${page.id} starts at ${page.start}, expected ${expectedStart}`);
    }
    expectedStart = page.start + page.duration;

    const tr = page.transitionIn;
    if (tr) {
      if (tr.duration > page.duration + TIME_EPSILON) {
        err("transition-too-long", `${at}/transitionIn/duration`, `transition ${tr.duration}s exceeds page duration ${page.duration}s`);
      }
      checkAnimation("transitionIn", tr.type, tr.direction, KNOWN_TRANSITION_TYPES, `${at}/transitionIn`);
    }

    page.items.forEach((item, ii) => {
      const ip = `${at}/items/${ii}`;
      const a = assets.get(item.assetId);
      if (!a) err("unknown-reference", `${ip}/assetId`, `item refers to unknown asset ${item.assetId}`);
      else if (a.type === "audio") err("wrong-asset-type", `${ip}/assetId`, `item asset ${a.id} is audio, expected image or video`);

      const f = item.frame;
      if (f.x + f.w > 1 + GEOMETRY_EPSILON || f.y + f.h > 1 + GEOMETRY_EPSILON) {
        err("frame-out-of-canvas", `${ip}/frame`, "frame extends beyond the canvas");
      }
      if (item.enter) checkAnimation("enter", item.enter.type, item.enter.direction, KNOWN_ENTER_TYPES, `${ip}/enter`);
    });

    for (let i = 0; i < page.items.length; i++) {
      for (let j = i + 1; j < page.items.length; j++) {
        const a = page.items[i]!.frame;
        const b = page.items[j]!.frame;
        const overlap =
          a.x < b.x + b.w - GEOMETRY_EPSILON &&
          b.x < a.x + a.w - GEOMETRY_EPSILON &&
          a.y < b.y + b.h - GEOMETRY_EPSILON &&
          b.y < a.y + a.h - GEOMETRY_EPSILON;
        if (overlap) err("frames-overlap", `${at}/items`, `items ${i} and ${j} overlap`);
      }
    }
  });

  if (Math.abs(m.duration - expectedStart) > TIME_EPSILON) {
    err("duration-mismatch", "/duration", `duration ${m.duration} does not equal the sum of page durations ${expectedStart}`);
  }

  function checkAnimation(
    kind: "transitionIn" | "enter",
    type: string,
    direction: string | undefined,
    known: readonly string[],
    path: string,
  ): void {
    const code = kind === "transitionIn" ? "unknown-transition-type" : "unknown-enter-type";
    if (!known.includes(type)) {
      warnings.push({ code, path: `${path}/type`, message: `unknown ${kind} type "${type}" will be degraded by players` });
    }
    if (type === "slide") {
      if (direction === undefined) err("missing-direction", `${path}/direction`, `${kind} "slide" requires a direction`);
      else if (!(KNOWN_DIRECTIONS as readonly string[]).includes(direction)) {
        warnings.push({ code: "unknown-direction", path: `${path}/direction`, message: `unknown direction "${direction}"` });
      }
    }
  }
}

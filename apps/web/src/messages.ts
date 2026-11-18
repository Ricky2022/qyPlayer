import { QypError } from "@qyplayer/qyp";
import type { Translate } from "./i18n";

const MAX_LISTED = 3;

/** 把打开包时的错误翻译成用户能看懂的说明（PRD F-PKG-05：不崩溃、给出明确原因） */
export function describeError(error: unknown, t: Translate): string {
  if (!(error instanceof QypError)) return t("openFailed", { detail: error instanceof Error ? error.message : String(error) });
  switch (error.code) {
    case "not-a-zip":
      return t("qypNotAZip");
    case "unsafe-entry":
      return t("qypUnsafeEntry");
    case "too-large":
      return t("qypTooLarge");
    case "missing-manifest":
      return t("qypMissingManifest");
    case "invalid-json":
      return t("qypInvalidJson");
    case "unsupported-version":
      return t("qypUnsupportedVersion");
    case "remote-reference":
      return t("qypRemoteReference");
    case "unsafe-path":
      return t("qypUnsafePath");
    case "invalid-manifest": {
      // 校验问题的描述来自库，是英文；路径本身对用户也有参考价值
      const detail = error.issues.slice(0, MAX_LISTED).map((i) => `${i.path || "/"}: ${i.message}`);
      return t("qypInvalidManifest", { detail: detail.join("\n") });
    }
    case "missing-file": {
      const listed = error.missing.slice(0, MAX_LISTED).join(t("listSeparator"));
      const more = error.missing.length > MAX_LISTED ? t("qypMissingFileMore", { count: error.missing.length }) : "";
      return t("qypMissingFile", { listed, more });
    }
  }
}

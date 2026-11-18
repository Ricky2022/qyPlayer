import { QypError } from "@qyplayer/qyp";

const MAX_LISTED = 3;

/** 把打开包时的错误翻译成用户能看懂的说明（PRD F-PKG-05：不崩溃、给出明确原因） */
export function describeError(error: unknown): string {
  if (!(error instanceof QypError)) return `打开失败：${error instanceof Error ? error.message : String(error)}`;
  switch (error.code) {
    case "not-a-zip":
      return "这不是有效的 .qyp 文件：无法按压缩包读取。文件可能已损坏，或选错了文件。";
    case "unsafe-entry":
      return "该文件包含不安全的内部路径（例如指向包外的路径），为保护你的电脑已拒绝打开。";
    case "too-large":
      return "该文件解压后体积超过上限，已拒绝打开。";
    case "missing-manifest":
      return "该压缩包里没有 manifest.json，不是 qyPlayer 影片。";
    case "invalid-json":
      return "manifest.json 不是合法的 JSON，文件可能已损坏。";
    case "unsupported-version":
      return "该文件由更新版本的 qyPlayer 制作，当前版本无法播放。请升级 qyPlayer。";
    case "remote-reference":
      return "该文件引用了网络地址，qyPlayer 只播放包内素材，已拒绝打开。";
    case "unsafe-path":
      return "清单中含有指向包外的素材路径，为保护你的电脑已拒绝打开。";
    case "invalid-manifest": {
      const detail = error.issues.slice(0, MAX_LISTED).map((i) => `${i.path || "/"}：${i.message}`);
      return `影片清单不合规：\n${detail.join("\n")}`;
    }
    case "missing-file": {
      const listed = error.missing.slice(0, MAX_LISTED).join("、");
      const more = error.missing.length > MAX_LISTED ? ` 等 ${error.missing.length} 个` : "";
      return `压缩包缺少清单引用的文件：${listed}${more}。`;
    }
  }
}

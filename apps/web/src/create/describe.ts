// 把制作页里的各种错误翻译成当前语言（库和导入代码只给错误码，不带界面语言）。
import { GENERATOR_LIMITS, GenerateError } from "@qyplayer/core";
import { QypError } from "@qyplayer/qyp";
import { MediaFormatError, type MediaFormatErrorCode } from "@qyplayer/qyp/inspect";
import type { MessageKey, Translate } from "../i18n";
import { describeError } from "../messages";
import { ImportError, type ImportErrorCode } from "./importers";

const IMPORT_MESSAGES: Record<ImportErrorCode, MessageKey> = {
  decode: "importDecode",
  canvas: "importCanvas",
  "audio-in-media": "importAudioInMedia",
  "need-audio": "importNeedAudio",
  "too-many": "importTooMany",
  "too-large": "importTooLarge",
  "video-format": "importVideoFormat",
  "audio-format": "importAudioFormat",
  unsupported: "importUnsupported",
  "music-not-picked": "makerPickMusicFirst",
  "builtin-network": "builtinMusicNetwork",
  "builtin-http": "builtinMusicHttp",
};

const MEDIA_FORMAT_MESSAGES: Record<MediaFormatErrorCode, MessageKey> = {
  unreadable: "mediaUnreadable",
  "no-duration": "mediaNoDuration",
  "no-video-track": "mediaNoVideoTrack",
  "video-codec": "mediaVideoCodec",
  "video-audio-codec": "mediaVideoAudioCodec",
  "audio-codec": "mediaAudioCodec",
};

function describeImportError(error: ImportError, t: Translate): string {
  return t(IMPORT_MESSAGES[error.code], { max: GENERATOR_LIMITS.maxMedia, ...error.params });
}

/** 一个文件导入失败的说明，开头带文件名 */
export function describeFileError(fileName: string, error: unknown, t: Translate): string {
  // MediaFormatError 的说明里已经有文件名
  if (error instanceof MediaFormatError) {
    return t(MEDIA_FORMAT_MESSAGES[error.code], { name: error.params.name, codec: error.params.codec ?? t("unknown") });
  }
  const reason = error instanceof ImportError ? describeImportError(error, t) : error instanceof Error ? error.message : String(error);
  return t("fileError", { name: fileName, reason });
}

/** 生成影片失败的说明 */
export function describeBuildError(error: unknown, t: Translate): string {
  if (error instanceof GenerateError) {
    switch (error.code) {
      case "no-media":
        return t("makerNoMedia");
      case "too-many-media":
        return t("makerTooManyMedia", { max: GENERATOR_LIMITS.maxMedia });
      default:
        return t("makerBuildFailed", { detail: error.message });
    }
  }
  if (error instanceof QypError) return describeError(error, t);
  if (error instanceof ImportError) return describeImportError(error, t);
  return t("makerBuildFailed", { detail: error instanceof Error ? error.message : String(error) });
}

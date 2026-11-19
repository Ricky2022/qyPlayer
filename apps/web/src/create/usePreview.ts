import { useEffect, useRef, useState } from "react";
import type { Manifest } from "@qyplayer/core";
import { PlaybackController } from "../player/PlaybackController";
import { resolveMusic } from "./editor/music";
import { createPreviewPackage, type MemoryPackage } from "./editor/preview";
import type { EditorDoc } from "./editor/state";
import { renderTitleCard } from "./titleCard";

/** 最后一次触发后等多久才重新生成（3A.10） */
export const PREVIEW_DEBOUNCE_MS = 300;

export interface PreviewResult {
  controller: PlaybackController;
  manifest: Manifest;
  /** 标题留空时生成器给出的默认标题 */
  defaultTitle: string;
  /** 内存包：改标题时替换其中的标题图片 */
  opened: MemoryPackage;
  /** 标题图片的重画状态 */
  card: { busy: boolean; stale: boolean };
}

/** 按清单里当前的标题和副标题重画标题图片，换进内存包并让播放器重新读入。画图期间又有新的修改，画完后再画一次 */
async function redrawTitleCard(result: PreviewResult): Promise<void> {
  const { manifest, card } = result;
  const titleCard = manifest.titleCard;
  const asset = titleCard && manifest.assets.find((a) => a.id === titleCard.assetId);
  if (!asset) return;
  if (card.busy) {
    card.stale = true;
    return;
  }
  card.busy = true;
  try {
    do {
      card.stale = false;
      const { width, height } = manifest.canvas;
      const image = await renderTitleCard({ title: manifest.title, subtitle: manifest.subtitle ?? "", width, height });
      result.opened.setFile(asset.src, image);
      result.controller.refreshAsset(asset.id);
    } while (card.stale);
  } catch {
    // 重画失败就保留旧图片，不打断预览
  } finally {
    card.busy = false;
  }
}

/** 把标题和副标题写进预览的清单（空标题用默认标题），有标题图片时重画。文字确实变了返回 true */
function applyText(result: PreviewResult, title: string, subtitle: string): boolean {
  const nextTitle = title.trim() || result.defaultTitle;
  const nextSubtitle = subtitle.trim();
  const { manifest } = result;
  if (manifest.title === nextTitle && (manifest.subtitle ?? "") === nextSubtitle) return false;
  manifest.title = nextTitle;
  if (nextSubtitle) manifest.subtitle = nextSubtitle;
  else delete manifest.subtitle;
  if (manifest.titleCard) void redrawTitleCard(result);
  return true;
}

export interface PreviewState {
  result: PreviewResult | null;
  updating: boolean;
  /** 最近一次生成的错误；下一次成功后清除 */
  error: unknown;
  /** 改标题或副标题时直接更新当前预览里的文字（有标题图片则重画图片），不重新生成；文字确实变了返回 true */
  applyTitle(title: string, subtitle: string): boolean;
}

/**
 * 编辑内容变化后自动重新生成预览（3A.10）。素材、比例、模板、转场、滤镜、时长、配乐、种子、是否显示标题、单页编排变化时触发，标题和副标题变化不触发。
 * 去抖 300 毫秒；生成中又有新变化，则丢弃当前这次，按最新内容再来。
 */
export function usePreview(doc: EditorDoc, defaultTitleWord: string): PreviewState {
  const { media, aspect, templateId, transition, look, length, music, seed, showTitle, pages } = doc;
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const resultRef = useRef(result);
  resultRef.current = result;
  const titleRef = useRef(doc.title);
  titleRef.current = doc.title;
  const subtitleRef = useRef(doc.subtitle);
  subtitleRef.current = doc.subtitle;

  const applyTitle = (title: string, subtitle: string): boolean => {
    const current = resultRef.current;
    return current ? applyText(current, title, subtitle) : false;
  };

  useEffect(() => {
    if (media.length === 0) {
      setResult((previous) => {
        previous?.controller.dispose();
        return null;
      });
      setError(null);
      setUpdating(false);
      return;
    }
    let cancelled = false;
    setUpdating(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const musicEntry = await resolveMusic(music);
          if (cancelled) return;
          // 始终用默认标题、空副标题生成，再按当前文字改写，这样改标题不必重新生成
          const { opened, manifest } = await createPreviewPackage(
            { media, aspect, templateId, transition, look, length, music, seed, pages, title: "", subtitle: "", showTitle },
            { ...(musicEntry && { music: musicEntry }), defaultTitleWord },
          );
          const controller = await PlaybackController.create(opened);
          if (cancelled) {
            controller.dispose();
            return;
          }
          const next: PreviewResult = { controller, manifest, defaultTitle: manifest.title, opened, card: { busy: false, stale: false } };
          applyText(next, titleRef.current, subtitleRef.current);
          setResult((previous) => {
            previous?.controller.dispose();
            return next;
          });
          setError(null);
        } catch (caught) {
          if (!cancelled) setError(caught);
        } finally {
          if (!cancelled) setUpdating(false);
        }
      })();
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [media, aspect, templateId, transition, look, length, music, seed, showTitle, pages, defaultTitleWord]);

  // 离开页面时释放播放器
  useEffect(
    () => () => {
      resultRef.current?.controller.dispose();
    },
    [],
  );

  return { result, updating, error, applyTitle };
}

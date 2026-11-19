import { useEffect, useRef, useState } from "react";
import type { Manifest } from "@qyplayer/core";
import { PlaybackController } from "../player/PlaybackController";
import { resolveMusic } from "./editor/music";
import { createPreviewPackage } from "./editor/preview";
import type { EditorDoc } from "./editor/state";

/** 最后一次触发后等多久才重新生成（3A.10） */
export const PREVIEW_DEBOUNCE_MS = 300;

export interface PreviewResult {
  controller: PlaybackController;
  manifest: Manifest;
  /** 标题留空时生成器给出的默认标题 */
  defaultTitle: string;
}

export interface PreviewState {
  result: PreviewResult | null;
  updating: boolean;
  /** 最近一次生成的错误；下一次成功后清除 */
  error: unknown;
  /** 改标题时直接更新当前预览里的标题，不重新生成；标题确实变了返回 true */
  applyTitle(title: string): boolean;
}

/**
 * 编辑内容变化后自动重新生成预览（3A.10）。素材、比例、模板、转场、配乐、种子变化时触发，标题变化不触发。
 * 去抖 300 毫秒；生成中又有新变化，则丢弃当前这次，按最新内容再来。
 */
export function usePreview(doc: EditorDoc, defaultTitleWord: string): PreviewState {
  const { media, aspect, templateId, transition, music, seed } = doc;
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const resultRef = useRef(result);
  resultRef.current = result;
  const titleRef = useRef(doc.title);
  titleRef.current = doc.title;

  const applyTitle = (title: string): boolean => {
    const current = resultRef.current;
    if (!current) return false;
    const next = title.trim() || current.defaultTitle;
    if (current.manifest.title === next) return false;
    current.manifest.title = next;
    return true;
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
          // 始终用默认标题生成，再按当前标题改写，这样改标题不必重新生成
          const { opened, manifest } = createPreviewPackage(
            { media, aspect, templateId, transition, music, seed, title: "" },
            { ...(musicEntry && { music: musicEntry }), defaultTitleWord },
          );
          const controller = await PlaybackController.create(opened);
          if (cancelled) {
            controller.dispose();
            return;
          }
          const next: PreviewResult = { controller, manifest, defaultTitle: manifest.title };
          manifest.title = titleRef.current.trim() || next.defaultTitle;
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
  }, [media, aspect, templateId, transition, music, seed, defaultTitleWord]);

  // 离开页面时释放播放器
  useEffect(
    () => () => {
      resultRef.current?.controller.dispose();
    },
    [],
  );

  return { result, updating, error, applyTitle };
}

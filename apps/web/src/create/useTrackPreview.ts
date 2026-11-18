import { useCallback, useEffect, useRef, useState } from "react";
import type { BuiltinTrack } from "./builtinMusicInfo";

export interface TrackPreview {
  /** 正在试听的曲目编号 */
  playing: string | null;
  /** 没在试听这首就开始（同时停掉别的），正在试听就停止 */
  toggle(track: BuiltinTrack): void;
}

/** 内置曲目的试听（F-BGM-01）：同一时间只播一首；播完、出错、离开设置面板时自动停止 */
export function useTrackPreview(): TrackPreview {
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback((): void => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
  }, []);

  useEffect(() => stop, [stop]);

  const toggle = useCallback(
    (track: BuiltinTrack): void => {
      const wasPlaying = audioRef.current !== null && playing === track.id;
      stop();
      if (wasPlaying) return;
      const audio = new Audio(new URL(track.path, document.baseURI).href);
      const finish = (): void => {
        if (audioRef.current !== audio) return;
        audioRef.current = null;
        setPlaying(null);
      };
      audio.addEventListener("ended", finish);
      audio.addEventListener("error", finish);
      audioRef.current = audio;
      setPlaying(track.id);
      void audio.play().catch(finish);
    },
    [playing, stop],
  );

  return { playing, toggle };
}

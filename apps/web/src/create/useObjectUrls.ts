import {useEffect, useRef} from "react";
import type {EditorMedia, EditorState} from "./editor/state";
import {referencedBlobs} from "./editor/state";

/**
 * 素材缩略图用的 object URL，按文件对象缓存（编号会在新建、打开时重新计数，不能当键）：
 * 第一次用到时创建；文件不再被当前内容和撤销栈引用时释放，离开页面时全部释放。
 */
export const useObjectUrls = function useObjectUrls(state: EditorState): (media: EditorMedia) => string {
    const urls = useRef(new Map<Blob, string>());

    useEffect(() => {
        const keep = referencedBlobs(state);
        for (const [blob, url] of urls.current) {
            if (!keep.has(blob)) {
                URL.revokeObjectURL(url);
                urls.current.delete(blob);
            }
        }
    }, [state]);

    useEffect(() => {
        const map = urls.current;
        return () => {
            for (const url of map.values()) {
                URL.revokeObjectURL(url);
            }
            map.clear();
        };
    }, []);

    return (media) => {
        let url = urls.current.get(media.blob);
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!url) {
            url = URL.createObjectURL(media.blob);
            urls.current.set(media.blob, url);
        }
        return url;
    };
};

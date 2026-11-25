import {useEffect, useState} from "react";
import {
    detectCapabilities,
    detectEnvironment,
    isMobileEnvironment,
    loadStoredTranscode,
    resolveTranscode,
    saveStoredTranscode,
    transcodeNote,
    type TranscodeCapabilities,
    type TranscodeNote,
} from "./environment";

export interface TranscodeSetting {
    /** 手机浏览器（按用户代理判断，与窗口宽度无关） */
    mobile: boolean;
    capabilities: TranscodeCapabilities;
    /** 当前生效的开关值；不能编码视频时恒为假 */
    transcode: boolean;
    /** 开关下方的说明 */
    note: TranscodeNote;
    setTranscode: (on: boolean) => void;
}

const mobile = isMobileEnvironment(detectEnvironment());

/** 转码开关（5.2）：默认值随环境，用户的选择保存在 localStorage，不进撤销栈 */
export const useTranscode = function useTranscode(): TranscodeSetting {
    const [capabilities, setCapabilities] = useState<TranscodeCapabilities>({videoEncode: false, audioEncode: false});
    const [stored, setStored] = useState<string | null>(() => loadStoredTranscode());

    useEffect(() => {
        let active = true;
        void detectCapabilities().then((found) => active && setCapabilities(found));
        return () => {
            active = false;
        };
    }, []);

    return {
        mobile,
        capabilities,
        transcode: resolveTranscode({mobile, videoEncode: capabilities.videoEncode, stored}),
        note: transcodeNote({mobile, videoEncode: capabilities.videoEncode}),
        setTranscode: (on) => {
            saveStoredTranscode(on);
            setStored(on ? "on" : "off");
        },
    };
};

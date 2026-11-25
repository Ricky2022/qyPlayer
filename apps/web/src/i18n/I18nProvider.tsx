import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from "react";
import {setWindowTitle} from "../desktop";
import {LANG_STORAGE_KEY, createTranslate, detectLang, type Lang, type Translate} from "./core";

interface I18nValue {
    lang: Lang;
    t: Translate;
    /** 切换语言并记住选择 */
    setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

const readSavedLang = function readSavedLang(): string | null {
    try {
        return localStorage.getItem(LANG_STORAGE_KEY);
    } catch {
        return null; // 隐私模式等场景下读不到，就按系统语言
    }
};

interface I18nProviderProps {
    /** 当前语言下的页面标题（网页标签页和桌面窗口标题） */
    title: (t: Translate) => string;
    children: ReactNode;
}

export const I18nProvider = function I18nProvider({title, children}: I18nProviderProps) {
    const [lang, setLangState] = useState<Lang>(() => detectLang(readSavedLang(), navigator.languages));
    const t = useMemo(() => createTranslate(lang), [lang]);

    const setLang = useCallback((next: Lang) => {
        setLangState(next);
        try {
            localStorage.setItem(LANG_STORAGE_KEY, next);
        } catch {
            // 记不住也不影响本次使用
        }
    }, []);

    const pageTitle = title(t);
    useEffect(() => {
        document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
        document.title = pageTitle;
        void setWindowTitle(pageTitle).catch(() => undefined);
    }, [lang, pageTitle]);

    const value = useMemo(() => ({lang, t, setLang}), [lang, t, setLang]);
    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = function useI18n(): I18nValue {
    const value = useContext(I18nContext);
    if (!value) {
        throw new Error("useI18n must be used inside <I18nProvider>");
    }
    return value;
};

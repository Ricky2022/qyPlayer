import {useCallback, useEffect, useRef, useState} from "react";

const DEFAULT_DELAY_MS = 3000;

/**
 * 控制条的自动隐藏：enabled 为 true（正在播放）时，鼠标静止一段时间后 visible 变为 false；
 * 暂停等情况下始终可见。pointer 在控制条上时（hold）不隐藏。
 */
export const useAutoHide = function useAutoHide(enabled: boolean, delay = DEFAULT_DELAY_MS) {
    const [hidden, setHidden] = useState(false);
    const timer = useRef(0);
    const held = useRef(false);

    const poke = useCallback(() => {
        setHidden(false);
        window.clearTimeout(timer.current);
        if (!enabled) {
            return;
        }
        timer.current = window.setTimeout(() => {
            if (!held.current) {
                setHidden(true);
            }
        }, delay);
    }, [enabled, delay]);

    const hold = useCallback(
        (value: boolean) => {
            held.current = value;
            if (!value) {
                poke();
            }
        },
        [poke],
    );

    // enabled 变化时重新计时；卸载时清掉定时器
    useEffect(() => {
        poke();
        return () => window.clearTimeout(timer.current);
    }, [poke]);

    return {visible: !hidden || !enabled, poke, hold};
};

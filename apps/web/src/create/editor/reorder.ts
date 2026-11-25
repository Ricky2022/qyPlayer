// 拖动排序：把“插入到第几个缝隙”换算成 moveMedia 要的目标位置。

/**
 * from 是被拖动项的下标，insertAt 是落点缝隙（0 表示最前，n 表示最后）。
 * 返回移动后它所在的下标；落在自己前后的缝隙（位置不变）时返回 null。
 */
export const dropMoveTarget = function dropMoveTarget(from: number, insertAt: number): number | null {
    if (insertAt === from || insertAt === from + 1) {
        return null;
    }
    return insertAt > from ? insertAt - 1 : insertAt;
};

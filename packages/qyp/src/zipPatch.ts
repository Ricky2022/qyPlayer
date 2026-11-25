// 直接改写 ZIP 里的大小字段，用来构造“声明与实际不符”的包（测试和一致性测试包使用）。
// 只处理本包写出的普通 ZIP：没有分卷、没有 ZIP64、没有压缩的目录。

const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;

export interface SizePatch {
    compressedSize?: number;
    uncompressedSize?: number;
}

export interface EntryPatch {
    /** 改中央目录里的记录 */
    directory?: SizePatch;
    /** 改本地文件头；flags 是通用标志位（第 3 位为 1 表示大小写在数据后面的数据描述符里） */
    local?: SizePatch & {flags?: number};
}

/** 就地修改 `zip` 中名为 `name` 的条目。找不到时抛错，避免测试悄悄什么都没改。 */
export const patchEntry = function patchEntry(zip: Uint8Array, name: string, patch: EntryPatch): void {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    let end = zip.length - 22;
    while (end >= 0 && view.getUint32(end, true) !== END_SIGNATURE) {
        end--;
    }
    if (end < 0) {
        throw new Error("end of central directory not found");
    }

    const count = view.getUint16(end + 10, true);
    let at = view.getUint32(end + 16, true);
    for (let i = 0; i < count; i++) {
        if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) {
            throw new Error("bad central directory");
        }
        const nameLength = view.getUint16(at + 28, true);
        const extraLength = view.getUint16(at + 30, true);
        const commentLength = view.getUint16(at + 32, true);
        const entryName = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
        if (entryName === name) {
            if (patch.directory?.compressedSize !== undefined) {
                view.setUint32(at + 20, patch.directory.compressedSize, true);
            }
            if (patch.directory?.uncompressedSize !== undefined) {
                view.setUint32(at + 24, patch.directory.uncompressedSize, true);
            }
            const local = view.getUint32(at + 42, true);
            if (patch.local?.flags !== undefined) {
                view.setUint16(local + 6, patch.local.flags, true);
            }
            if (patch.local?.compressedSize !== undefined) {
                view.setUint32(local + 18, patch.local.compressedSize, true);
            }
            if (patch.local?.uncompressedSize !== undefined) {
                view.setUint32(local + 22, patch.local.uncompressedSize, true);
            }
            return;
        }
        at += 46 + nameLength + extraLength + commentLength;
    }
    throw new Error(`entry not found: ${name}`);
};

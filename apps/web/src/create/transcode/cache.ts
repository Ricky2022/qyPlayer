import type {TranscodedAsset} from "./patch";

/**
 * 转码结果的内存缓存：按“素材文件 + 参数”存放（5.5）。
 * 用 WeakMap 以文件对象为键，素材被删除且不在撤销栈里（文件对象不再被引用）时，对应缓存随之释放。
 */
export class TranscodeCache {
    private store = new WeakMap<Blob, Map<string, TranscodedAsset>>();

    get(blob: Blob, key: string): TranscodedAsset | undefined {
        return this.store.get(blob)?.get(key);
    }

    set(blob: Blob, key: string, value: TranscodedAsset): void {
        const entries = this.store.get(blob) ?? new Map<string, TranscodedAsset>();
        entries.set(key, value);
        this.store.set(blob, entries);
    }

    /** 转码开关关闭时丢弃全部缓存 */
    clear(): void {
        this.store = new WeakMap();
    }
}

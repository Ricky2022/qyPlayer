// libheif-js 自带的类型只描述底层的 WebAssembly 接口，没有它的 HeifDecoder；这里只声明用到的部分。
declare module "libheif-js/libheif-wasm/libheif.js" {
    interface HeifImage {
        get_width: () => number;
        get_height: () => number;
        /** 把解码结果写进 target.data（RGBA），完成后调用 callback；失败时 callback 收到 null */
        display: (target: {
            data: Uint8ClampedArray;
            width: number;
            height: number;
        }, callback: (result: unknown) => void) => void;
    }

    interface Libheif {
        HeifDecoder: new () => {decode: (data: Uint8Array) => HeifImage[]};
    }

    const createLibheif: (options: {
        wasmBinary: ArrayBuffer;
        onRuntimeInitialized: () => void;
    }) => Libheif;
    export default createLibheif;
}

import {describe, expect, it} from "vitest";
import {GenerateError, type Manifest} from "@qyplayer/core";
import {openPackage, writePackage} from "@qyplayer/qyp";
import {planPackage, planPagesFor, type MediaEntry, type MusicEntry} from "../buildPackage";
import {BUILTIN_MUSIC_LICENSE, BUILTIN_TRACKS} from "../builtinMusicInfo";
import {createPreviewPackage, memoryPackage} from "./preview";
import {RestoreError, assetsInFirstAppearanceOrder, restorePackage, type RestoreOptions} from "./restore";
import {currentDoc, createEditor, loadEditor, type EditorMediaInput} from "./state";

const original = (mimeType: string) => ({mimeType, source: {mimeType, transcoded: false}});
const photo = (name: string, capturedAt?: string): MediaEntry => ({
    fileName: name,
    type: "image",
    ...original("image/jpeg"),
    blob: new Blob([name]),
    width: 1600,
    height: 1067,
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    ...capturedAt && {capturedAt},
});
const video: MediaEntry = {fileName: "clip.mp4", type: "video", ...original("video/mp4"), blob: new Blob(["video"]), width: 1920, height: 1080, duration: 12, hasAudio: true};
const song: MusicEntry = {blob: new Blob(["song"]), mimeType: "audio/mpeg", duration: 30, title: "My song"};

const options: RestoreOptions = {
    serialName: (type, index) => `${type === "image" ? "照片" : "视频"} ${index}`,
    fallbackSeed: 4242,
};

/** 把清单改成 0.1：没有 mimeType 和 source */
const toV01 = (m: Manifest): void => {
    m.formatVersion = "0.1";
    for (const asset of m.assets) {
        delete asset.mimeType;
        delete asset.source;
    }
};

/** 生成一个包（现在的生成器写 0.2）并在内存里打开 */
// eslint-disable-next-line @stylistic/max-len
const makeMemoryPackage = function makeMemoryPackage(over: Partial<Parameters<typeof planPackage>[0]> = {}, edit?: (manifest: Manifest) => void) {
    const {manifest, files} = planPackage({
        media: [photo("a.jpg", "2026-03-01T00:00:00Z"), video, photo("b.jpg", "2026-03-02T00:00:00Z")],
        templateId: "lively",
        seed: 11,
        ...over,
    });
    edit?.(manifest);
    return memoryPackage(manifest, files);
};

describe("还原：素材", () => {
    it("按页内首次出现的顺序排列，同一素材只算一次，没被引用的忽略", () => {
        const opened = makeMemoryPackage({}, (m) => {
            m.assets.push({id: "unused", type: "image", src: "media/unused.jpg", width: 10, height: 10});
            m.pages = [
                {id: "p1", start: 0, duration: 3, items: [{assetId: "m003", frame: {x: 0, y: 0, w: 1, h: 1}}, {assetId: "m001", frame: {x: 0, y: 0, w: 1, h: 1}}]},
                {id: "p2", start: 3, duration: 3, items: [{assetId: "m003", frame: {x: 0, y: 0, w: 1, h: 1}}, {assetId: "m002", frame: {x: 0, y: 0, w: 1, h: 1}}]},
            ];
        });
        expect(assetsInFirstAppearanceOrder(opened.manifest).map((a) => a.id)).toEqual(["m003", "m001", "m002"]);
    });

    it("用序号命名，照片和视频分别编号，不带包内文件名", async () => {
        const restored = await restorePackage(makeMemoryPackage(), options);
        expect(restored.content.media.map((m) => m.fileName)).toEqual(["照片 1", "视频 1", "照片 2"]);
    });

    it("沿用尺寸、时长、是否有音轨和拍摄时间", async () => {
        const {content} = await restorePackage(makeMemoryPackage(), options);
        expect(content.media[0]).toMatchObject({type: "image", width: 1600, height: 1067, capturedAt: "2026-03-01T00:00:00Z"});
        expect(content.media[1]).toMatchObject({type: "video", width: 1920, height: 1080, duration: 12, hasAudio: true});
        expect(await content.media[1]!.blob.text()).toBe("video");
    });

    it("0.1 的包：mimeType 由扩展名推断，source 为未转码，视为最终文件", async () => {
        const {content} = await restorePackage(makeMemoryPackage({}, toV01), options);
        expect(content.media[0]).toMatchObject({mimeType: "image/jpeg", source: {mimeType: "image/jpeg", transcoded: false}, final: true});
        expect(content.media[1]).toMatchObject({mimeType: "video/mp4", final: true});
    });

    it("0.2 的包：mimeType 和 source 原样带入；已转码的是最终文件，未转码的不是", async () => {
        const opened = makeMemoryPackage({}, (m) => {
            m.formatVersion = "0.2";
            m.assets[0]!.mimeType = "image/jpeg";
            m.assets[0]!.source = {mimeType: "image/heic", transcoded: true};
            m.assets[1]!.mimeType = "video/mp4; codecs=\"avc1.640028, mp4a.40.2\"";
            m.assets[1]!.source = {mimeType: "video/mp4; codecs=\"avc1.640028, mp4a.40.2\"", transcoded: false};
        });
        const {content} = await restorePackage(opened, options);
        expect(content.media[0]).toMatchObject({mimeType: "image/jpeg", source: {mimeType: "image/heic", transcoded: true}, final: true});
        expect(content.media[1]).toMatchObject({mimeType: "video/mp4; codecs=\"avc1.640028, mp4a.40.2\"", source: {transcoded: false}, final: false});
    });

    it("手机的总大小上限：刚好等于上限可以，多 1 字节拒绝", async () => {
        const total = "a.jpg".length + "video".length + "b.jpg".length;
        await expect(restorePackage(makeMemoryPackage(), {...options, maxTotalBytes: total})).resolves.toBeDefined();
        await expect(restorePackage(makeMemoryPackage(), {...options, maxTotalBytes: total - 1})).rejects.toThrow(RestoreError);
    });
});

describe("还原：设置", () => {
    it("标题、比例、模板、种子取自清单", async () => {
        const opened = makeMemoryPackage({title: "春游", aspectRatio: "9:16", templateId: "classic", seed: 77});
        const {content, layoutMayDiffer} = await restorePackage(opened, options);
        expect(content).toMatchObject({title: "春游", aspect: "9:16", templateId: "classic", seed: 77});
        expect(layoutMayDiffer).toBe(false);
    });

    it("转场取自 generator.transition；没有或不认识时是“跟随模板”", async () => {
        const forced = makeMemoryPackage({transition: "rotate"});
        expect((await restorePackage(forced, options)).content.transition).toBe("rotate");
        expect((await restorePackage(makeMemoryPackage(), options)).content.transition).toBe("auto");
        const unknown = makeMemoryPackage({}, (m) => {
            m.generator!.transition = "cube";
        });
        expect((await restorePackage(unknown, options)).content.transition).toBe("auto");
    });

    it("副标题和“显示标题”取自清单；标题图片不会被当成用户素材", async () => {
        const {manifest, files} = planPackage({
            media: [photo("a.jpg", "2026-03-01T00:00:00Z")],
            templateId: "clean",
            seed: 1,
            subtitle: "三月",
            titleImage: new Blob(["png"]),
        });
        const restored = await restorePackage(memoryPackage(manifest, files), options);
        expect(restored.content).toMatchObject({subtitle: "三月", showTitle: true});
        expect(restored.content.media).toHaveLength(1);
        const plain = await restorePackage(makeMemoryPackage(), options);
        expect(plain.content).toMatchObject({subtitle: "", showTitle: false});
    });

    it("滤镜取自清单 look；没有或不认识时是原片", async () => {
        expect((await restorePackage(makeMemoryPackage({look: "vintage"}), options)).content.look).toBe("vintage");
        expect((await restorePackage(makeMemoryPackage(), options)).content.look).toBe("original");
        const unknown = makeMemoryPackage({}, (m) => {
            m.look = "future-look";
        });
        expect((await restorePackage(unknown, options)).content.look).toBe("original");
    });

    it("模板未知用默认模板，种子不是整数则用备用种子，并提示排版可能不同", async () => {
        const opened = makeMemoryPackage({}, (m) => {
            m.generator = {name: "qyPlayer web", version: "0.0.0", templateId: "nope", seed: 1.5};
        });
        const {content, layoutMayDiffer} = await restorePackage(opened, options);
        expect(content.templateId).toBe("clean");
        expect(content.seed).toBe(4242);
        expect(layoutMayDiffer).toBe(true);
    });

    it("不是本工具生成的包要提示；没有生成器信息也一样", async () => {
        const other = makeMemoryPackage({}, (m) => {
            m.generator = {name: "something else", version: "1", templateId: "clean", seed: 3};
        });
        expect((await restorePackage(other, options)).layoutMayDiffer).toBe(true);
        const none = makeMemoryPackage({}, (m) => {
            delete m.generator;
        });
        const result = await restorePackage(none, options);
        expect(result.layoutMayDiffer).toBe(true);
        expect(result.content).toMatchObject({templateId: "clean", seed: 4242});
    });
});

describe("还原：配乐", () => {
    it("没有配乐", async () => {
        const {content} = await restorePackage(makeMemoryPackage(), options);
        expect(content.music).toEqual({kind: "none"});
        // 生成器没写配乐，原声音量是 1；没有 duck 字段时压低开关按新影片的默认打开
        expect(content).toMatchObject({musicVolume: 1, videoVolume: 1, duckMusic: true});
    });

    it("带配乐的旧包保持视频静音；写了音量和压低的包按原值还原", async () => {
        const legacy = makeMemoryPackage({music: song}, (m) => {
            delete m.videoVolume;
            delete m.bgm?.duck;
        });
        expect(await restorePackage(legacy, options)).toMatchObject({content: {videoVolume: 0, musicVolume: 1, duckMusic: true}});
        const mixed = makeMemoryPackage({music: song, videoVolume: 1, musicVolume: 0.8, duck: 0.3});
        expect(await restorePackage(mixed, options)).toMatchObject({content: {videoVolume: 1, musicVolume: 0.8, duckMusic: true}});
        const full = makeMemoryPackage({music: song, videoVolume: 0.5, musicVolume: 1, duck: 1});
        expect(await restorePackage(full, options)).toMatchObject({content: {videoVolume: 0.5, duckMusic: false}});
    });

    it("CC0 且曲名是内置曲目：选中内置曲目，不读文件", async () => {
        const opened = makeMemoryPackage({music: {...song, title: BUILTIN_TRACKS[0]!.titleEn, license: BUILTIN_MUSIC_LICENSE}});
        expect((await restorePackage(opened, options)).content.music).toEqual({kind: "builtin", trackId: "goldberg-var1"});
    });

    it("曲名相同但许可不是 CC0：当作导入音频", async () => {
        const opened = makeMemoryPackage({music: {...song, title: BUILTIN_TRACKS[0]!.titleEn, license: "All rights reserved"}});
        expect((await restorePackage(opened, options)).content.music.kind).toBe("custom");
    });

    it("导入的音频：读出文件，沿用曲名、许可、时长和类型", async () => {
        const opened = makeMemoryPackage({music: {...song, license: "CC-BY-4.0"}});
        const {music} = (await restorePackage(opened, options)).content;
        expect(music.kind).toBe("custom");
        if (music.kind !== "custom") {
            return;
        }
        expect(music.entry).toMatchObject({mimeType: "audio/mpeg", source: {mimeType: "audio/mpeg", transcoded: false}, duration: 30, title: "My song", license: "CC-BY-4.0"});
        expect(await music.entry.blob.text()).toBe("song");
    });
});

describe("还原后重新生成", () => {
    it("由本工具生成的包：除 id 和 createdAt 外，重新生成的清单与原包相同", async () => {
        const original = planPackage({
            media: [photo("a.jpg", "2026-03-01T00:00:00Z"), photo("b.jpg", "2026-03-02T00:00:00Z"), video, photo("c.jpg"), photo("d.jpg", "2026-03-05T00:00:00Z")],
            music: {...song, license: "CC-BY-4.0"},
            templateId: "classic",
            seed: 2024,
            title: "春游",
            aspectRatio: "16:9",
        });
        // 经过真实的 ZIP 写入和打开，确认还原不依赖内存包的特殊性
        const opened = await openPackage(await writePackage(original.manifest, original.files));
        const restored = await restorePackage(opened, options);
        const state = loadEditor(createEditor(1, "clean"), restored.content);
        const doc = currentDoc(state);
        const music = doc.music.kind === "custom" ? doc.music.entry : undefined;
        const again = (await createPreviewPackage(doc, music ? {music} : {})).manifest;

        const strip = (m: Manifest): Manifest => ({...m, id: "", createdAt: ""});
        expect(strip(again)).toEqual(strip(original.manifest));
        await opened.close();
    });
});

describe("还原：手动编排（generator.plan）", () => {
    const media = [photo("a.jpg", "2026-03-01T00:00:00Z"), photo("b.jpg", "2026-03-02T00:00:00Z"), video, photo("c.jpg"), photo("d.jpg", "2026-03-05T00:00:00Z")];
    const base = {media, templateId: "classic", seed: 2024, aspectRatio: "16:9"} as const;
    const strip = (m: Manifest): Manifest => ({...m, id: "", createdAt: ""});

    /** 自动编排上改几处：第一个照片页的时长和取景、视频页的时长和起点 */
    const editedPlan = function editedPlan() {
        const plan = planPagesFor(base);
        const photoPage = plan.find((p) => p.items[0]!.clipStart === undefined)!;
        photoPage.duration = 6;
        photoPage.items[0]!.crop = {zoom: 2, x: 0.3, y: 0.6};
        const videoPage = plan.find((p) => p.items[0]!.clipStart !== undefined)!;
        videoPage.duration = 4;
        videoPage.items[0]!.clipStart = 1.5;
        return plan;
    };

    it("合法的 plan：还原为手动编排，重新生成的清单与原包相同（经过真实 ZIP）", async () => {
        const original = planPackage({...base, pages: editedPlan()});
        const opened = await openPackage(await writePackage(original.manifest, original.files));
        const restored = await restorePackage(opened, options);
        expect(restored.content.pages).not.toBeNull();
        expect(restored.layoutMayDiffer).toBe(false);
        const doc = currentDoc(loadEditor(createEditor(1, "clean"), restored.content));
        const again = (await createPreviewPackage(doc)).manifest;
        expect(strip(again)).toEqual(strip(original.manifest));
        await opened.close();
    });

    it("plan 不合法（素材对不上、取值越界、外形不对）：按自动编排打开", async () => {
        const bad: ((plan: ReturnType<typeof editedPlan>) => unknown)[] = [
            (plan) => (plan[0]!.items[0]!.assetId = "nope", plan),
            (plan) => plan.slice(1),
            (plan) => (plan[0]!.items[0]!.crop = {zoom: 9, x: 0.5, y: 0.5}, plan),
            () => "not a plan",
            () => [{items: "x"}],
        ];
        for (const make of bad) {
            const original = planPackage({...base, pages: editedPlan()});
            original.manifest.generator!.plan = make(editedPlan());
            const restored = await restorePackage(memoryPackage(original.manifest, original.files), options);
            expect(restored.content.pages).toBeNull();
            expect(restored.content.media).toHaveLength(5);
        }
    });

    it("没有 plan 的包（自动编排）：pages 为 null", async () => {
        const {manifest, files} = planPackage(base);
        const restored = await restorePackage(memoryPackage(manifest, files), options);
        expect(restored.content.pages).toBeNull();
    });
});

describe("预览包", () => {
    it("readBlob 直接返回编辑状态里的素材，不存在的路径报缺失", async () => {
        const input: EditorMediaInput = {...photo("a.jpg"), final: false};
        const state = loadEditor(createEditor(1, "clean"), {media: [input], title: "", subtitle: "", showTitle: false, aspect: "auto", templateId: "clean", transition: "auto", look: "original", length: "long", music: {kind: "none"}, musicVolume: 1, videoVolume: 1, duckMusic: true, seed: 1, pages: null});
        const {opened, manifest} = await createPreviewPackage(currentDoc(state));
        const src = manifest.assets[0]!.src;
        expect(await (await opened.readBlob(src)).text()).toBe("a.jpg");
        await expect(opened.readBlob("media/none.jpg")).rejects.toMatchObject({code: "missing-file"});
    });

    it("没有素材时抛出 no-media", async () => {
        await expect(createPreviewPackage(currentDoc(createEditor(1, "clean")))).rejects.toThrowError(GenerateError);
    });

    it("显示标题时按最终标题和画布尺寸画标题图片并放进包；不显示时不画", async () => {
        const input: EditorMediaInput = {...photo("a.jpg"), final: false};
        const content = {media: [input], title: "春游", subtitle: "三月", showTitle: true, length: "long" as const, aspect: "auto" as const, templateId: "clean", transition: "auto" as const, look: "original" as const, music: {kind: "none" as const}, musicVolume: 1, videoVolume: 1, duckMusic: true, seed: 1, pages: null};
        const requests: unknown[] = [];
        // eslint-disable-next-line @typescript-eslint/require-await
        const renderTitle = async (request: unknown) => (requests.push(request), new Blob(["png"]));
        const shown = await createPreviewPackage(currentDoc(loadEditor(createEditor(1, "clean"), content)), {renderTitle});
        expect(requests).toEqual([{title: "春游", subtitle: "三月", width: shown.manifest.canvas.width, height: shown.manifest.canvas.height}]);
        expect(shown.manifest.titleCard).toMatchObject({assetId: "t001"});
        expect(await (await shown.opened.readBlob("media/title.png")).text()).toBe("png");
        shown.opened.setFile("media/title.png", new Blob(["new"]));
        expect(await (await shown.opened.readBlob("media/title.png")).text()).toBe("new");

        requests.length = 0;
        const blank = await createPreviewPackage(currentDoc(loadEditor(createEditor(1, "clean"), {...content, title: ""})), {renderTitle});
        expect(requests).toEqual([]);
        expect(blank.manifest.title).toBe("");
        expect(blank.manifest.titleCard).toBeUndefined();

        requests.length = 0;
        const hidden = await createPreviewPackage(currentDoc(loadEditor(createEditor(1, "clean"), {...content, showTitle: false})), {renderTitle});
        expect(requests).toEqual([]);
        expect(hidden.manifest.titleCard).toBeUndefined();
        expect(hidden.manifest.subtitle).toBe("三月");
    });
});

describe("还原：全部内置曲目", () => {
    it.each(BUILTIN_TRACKS.map((track) => [track.id, track] as const))("%s：按英文曲名和 CC0 认出", async (id, track) => {
        const opened = makeMemoryPackage({music: {...song, title: track.titleEn, license: BUILTIN_MUSIC_LICENSE}});
        expect((await restorePackage(opened, options)).content.music).toEqual({kind: "builtin", trackId: id});
    });
});

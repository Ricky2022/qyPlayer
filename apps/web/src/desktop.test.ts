import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const { isDesktop, readInitialFile, saveBlob } = await import("./desktop");

function setDesktop(on: boolean): void {
  if (on) vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  else vi.stubGlobal("window", {});
}

afterEach(() => {
  invoke.mockReset();
  vi.unstubAllGlobals();
});

describe("isDesktop", () => {
  it("没有 window（Node）时为 false", () => {
    expect(isDesktop()).toBe(false);
  });
  it("网页里为 false，Tauri 里为 true", () => {
    setDesktop(false);
    expect(isDesktop()).toBe(false);
    setDesktop(true);
    expect(isDesktop()).toBe(true);
  });
});

describe("readInitialFile", () => {
  it("网页里不调用桌面命令", async () => {
    setDesktop(false);
    expect(await readInitialFile()).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
  it("没有启动参数时返回 null", async () => {
    setDesktop(true);
    invoke.mockResolvedValueOnce(null);
    expect(await readInitialFile()).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it("读出文件内容并取路径末段作文件名", async () => {
    setDesktop(true);
    invoke.mockResolvedValueOnce("C:\\Users\\a\\我的影片.qyp").mockResolvedValueOnce(new Uint8Array([1, 2, 3]).buffer);
    const file = await readInitialFile();
    expect(file?.name).toBe("我的影片.qyp");
    expect(file?.size).toBe(3);
    expect(invoke).toHaveBeenLastCalledWith("read_file", { path: "C:\\Users\\a\\我的影片.qyp" });
  });
});

describe("saveBlob（桌面）", () => {
  it("把字节体和百分号编码的文件名交给 save_file", async () => {
    setDesktop(true);
    invoke.mockResolvedValueOnce(undefined);
    await saveBlob(new Blob([new Uint8Array([9, 8])]), "我的 影片.qyp");
    const [command, body, options] = invoke.mock.calls[0]!;
    expect(command).toBe("save_file");
    expect([...(body as Uint8Array)]).toEqual([9, 8]);
    expect(decodeURIComponent((options as { headers: Record<string, string> }).headers["x-file-name"]!)).toBe("我的 影片.qyp");
  });
});

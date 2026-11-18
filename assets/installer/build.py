"""生成安装向导用的两张位图：欢迎页侧边图（164x314）和页眉图（150x57）。

用法：python assets/installer/build.py（需要 Pillow）。
图是从两个程序的图标 PNG 合成的，所以先运行 `node assets/icons/build.mjs` 更新图标。
"""

from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[2]

# 程序目录 -> 侧边图渐变的两端颜色（与图标同色系，下端更深）
APPS = {
    "desktop-player": ((56, 189, 248), (7, 26, 46)),
    "desktop-maker": ((251, 191, 36), (46, 28, 6)),
}


def vertical_gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size)
    pixels = image.load()
    for y in range(height):
        t = y / (height - 1)
        color = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(width):
            pixels[x, y] = color
    return image


def paste_icon(canvas: Image.Image, icon: Image.Image, size: int, position: tuple[int, int]) -> None:
    resized = icon.resize((size, size), Image.LANCZOS)
    canvas.paste(resized, position, resized)


for app, (top, bottom) in APPS.items():
    out = REPO / "apps" / app / "src-tauri" / "nsis"
    out.mkdir(parents=True, exist_ok=True)
    icon = Image.open(REPO / "apps" / app / "src-tauri" / "icons" / "icon.png").convert("RGBA")

    sidebar = vertical_gradient((164, 314), top, bottom)
    paste_icon(sidebar, icon, 112, (26, 56))
    sidebar.save(out / "sidebar.bmp")

    header = Image.new("RGB", (150, 57), (255, 255, 255))
    paste_icon(header, icon, 44, (98, 6))
    header.save(out / "header.bmp")

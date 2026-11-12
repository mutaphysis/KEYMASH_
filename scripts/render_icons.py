# Render scripts/icon.svg into the PWA / iOS / favicon PNGs in public/.
import asyncio, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SVG = (ROOT / 'scripts' / 'icon.svg').read_text()
# (file, size, scale of the artwork; maskable icons keep the art inside the 80% safe zone)
TARGETS = [('icon-192.png', 192, 1.0), ('icon-512.png', 512, 1.0), ('icon-maskable-512.png', 512, 0.78),
           ('apple-touch-icon.png', 180, 0.92), ('favicon-32.png', 32, 1.0)]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        for name, size, scale in TARGETS:
            pg = await b.new_page(viewport={'width': size, 'height': size})
            svg = SVG.replace('<g id="art">', f'<g id="art" transform="translate(256 256) scale({scale}) translate(-256 -256)">')
            await pg.set_content(f'<html><body style="margin:0;background:#000800">{svg.replace("<svg ", f"<svg width=\'{size}\' height=\'{size}\' ", 1)}</body></html>')
            await pg.wait_for_timeout(150)
            await pg.screenshot(path=str(ROOT / 'public' / name), clip={'x': 0, 'y': 0, 'width': size, 'height': size})
            await pg.close()
        await b.close()
    (ROOT / 'public' / 'icon.svg').write_text(SVG)
    print('icons written to public/')

asyncio.run(main())

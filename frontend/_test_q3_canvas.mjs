import { chromium } from 'playwright-core';
import fs from 'fs';

const browser = await chromium.launch({
  args: [
    '--no-sandbox',
    '--headless=new',
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--enable-webgl',
    '--enable-webgl2',
    '--ignore-gpu-blocklist',
    '--ignore-gpu-blacklist',
    '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox',
    '--disable-gpu-driver-bug-workarounds',
  ],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('crash', () => console.log('!!! PAGE CRASHED !!!'));

const url = 'http://localhost:8181/?' + encodeURIComponent('set fs_game baseoa');
console.log('Navigating to:', url);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log('goto error:', e.message));

for (const waitMs of [10000, 10000, 10000, 10000, 10000]) {
  await page.waitForTimeout(waitMs);
  try {
    const dataUrl = await page.evaluate(() => {
      const canvas = window.ioq3 && window.ioq3.canvas;
      if (!canvas) return null;
      try {
        return canvas.toDataURL('image/png');
      } catch (e) {
        return 'ERROR: ' + e.message;
      }
    }, { timeout: 8000 });
    if (dataUrl && dataUrl.startsWith('data:image')) {
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(`/tmp/q3_canvas_${Date.now()}.png`, Buffer.from(base64, 'base64'));
      console.log('Canvas snapshot saved, size:', base64.length);
    } else {
      console.log('Canvas read result:', dataUrl);
    }
  } catch (e) {
    console.log('Canvas evaluate FAILED:', e.message);
  }
}

await browser.close().catch(() => {});

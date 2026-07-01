import { chromium } from 'playwright-core';

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
page.on('pageerror', e => console.log('PAGE ERROR:', e.message, '\nSTACK:', e.stack));
page.on('console', m => console.log(`[${m.type()}]`, m.text()));
page.on('crash', () => console.log('!!! PAGE CRASHED (renderer process gone) !!!'));

const url = 'http://localhost:8181/?' + encodeURIComponent('set fs_game baseoa');
console.log('Navigating to:', url);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log('goto error:', e.message));

for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(3000);
  try {
    await page.screenshot({ path: `/tmp/q3_final_${i}.png` });
    console.log(`--- ${(i + 1) * 3}s checkpoint screenshot taken ---`);
  } catch (e) {
    console.log(`--- ${(i + 1) * 3}s checkpoint: screenshot FAILED: ${e.message} ---`);
    break;
  }
}

await browser.close().catch(() => {});

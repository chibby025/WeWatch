import { chromium } from 'playwright-core';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', m => console.log(`[${m.type()}]`, m.text()));

const url = 'http://localhost:8181/?' + encodeURIComponent('set fs_game baseoa');
console.log('Navigating to:', url);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log('goto error:', e.message));

for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(15000);
  await page.screenshot({ path: `/tmp/q3_progress_${i}.png` });
  console.log(`--- ${(i + 1) * 15}s checkpoint screenshot taken ---`);
}

await browser.close().catch(() => {});

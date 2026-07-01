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
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('crash', () => console.log('!!! PAGE CRASHED !!!'));

const url = 'http://localhost:8181/?' + encodeURIComponent('set fs_game baseoa');
console.log('Navigating to:', url);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log('goto error:', e.message));

console.log('Waiting 50s for init to settle...');
await page.waitForTimeout(50000);

console.log('Trying a lightweight evaluate (responsiveness check)...');
try {
  const result = await page.evaluate(() => document.title, { timeout: 10000 });
  console.log('Evaluate succeeded, title:', result);
} catch (e) {
  console.log('Evaluate FAILED:', e.message);
}

console.log('Trying screenshot with longer timeout...');
try {
  await page.screenshot({ path: '/tmp/q3_wait_1.png', timeout: 60000 });
  console.log('Screenshot 1 succeeded');
} catch (e) {
  console.log('Screenshot 1 FAILED:', e.message);
}

await page.waitForTimeout(15000);
try {
  await page.screenshot({ path: '/tmp/q3_wait_2.png', timeout: 60000 });
  console.log('Screenshot 2 succeeded');
} catch (e) {
  console.log('Screenshot 2 FAILED:', e.message);
}

await browser.close().catch(() => {});

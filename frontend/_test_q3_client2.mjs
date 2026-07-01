import { chromium } from 'playwright-core';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
const consoleMsgs = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on('requestfailed', req => console.log('REQUEST FAILED:', req.url(), req.failure()?.errorText));

await page.goto('http://localhost:8181/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log('goto error:', e.message));
await page.waitForTimeout(15000);
await page.screenshot({ path: '/tmp/q3_client2.png' });

console.log('\n--- Console messages (last 60) ---');
consoleMsgs.slice(-60).forEach(m => console.log(m));
console.log('\n--- Page errors ---');
errors.forEach(e => console.log(e));

await browser.close().catch(() => {});

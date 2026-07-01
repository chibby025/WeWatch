import { chromium } from 'playwright-core';

const flagSets = [
  { name: 'angle+swiftshader+new-headless', args: ['--no-sandbox', '--headless=new', '--use-angle=swiftshader', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] },
  { name: 'use-gl=swiftshader only', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] },
  { name: 'disable-gpu + swiftshader webgl', args: ['--no-sandbox', '--disable-gpu', '--enable-webgl', '--use-gl=swiftshader', '--ignore-gpu-blocklist'] },
  { name: 'no special flags', args: ['--no-sandbox'] },
];

for (const fs of flagSets) {
  const browser = await chromium.launch({ args: fs.args });
  const page = await browser.newPage();
  await page.goto('about:blank');
  const result = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return { ok: false };
    return {
      ok: true,
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
    };
  });
  console.log(fs.name, '=>', JSON.stringify(result));
  await browser.close();
}

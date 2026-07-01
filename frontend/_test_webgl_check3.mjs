import { chromium } from 'playwright-core';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('about:blank');
const result = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { antialias: true, depth: true, stencil: true, alpha: true });
  const ver = 'webgl';
  return {
    isInstance: gl instanceof WebGLRenderingContext,
    verCheck: ver == 'webgl',
    buggyExpr: (ver == 'webgl') == (gl instanceof WebGLRenderingContext),
    glConstructorName: gl ? gl.constructor.name : null,
  };
});
console.log('Result:', JSON.stringify(result));
await browser.close();

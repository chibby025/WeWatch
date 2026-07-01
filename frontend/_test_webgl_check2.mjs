import { chromium } from 'playwright-core';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('about:blank');
const result = await page.evaluate(() => {
  const div = document.createElement('div');
  div.id = 'viewport-frame';
  div.style.position = 'absolute';
  div.style.top = '0';
  div.style.left = '0';
  div.style.bottom = '0';
  div.style.right = '0';
  div.style.overflow = 'hidden';
  document.body.appendChild(div);

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  div.appendChild(canvas);

  const attrs = { antialias: true, depth: true, stencil: true, alpha: true };
  let gl;
  let errMsg = null;
  try {
    gl = canvas.getContext('webgl', attrs);
  } catch (e) {
    errMsg = e.message;
  }
  return {
    ok: !!gl,
    errMsg,
    clientWidth: canvas.clientWidth,
    clientHeight: canvas.clientHeight,
    offsetParentExists: !!canvas.offsetParent,
  };
});
console.log('Result:', JSON.stringify(result));
await browser.close();

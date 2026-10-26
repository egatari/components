// Shared by tests that compare screenshots of the same picture taken at different moments (tools/test-default-variant.mjs,
// tools/test-duration.mjs). The runtime's own interface (the control bar, its auto-hide on a real-time timer, toasts) is
// not part of a component's picture, so it is hidden; and Chrome's rasterization varies by a few anti-aliased pixels
// between runs on some systems (CI on Linux), so the comparison allows what tools/test-components.mjs's determinism
// check allows: at most 40 pixels whose RGB differences sum to more than 48.
export const LAUNCH = { args: ['--force-color-profile=srgb', '--disable-gpu', '--disable-gpu-rasterization', '--disable-partial-raster'] };
export const TOLERANCE = 40;
export async function hideChrome(p) {
  await p.addStyleTag({ content: 'body > :not(#stage):not(script):not(style){visibility:hidden !important}' });
}
export async function settle(p) {
  await p.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
}
// The number of clearly different pixels (RGB differences summed > 48) between two PNG buffers
export async function pixelDiff(p, a, b) {
  if (Buffer.from(a).equals(Buffer.from(b))) return 0;
  return p.evaluate(async ([a, b]) => {
    const ld = (s) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([ld(a), ld(b)]);
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let j = 0; j < da.length; j += 4) if (Math.abs(da[j] - db[j]) + Math.abs(da[j + 1] - db[j + 1]) + Math.abs(da[j + 2] - db[j + 2]) > 48) n++;
    return n;
  }, [Buffer.from(a).toString('base64'), Buffer.from(b).toString('base64')]);
}

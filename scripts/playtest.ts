// Play the real web build in headless Chromium and screenshot it.
//
//   npm run playtest                          # every scenario against a local dev server
//   npm run playtest -- keys touch            # just these scenarios
//   npm run playtest -- --url https://yeti-run.expo.app   # a deployed site
//   npm run playtest -- --clear               # restart Metro with --clear first
//   npm run playtest -- --out /some/dir       # where screenshots go (default playtest-out/)
//
// Scenarios: title (attract mode), keys (keyboard run to the end and Enter to
// restart), touch (hold-to-steer and tap-to-hop through CDP touch events).
//
// With no --url it reuses a dev server already answering on --port (default
// 8099) or starts one (CI=1 npx expo start --web) and stops it afterwards.
// Exits 1 if the page throws, logs a console error, or a scenario fails.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

const SCENARIOS = ['title', 'keys', 'touch'] as const;
type Scenario = (typeof SCENARIOS)[number];

// Mirrors render.ts: the skier is drawn at this fraction of the canvas.
const SKIER_X = 0.5;
const SKIER_Y = 0.3;
const VIEWPORT = { width: 420, height: 820 };
// WebGL in headless Chromium needs SwiftShader, or Skia has no surface.
const CHROME_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const OVER_TEXT = /The yeti got you|New best!/;

function parseArgs(argv: string[]) {
  const opts = { url: '', port: 8099, out: 'playtest-out', clear: false, scenarios: [] as Scenario[] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') opts.url = argv[++i].replace(/\/$/, '');
    else if (a === '--port') opts.port = Number(argv[++i]);
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--clear') opts.clear = true;
    else if ((SCENARIOS as readonly string[]).includes(a)) opts.scenarios.push(a as Scenario);
    else throw new Error(`unknown argument ${a} (scenarios: ${SCENARIOS.join(', ')})`);
  }
  if (!opts.scenarios.length) opts.scenarios = [...SCENARIOS];
  return opts;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function answers(url: string) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

async function startDevServer(port: number, clear: boolean): Promise<ChildProcess> {
  const args = ['expo', 'start', '--web', '--port', String(port), ...(clear ? ['--clear'] : [])];
  console.log(`starting: CI=1 npx ${args.join(' ')}`);
  const child = spawn('npx', args, { env: { ...process.env, CI: '1' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 120; i++) {
    if (await answers(`http://localhost:${port}/`)) return child;
    await sleep(1000);
  }
  stopDevServer(child);
  throw new Error(`dev server never answered on port ${port}`);
}

function stopDevServer(child: ChildProcess) {
  try {
    process.kill(-child.pid!, 'SIGTERM'); // the whole group: npx, expo, Metro workers
  } catch {}
}

class Run {
  failures: string[] = [];
  shots: string[] = [];
  constructor(
    private browser: Browser,
    private base: string,
    private out: string,
  ) {}

  /** A fresh page with error capture; the first load includes bundling and ~8 MB of wasm. */
  async open(path: string, touch = false) {
    const ctx = await this.browser.newContext({ viewport: VIEWPORT, hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => this.failures.push(`${path}: page error: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') this.failures.push(`${path}: console error: ${m.text()}`);
    });
    await page.goto(`${this.base}${path}`);
    await page.waitForSelector('canvas', { timeout: 120_000 });
    await page.waitForTimeout(1500); // first frames
    return page;
  }

  async shot(page: Page, name: string) {
    const file = resolve(this.out, `${name}.png`);
    await page.screenshot({ path: file });
    this.shots.push(file);
  }

  check(ok: boolean, what: string) {
    if (!ok) this.failures.push(what);
  }
}

async function canvasPoint(page: Page, fx: number, fy: number) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function title(run: Run) {
  const page = await run.open('/');
  await run.shot(page, 'title-0');
  await page.waitForTimeout(3000); // attract-mode bot should have moved on
  await run.shot(page, 'title-1');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/run/, { timeout: 10_000 }).catch(() => run.check(false, 'title: Enter did not open /run'));
  await page.context().close();
}

async function keys(run: Run) {
  const page = await run.open('/run');
  await run.shot(page, 'keys-0-start');
  const over = page.getByText(OVER_TEXT);
  // Weave until the yeti ends it: a crash-prone pattern ends runs faster.
  const pattern: [string, number][] = [
    ['ArrowRight', 400],
    ['ArrowDown', 900],
    ['ArrowLeft', 700],
    [' ', 60],
    ['ArrowDown', 900],
  ];
  const deadline = Date.now() + 90_000;
  for (let i = 0; Date.now() < deadline && !(await over.isVisible()); i++) {
    const [key, ms] = pattern[i % pattern.length];
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
    if (i === 2) await run.shot(page, 'keys-1-skiing');
  }
  const ended = await over.isVisible();
  run.check(ended, 'keys: run never ended within 90 s');
  if (ended) {
    await page.waitForTimeout(500);
    await run.shot(page, 'keys-2-over');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    run.check(!(await over.isVisible()), 'keys: Enter did not restart the run');
    await run.shot(page, 'keys-3-restart');
  }
  await page.context().close();
}

async function touch(run: Run) {
  const page = await run.open('/run', true);
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y) }],
    });
  const hold = async (fx: number, fy: number, ms: number) => {
    const p = await canvasPoint(page, fx, fy);
    await send('touchStart', p.x, p.y);
    for (let t = 0; t < ms; t += 50) {
      await page.waitForTimeout(50);
      await send('touchMove', p.x + ((t / 50) % 2), p.y); // keep the gesture alive
    }
    await send('touchEnd', p.x, p.y);
  };
  const skier = await canvasPoint(page, SKIER_X, SKIER_Y);
  await hold(SKIER_X + 0.25, SKIER_Y + 0.25, 1200); // down-right
  await run.shot(page, 'touch-0-right');
  await hold(SKIER_X - 0.25, SKIER_Y + 0.25, 1200); // down-left
  await run.shot(page, 'touch-1-left');
  await send('touchStart', skier.x, skier.y + 40); // quick tap: hop
  await send('touchEnd', skier.x, skier.y + 40);
  await page.waitForTimeout(150);
  await run.shot(page, 'touch-2-hop');
  // The how-to-play panel disappears once the skier pushes off.
  run.check(!(await page.getByText(/hop/i).first().isVisible().catch(() => false)), 'touch: how-to-play hint still showing, so touches did nothing');
  await page.context().close();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const out = resolve(opts.out);
  mkdirSync(out, { recursive: true });

  let server: ChildProcess | undefined;
  let base = opts.url;
  if (!base) {
    base = `http://localhost:${opts.port}`;
    if (opts.clear || !(await answers(`${base}/`))) {
      if (opts.clear && (await answers(`${base}/`)))
        throw new Error(`--clear wants a fresh server, but one is already on port ${opts.port}; stop it first`);
      server = await startDevServer(opts.port, opts.clear);
    } else console.log(`reusing the dev server on ${base}`);
  }

  const browser = await chromium.launch({ args: CHROME_ARGS });
  const run = new Run(browser, base, out);
  try {
    for (const s of opts.scenarios) {
      console.log(`scenario: ${s}`);
      try {
        await { title, keys, touch }[s](run);
      } catch (e) {
        run.failures.push(`${s}: ${(e as Error).message.split('\n')[0]}`);
      }
    }
  } finally {
    await browser.close();
    if (server) stopDevServer(server);
  }

  console.log(`\nscreenshots:\n${run.shots.map((f) => `  ${f}`).join('\n')}`);
  if (run.failures.length) {
    console.log(`\nFAIL (${run.failures.length}):\n${run.failures.map((f) => `  ${f}`).join('\n')}`);
    process.exit(1);
  }
  console.log('\nplaytest passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Usage: node scripts/visual-check.mjs [baseUrl=http://localhost:3123] [outDir=.shots] [--keyboard] [--only=home,event] [--vp=375,1280]
// Full-page screenshots of every major page type at 320, 375 (mobile) and 1280, plus a reduced-motion pass at 375.
// Prints a horizontal-overflow report and exits 1 if any page scrolls sideways.
// --keyboard adds a Tab pass on / and /login at 1280 (and / at 375): logs each focused element, its outline and
// whether the ring is clipped by an ancestor, and screenshots the viewport at every stop (<page>-tab-NN.png).
// Needs Chrome: CHROME_PATH, default the Windows install path.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a === "--keyboard"));
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]?.split(",");
const [base = "http://localhost:3123", outDir = ".shots"] = args.filter((a) => !a.startsWith("--"));
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ALL_PAGES = [
  ["home", "/"],
  ["event", "/events/seeing-machines"],
  ["event-lm", "/events/language-and-machines"],
  ["event-wie", "/events/wie-ai-healthtech"],
  ["finale", "/events/the-summit"],
  ["register", "/events/seeing-machines/register"],
  ["society", "/s/cs"],
  ["gallery", "/gallery"],
  ["resources", "/resources"],
  ["privacy", "/privacy"],
  ["conduct", "/code-of-conduct"],
  ["login", "/login"],
  ["404", "/this-step-does-not-exist"],
];
const ALL_VIEWPORTS = [
  { name: "320", width: 320, height: 640, mobile: true, reduced: false },
  { name: "375", width: 375, height: 812, mobile: true, reduced: false },
  { name: "1280", width: 1280, height: 900, mobile: false, reduced: false },
  { name: "375-reduced", width: 375, height: 812, mobile: true, reduced: true },
];
const only = opt("only");
const vps = opt("vp");
const PAGES = only ? ALL_PAGES.filter(([n]) => only.includes(n)) : ALL_PAGES;
const VIEWPORTS = vps ? ALL_VIEWPORTS.filter((v) => vps.includes(v.name)) : ALL_VIEWPORTS;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "shots-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(
  CHROME,
  ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"],
  { stdio: "ignore" },
);
let overflow = 0;
let clipped = 0;
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
    } catch {
      // Chrome is still starting
    }
  }
  if (!target) throw new Error("Chrome did not start (set CHROME_PATH)");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.result?.value;
  const setViewport = async (vp, height = vp.height) => {
    await send("Emulation.setDeviceMetricsOverride", { width: vp.width, height, deviceScaleFactor: 1, mobile: vp.mobile });
    await send("Emulation.setTouchEmulationEnabled", { enabled: vp.mobile });
    await send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: "light" },
        { name: "prefers-reduced-motion", value: vp.reduced ? "reduce" : "no-preference" },
      ],
    });
  };
  const load = async (path) => {
    await send("Page.navigate", { url: new URL(path, base).href });
    await sleep(300);
    for (let i = 0; i < 100 && (await evaluate("document.readyState")) !== "complete"; i++) await sleep(200);
    await sleep(2500); // fonts, the stair climb-in, first reveals
  };

  await send("Page.enable");
  await send("Runtime.enable");
  for (const vp of VIEWPORTS) {
    await setViewport(vp);
    for (const [name, path] of PAGES) {
      await load(path);
      // reveal everything below the fold so full-page shots aren't blank
      await evaluate("document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-in')), true");
      const [sw, sh, header, title] = JSON.parse(
        await evaluate(
          "JSON.stringify([document.documentElement.scrollWidth, document.documentElement.scrollHeight, Math.round(document.querySelector('header')?.getBoundingClientRect().height ?? 0), document.title])",
        ),
      );
      const bad = sw !== vp.width;
      if (bad) overflow++;
      const landed = await evaluate("location.pathname");
      console.log(
        `${vp.name.padEnd(12)} ${name.padEnd(10)} scrollWidth=${sw}${bad ? "  HORIZONTAL OVERFLOW" : ""}  header=${header}px  ${path} -> ${landed}  "${title}"`,
      );
      await setViewport(vp, sh);
      await sleep(300);
      const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: vp.width, height: sh, scale: 1 } });
      writeFileSync(join(outDir, `${name}-${vp.name}.png`), Buffer.from(shot.result.data, "base64"));
      await setViewport(vp);
    }
  }

  if (flags.has("--keyboard")) {
    // describe the focused element, its ring and whether an ancestor with overflow clips the ring (3px + 3px offset)
    const probe = `(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return JSON.stringify({ tag: "body" });
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const ring = (parseFloat(cs.outlineWidth) || 0) + Math.max(0, parseFloat(cs.outlineOffset) || 0);
      let clip = null;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (/(hidden|clip|auto|scroll)/.test(ps.overflowX + ps.overflowY) && !p.classList.contains("field")) {
          const pr = p.getBoundingClientRect();
          if (r.left - ring < pr.left - 0.5 || r.top - ring < pr.top - 0.5 || r.right + ring > pr.right + 0.5 || r.bottom + ring > pr.bottom + 0.5) {
            clip = (p.className && typeof p.className === "string" ? p.className.slice(0, 60) : p.tagName);
            break;
          }
        }
      }
      const label = (el.getAttribute("aria-label") || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 50);
      return JSON.stringify({ tag: el.tagName.toLowerCase(), label, outline: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor, w: Math.round(r.width), h: Math.round(r.height), clip });
    })()`;
    const passes = [
      [ALL_VIEWPORTS[2], "home", "/", 40],
      [ALL_VIEWPORTS[2], "login", "/login", 12],
      [ALL_VIEWPORTS[1], "home", "/", 14],
    ];
    for (const [vp, name, path, steps] of passes) {
      await setViewport(vp);
      await load(path);
      console.log(`\nkeyboard ${name} @ ${vp.name}`);
      // the app focuses #main after load; restart sequential focus navigation from the top of the document
      await evaluate(
        "(() => { const t = document.createElement('div'); t.tabIndex = -1; document.body.prepend(t); t.focus(); t.remove(); window.scrollTo(0, 0); return true; })()",
      );
      for (let i = 1; i <= steps; i++) {
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
        await sleep(450);
        const f = JSON.parse(await evaluate(probe));
        if (f.clip) clipped++;
        console.log(
          `  ${String(i).padStart(2, "0")} ${f.tag.padEnd(6)} ${String(f.w ?? "").padStart(4)}x${String(f.h ?? "").padEnd(4)} ${(f.outline ?? "").padEnd(36)} ${f.label ?? ""}${f.clip ? `  RING CLIPPED by .${f.clip}` : ""}`,
        );
        const shot = await send("Page.captureScreenshot", { format: "png" });
        writeFileSync(join(outDir, `${name}-${vp.name}-tab-${String(i).padStart(2, "0")}.png`), Buffer.from(shot.result.data, "base64"));
      }
    }
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome may still hold the profile on Windows; it lives in the temp dir
  }
}
console.log(overflow ? `${overflow} page(s) overflow horizontally` : "no horizontal overflow");
if (clipped) console.log(`${clipped} focus ring(s) clipped`);
process.exit(overflow ? 1 : 0);

import { app, BrowserWindow } from "electron";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROFILE_DIR = path.join(__dirname, ".electron-profile");
app.setPath("userData", PROFILE_DIR);
app.commandLine.appendSwitch("no-proxy-server");
app.commandLine.appendSwitch("disk-cache-dir", path.join(__dirname, ".electron-cache"));

const root = path.join(__dirname, "..");
const svgPath = path.join(root, "resources", "icon.svg");
const setDir = path.join(root, "resources", "icon.iconset");

const SIZES = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024]
];

const svgDataUrl = () => `data:image/svg+xml;base64,${Buffer.from(readSvg()).toString("base64")}`;
function readSvg() {
  return readFileSync(svgPath, "utf8");
}

async function render(win, size) {
  const dataUrl = await win.webContents.executeJavaScript(`
    (() => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = ${size}; c.height = ${size};
        const ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, 0, 0, ${size}, ${size});
        resolve(c.toDataURL("image/png"));
      };
      img.src = ${JSON.stringify(svgDataUrl())};
    }))()
  `);
  return Buffer.from(String(dataUrl).split(",")[1], "base64");
}

app.whenReady().then(async () => {
  console.error("[icons] ready");
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL("about:blank");
  console.error("[icons] page ready");
  rmSync(setDir, { recursive: true, force: true });
  mkdirSync(setDir, { recursive: true });
  let png1024 = null;
  for (const [name, size] of SIZES) {
    console.error(`[icons] rendering ${name}`);
    const buffer = await render(win, size);
    writeFileSync(path.join(setDir, name), buffer);
    if (size === 1024) png1024 = buffer;
    console.error(`[icons] ${name} (${buffer.length} bytes)`);
  }
  writeFileSync(path.join(root, "resources", "icon.png"), png1024);
  rmSync(path.join(root, "resources", "icon.icns"), { force: true });
  execFileSync("/usr/bin/iconutil", ["-c", "icns", setDir, "-o", path.join(root, "resources", "icon.icns")]);
  rmSync(setDir, { recursive: true, force: true });
  console.error("[icons] wrote resources/icon.png and resources/icon.icns");
  setTimeout(() => app.exit(0), 100);
});

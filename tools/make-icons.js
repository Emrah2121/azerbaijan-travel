// Renders the PWA icons in icons/ from logo.svg with headless Chrome.
// Usage: node tools/make-icons.js [path-to-chrome]
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const CHROME = process.argv[2] || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const logo = fs.readFileSync(path.join(ROOT, "logo.svg"), "utf8")
  .replace(/<rect width="64" height="64" rx="14" fill="#ffffff"\/>/, ""); // drop the favicon tile
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "seyyah-icons-"));
fs.mkdirSync(path.join(ROOT, "icons"), { recursive: true });

// `pad` is the share of the canvas kept empty around the hiker; maskable icons need a wide safe zone
for (const [name, size, pad] of [["icon-192", 192, 0.12], ["icon-512", 512, 0.12], ["icon-maskable-512", 512, 0.22]]) {
  const inner = Math.round(size * (1 - 2 * pad));
  const html = `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;
    background:linear-gradient(160deg,#def0fd,#eee8fd)">
    <div style="width:${inner}px;height:${inner}px">${logo.replace("<svg ", '<svg width="100%" height="100%" ')}</div></body></html>`;
  const page = path.join(tmp, name + ".html");
  fs.writeFileSync(page, html);
  const out = path.join(ROOT, "icons", name + ".png");
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--window-size=${size},${size}`,
    `--screenshot=${out}`, "file:///" + page.replace(/\\/g, "/")], { stdio: "ignore" });
  console.log("wrote", path.relative(ROOT, out));
}

// Browser-tab favicons: the full logo.svg (white rounded tile keeps it readable on dark tabs).
const favicon = fs.readFileSync(path.join(ROOT, "logo.svg"), "utf8");
const pngs = [];
for (const size of [16, 32, 48]) {
  const html = `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:transparent">
    ${favicon.replace("<svg ", `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`;
  const page = path.join(tmp, `fav-${size}.html`);
  fs.writeFileSync(page, html);
  const out = path.join(ROOT, "icons", `favicon-${size}.png`);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
    `--window-size=${size},${size}`, `--screenshot=${out}`, "file:///" + page.replace(/\\/g, "/")], { stdio: "ignore" });
  pngs.push([size, fs.readFileSync(out)]);
  console.log("wrote", path.relative(ROOT, out));
}

// favicon.ico holding the PNGs above (ICO allows embedded PNG images)
const header = Buffer.alloc(6 + 16 * pngs.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach(([size, data], k) => {
  const e = 6 + 16 * k;
  header.writeUInt8(size, e); header.writeUInt8(size, e + 1);
  header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(data.length, e + 8); header.writeUInt32LE(offset, e + 12);
  offset += data.length;
});
fs.writeFileSync(path.join(ROOT, "favicon.ico"), Buffer.concat([header, ...pngs.map(([, d]) => d)]));
console.log("wrote favicon.ico");

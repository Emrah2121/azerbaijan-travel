// Renders the shareable result card (1080×1350 PNG) on a canvas.
// window.SeyyahShare.render(data, hikerSvg) → Promise<Blob>
// data: { kind: "route" | "speed", title, sub, score, emoji?, shown: [{ id, state }] }
(() => {
  "use strict";

  const W = 1080, H = 1350;
  const STATE_STOPS = {
    start: ["--start-a", "--start"], end: ["--end-a", "--end"],
    green: ["--green-a", "--green"], orange: ["--orange-a", "--orange"], red: ["--red-a", "--red"],
    reveal: ["--reveal-a", "--reveal"], hint: ["--land-a", "--land-b"],
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // shrink the font until the text fits the width
  function fitText(ctx, text, maxW, size, weight, family) {
    for (; size > 18; size -= 2) {
      ctx.font = `${weight} ${size}px ${family}`;
      if (ctx.measureText(text).width <= maxW) break;
    }
  }

  // The header logo inherits its colors from CSS; inline them so it renders standalone.
  async function hikerImage(svgEl, css) {
    if (!svgEl) return null;
    let src = svgEl.outerHTML
      .replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"')
      .replace(/currentColor/g, css("--ink"))
      .replace(/var\((--logo-[a-z]+)\)/g, (_, v) => css(v));
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
    await img.decode();
    return img;
  }

  async function render(data, hikerSvg) {
    const style = getComputedStyle(document.documentElement);
    const css = (v) => style.getPropertyValue(v).trim();
    const MAP = window.AZ_MAP, R = MAP.regions;
    const sans = '"Manrope", system-ui, sans-serif', label = '"Inter", system-ui, sans-serif';
    if (document.fonts) await document.fonts.ready;

    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");

    // background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, css("--sea-a"));
    bg.addColorStop(1, css("--sea-b"));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // header: logo + wordmark
    const logo = await hikerImage(hikerSvg, css).catch(() => null);
    if (logo) ctx.drawImage(logo, 70, 58, 128, 128);
    ctx.fillStyle = css("--ink");
    ctx.textBaseline = "alphabetic";
    ctx.font = `800 76px ${sans}`;
    ctx.fillText("Səyyah", 214, 130);
    ctx.font = `800 24px ${sans}`;
    ctx.fillStyle = css("--ink-2");
    if ("letterSpacing" in ctx) ctx.letterSpacing = "6px";
    ctx.fillText("AZƏRBAYCANI KƏŞF ET", 218, 172);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

    // title + subtitle
    ctx.fillStyle = css("--ink");
    fitText(ctx, data.title, W - 140, 64, 800, sans);
    ctx.fillText(data.title, 70, 292);
    ctx.fillStyle = css("--ink-2");
    fitText(ctx, data.sub, W - 140, 32, 600, sans);
    ctx.fillText(data.sub, 70, 344);

    // map card
    const card = { x: 60, y: 390, w: W - 120, h: 700 };
    ctx.save();
    roundRect(ctx, card.x, card.y, card.w, card.h, 44);
    ctx.fillStyle = css("--surface");
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.clip();

    // fit the shown regions (or the whole country) into the card
    const ids = data.shown.map((s) => s.id);
    let [x0, y0, x1, y1] = ids.length ? [Infinity, Infinity, -Infinity, -Infinity] : [0, 0, MAP.width, MAP.height];
    for (const i of ids) {
      const b = R[i].bbox;
      x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
    }
    const pad = Math.max(x1 - x0, y1 - y0) * 0.3 + 25;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const k = Math.min(card.w / (x1 - x0), card.h / (y1 - y0));
    const ox = card.x + (card.w - (x1 - x0) * k) / 2 - x0 * k;
    const oy = card.y + (card.h - (y1 - y0) * k) / 2 - y0 * k;
    const toPx = (x, y) => [ox + x * k, oy + y * k];

    const order = R.map((_, i) => i).sort((a, b) => R[b].area - R[a].area);
    const paths = R.map((r) => new Path2D(r.d));
    ctx.save();
    ctx.setTransform(k, 0, 0, k, ox, oy);
    const land = ctx.createLinearGradient(0, MAP.height, MAP.width, 0);
    land.addColorStop(0, css("--land-a"));
    land.addColorStop(1, css("--land-b"));
    ctx.fillStyle = land;
    ctx.strokeStyle = css("--land-stroke");
    ctx.lineWidth = 1 / k;
    for (const i of order) { ctx.fill(paths[i]); ctx.stroke(paths[i]); }

    const shownSet = new Map(data.shown.map((s) => [s.id, s.state]));
    ctx.lineJoin = "round";
    for (const i of order) {
      const st = shownSet.get(i);
      if (!st) continue;
      const [a, b] = STATE_STOPS[st] || STATE_STOPS.hint;
      const bb = R[i].bbox;
      const g = ctx.createLinearGradient(bb[0], bb[1], bb[2], bb[3]);
      g.addColorStop(0, css(a));
      g.addColorStop(1, css(b));
      ctx.fillStyle = g;
      ctx.shadowColor = css("--shade");
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;
      ctx.fill(paths[i]);
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = st === "reveal" ? css("--green") : css("--on-stroke");
      ctx.lineWidth = 3 / k;
      ctx.setLineDash(st === "reveal" ? [10 / k, 7 / k] : []);
      ctx.stroke(paths[i]);
      ctx.setLineDash([]);
    }
    ctx.restore();

    // pins for districts too small to see, then labels
    const sizePx = (i) => Math.sqrt(R[i].area * Math.cos((40.2 * Math.PI) / 180) * 160 * 160) * k;
    for (const { id, state } of data.shown) {
      if (sizePx(id) >= 34) continue;
      const [px, py] = toPx(...R[id].label);
      const [a, b] = STATE_STOPS[state] || STATE_STOPS.hint;
      const g = ctx.createLinearGradient(px - 16, py - 16, px + 16, py + 16);
      g.addColorStop(0, css(a)); g.addColorStop(1, css(b));
      ctx.beginPath(); ctx.arc(px, py, 16, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = css("--pin-ring"); ctx.stroke();
    }
    ctx.font = `600 28px ${label}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const { id, state } of data.shown) {
      if (state === "hint") continue;
      let [px, py] = toPx(...R[id].label);
      if (sizePx(id) < 34) py -= 38;
      ctx.lineWidth = 8; ctx.strokeStyle = css("--halo");
      ctx.strokeText(R[id].name, px, py);
      ctx.fillStyle = css("--ink");
      ctx.fillText(R[id].name, px, py);
    }
    ctx.restore(); // card clip

    // score + emoji row + footer
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = css("--ink");
    ctx.font = `800 64px ${sans}`;
    ctx.fillText(data.score, 70, 1188);
    if (data.emoji) {
      ctx.font = `48px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      ctx.fillText(data.emoji, 70, 1262);
    }
    ctx.fillStyle = css("--ink-3");
    ctx.font = `700 24px ${sans}`;
    ctx.textAlign = "right";
    ctx.fillText("Əmrah Əliyev · github.com/Emrah2121", W - 70, H - 48);

    return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
  }

  window.SeyyahShare = { render };
})();

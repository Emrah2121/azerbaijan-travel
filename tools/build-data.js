// Generates ../data.js from geoBoundaries AZE ADM2 (tools/aze-adm2.geojson).
// Usage: node tools/build-data.js
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "aze-adm2.geojson");
const OUT = path.join(__dirname, "..", "data.js");

// English source name -> Azerbaijani display name
const AZ = {
  Khachmaz: "Xaçmaz", Shabran: "Şabran", Siazan: "Siyəzən", Khizi: "Xızı", Qusar: "Qusar",
  Quba: "Quba", Absheron: "Abşeron", Sumqayit: "Sumqayıt", Baku: "Bakı", Gobustan: "Qobustan",
  Shamakhi: "Şamaxı", Qabala: "Qəbələ", Ismailli: "İsmayıllı", Agsu: "Ağsu", Hajigabul: "Hacıqabul",
  Shirvan: "Şirvan", Oghuz: "Oğuz", Ganja: "Gəncə", Shusha: "Şuşa", Khankendi: "Xankəndi",
  Yevlakh: "Yevlax", Naftalan: "Naftalan", Shaki: "Şəki", Salyan: "Salyan", Sabirabad: "Sabirabad",
  Lankaran: "Lənkəran", Neftchala: "Neftçala", Mingachevir: "Mingəçevir", Qakh: "Qax",
  Zaqatala: "Zaqatala", Balakan: "Balakən", Masally: "Masallı", Astara: "Astara", Lerik: "Lerik",
  Yardymli: "Yardımlı", Jalilabad: "Cəlilabad", Bilasuvar: "Biləsuvar", Saatly: "Saatlı",
  Agdash: "Ağdaş", Goychay: "Göyçay", Ujar: "Ucar", Kurdamir: "Kürdəmir", Zardab: "Zərdab",
  Imishli: "İmişli", Barda: "Bərdə", Aghjabadi: "Ağcabədi", Beylagan: "Beyləqan", Samukh: "Samux",
  Goranboy: "Goranboy", Tartar: "Tərtər", Kalbajar: "Kəlbəcər", Agdam: "Ağdam", Goygol: "Göygöl",
  Shamkir: "Şəmkir", Dashkasan: "Daşkəsən", Gadabay: "Gədəbəy", Tovuz: "Tovuz", Agstafa: "Ağstafa",
  Qazakh: "Qazax", Lachin: "Laçın", Khojaly: "Xocalı", Khojavend: "Xocavənd", Fuzuli: "Füzuli",
  Jabrayil: "Cəbrayıl", Qubadli: "Qubadlı", Zangilan: "Zəngilan", Ordubad: "Ordubad", Julfa: "Culfa",
  Shahbuz: "Şahbuz", Nakhchivan: "Naxçıvan", Babek: "Babək", Kangarli: "Kəngərli", Sharur: "Şərur",
  Sadarak: "Sədərək",
};

// Small enclave cities whose border the simplified data does not share with their host.
const MANUAL_EDGES = [["Naftalan", "Goranboy"], ["Khankendi", "Khojaly"], ["Nakhchivan", "Babek"]];

const EPS = 0.003; // degrees; vertices this close to another region's border count as shared
const MIN_SHARED = 3; // shared vertices needed to call two regions neighbours

const LAT0 = 40.2, K = 160; // equirectangular projection
const project = ([lon, lat]) => [lon * Math.cos((LAT0 * Math.PI) / 180) * K, -lat * K];

const geo = JSON.parse(fs.readFileSync(SRC, "utf8"));

// Same-named city + district (and stray parts) collapse into one region keyed by base name.
const groups = new Map();
for (const f of geo.features) {
  const key = f.properties.shapeName.replace(/ (District|City)$/, "");
  if (!AZ[key]) throw new Error("No Azerbaijani name for " + key);
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(...polys);
}

function ringArea(r) {
  let a = 0;
  for (let k = 0; k < r.length - 1; k++) a += r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1];
  return a / 2;
}
function ringCentroid(r) {
  let a = 0, cx = 0, cy = 0;
  for (let k = 0; k < r.length - 1; k++) {
    const c = r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1];
    a += c; cx += (r[k][0] + r[k + 1][0]) * c; cy += (r[k][1] + r[k + 1][1]) * c;
  }
  return [cx / (3 * a), cy / (3 * a)];
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}
// Douglas–Peucker on projected points
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i], pts[s], pts[e]);
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const keys = [...groups.keys()];
const regions = keys.map((key) => {
  const outer = groups.get(key).map((p) => p[0]);
  const largest = outer.reduce((m, r) => (Math.abs(ringArea(r)) > Math.abs(ringArea(m)) ? r : m));
  const label = project(ringCentroid(largest));
  let d = "", minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const ring of outer) {
    const pts = simplify(ring.map(project), 0.25);
    if (pts.length < 4) continue;
    for (const [x, y] of pts) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
    d += "M" + pts.slice(0, -1).map(([x, y]) => x.toFixed(1) + " " + y.toFixed(1)).join("L") + "Z";
  }
  return {
    key, name: AZ[key], rings: outer, area: outer.reduce((s, r) => s + Math.abs(ringArea(r)), 0),
    d, label, bbox: [minx, miny, maxx, maxy],
  };
});

// Adjacency from shared boundary vertices
const adj = keys.map(() => new Set());
for (let i = 0; i < regions.length; i++) {
  for (let j = i + 1; j < regions.length; j++) {
    let shared = 0;
    for (const ra of regions[i].rings) for (const p of ra) {
      let near = false;
      for (const rb of regions[j].rings) {
        for (let k = 0; k < rb.length - 1 && !near; k++) near = segDist(p, rb[k], rb[k + 1]) < EPS;
        if (near) break;
      }
      if (near && ++shared >= MIN_SHARED) break;
    }
    if (shared >= MIN_SHARED) { adj[i].add(j); adj[j].add(i); }
  }
}
for (const [a, b] of MANUAL_EDGES) {
  const i = keys.indexOf(a), j = keys.indexOf(b);
  adj[i].add(j); adj[j].add(i);
}

// Shift coordinates so the map starts at 0,0
const all = regions.map((r) => r.bbox);
const ox = Math.min(...all.map((b) => b[0])) - 4, oy = Math.min(...all.map((b) => b[1])) - 4;
const W = Math.max(...all.map((b) => b[2])) - ox + 4, H = Math.max(...all.map((b) => b[3])) - oy + 4;
const shift = (s) => s.replace(/(-?\d+\.\d) (-?\d+\.\d)/g, (_, x, y) => (+x - ox).toFixed(1) + " " + (+y - oy).toFixed(1));

const out = {
  width: +W.toFixed(1),
  height: +H.toFixed(1),
  regions: regions.map((r, i) => ({
    id: i,
    name: r.name,
    en: r.key,
    area: +r.area.toFixed(4),
    d: shift(r.d),
    label: [+(r.label[0] - ox).toFixed(1), +(r.label[1] - oy).toFixed(1)],
    bbox: [r.bbox[0] - ox, r.bbox[1] - oy, r.bbox[2] - ox, r.bbox[3] - oy].map((v) => +v.toFixed(1)),
    nb: [...adj[i]].sort((a, b) => a - b),
  })),
};

fs.writeFileSync(
  OUT,
  "// Generated by tools/build-data.js from geoBoundaries (CC BY 4.0). Do not edit by hand.\n" +
    "window.AZ_MAP = " + JSON.stringify(out) + ";\n"
);
console.log(`Wrote ${OUT}: ${out.regions.length} regions, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, ${W.toFixed(0)}x${H.toFixed(0)}`);
for (const r of out.regions) console.log(r.name.padEnd(12), "→", r.nb.map((j) => out.regions[j].name).join(", "));

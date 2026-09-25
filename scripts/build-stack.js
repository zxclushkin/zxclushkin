// Собирает assets/stack.svg — единую неоновую полосу стека с настоящими логотипами.
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2];

// порядок как в запросе пользователя
const ITEMS = [
  { label: "Docker",        icon: "logos:docker-icon",     color: "#2496ED" },
  { label: "Yandex Games",  icon: "fa6-brands:yandex",     color: "#FC3F1D", forceFill: "#FC3F1D" },
  { label: "TypeScript",    icon: "logos:typescript-icon", color: "#3178C6" },
  { label: "JavaScript",    icon: "logos:javascript",      color: "#F7DF1E" },
  { label: "Godot",         icon: "logos:godot-icon",      color: "#478CBF" },
  { label: "DeepSeek",      icon: "logos:deepseek-icon",   color: "#4D6BFE" },
  { label: "ChatGPT",       icon: "logos:openai-icon",     color: "#10A37F" },
  { label: "OpenCode",      icon: "logos:opencode",        color: "#A9B1D6", forceFill: "#E6EAF5" },
];

const PALETTE = { bg: "#1a1b27", border: "#2f334d", text: "#c0caf5" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function scopeIds(inner, prefix) {
  const ids = [...inner.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  let out = inner;
  for (const id of ids) {
    out = out.split(`id="${id}"`).join(`id="${prefix}${id}"`);
    out = out.split(`url(#${id})`).join(`url(#${prefix}${id})`);
    out = out.split(`href="#${id}"`).join(`href="#${prefix}${id}"`);
  }
  return out;
}

async function fetchIcon(id) {
  const [prefix, name] = id.split(":");
  const res = await fetch(`https://api.iconify.design/${prefix}/${name}.svg`);
  if (!res.ok) throw new Error(`icon ${id} -> HTTP ${res.status}`);
  const svg = await res.text();
  const vb = svg.match(/viewBox="([^"]+)"/);
  if (!vb) throw new Error(`icon ${id}: no viewBox`);
  const [vx, vy, vw, vh] = vb[1].trim().split(/\s+/).map(Number);
  let inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  inner = scopeIds(inner, prefix + "_" + name + "_");
  return { inner, vx, vy, vw, vh };
}

(async () => {
  const logos = [];
  for (const it of ITEMS) {
    const icon = await fetchIcon(it.icon);
    logos.push({ ...it, ...icon });
  }

  const pillW = 200, pillH = 56, gapX = 20, gapY = 16, logoSize = 28;
  const cols = 4;
  const w = cols * pillW + (cols - 1) * gapX; // 860
  const rows = Math.ceil(ITEMS.length / cols);
  const h = rows * pillH + (rows - 1) * gapY;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Стек и инструменты" font-family="Segoe UI, Ubuntu, Helvetica, Arial, sans-serif">\n`;

  logos.forEach((lg, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = col * (pillW + gapX);
    const y = row * (pillH + gapY);
    const cid = "pill" + i;

    const scale = Math.min(logoSize / lg.vw, logoSize / lg.vh);
    const tx = x + 16 + (logoSize - lg.vw * scale) / 2;
    const ty = y + (pillH - logoSize) / 2 + (logoSize - lg.vh * scale) / 2;

    let inner = lg.inner;
    if (lg.forceFill) inner = inner.replace(/fill="[^"]*"/g, `fill="${lg.forceFill}"`);

    s += `  <clipPath id="${cid}"><rect x="${x}" y="${y}" width="${pillW}" height="${pillH}" rx="14"/></clipPath>\n`;
    s += `  <rect x="${x}" y="${y}" width="${pillW}" height="${pillH}" rx="14" fill="${PALETTE.bg}" stroke="${PALETTE.border}"/>\n`;
    s += `  <g clip-path="url(#${cid})"><rect x="${x}" y="${y}" width="5" height="${pillH}" fill="${lg.color}"/></g>\n`;
    s += `  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(5)}) translate(${-lg.vx} ${-lg.vy})">${inner}</g>\n`;
    s += `  <text x="${x + 56}" y="${y + 34}" font-size="15.5" font-weight="600" fill="${PALETTE.text}">${esc(lg.label)}</text>\n`;
  });

  s += "</svg>\n";
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "stack.svg"), s, "utf8");
  console.log("written stack.svg", s.length, "bytes;", logos.length, "items");
})();

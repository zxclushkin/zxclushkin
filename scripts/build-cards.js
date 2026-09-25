// Собирает данные с GitHub и генерирует кастомные неоновые SVG-карточки (Tokyo Night).
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const LOGIN = "zxclushkin";
const OUTDIR = process.argv[2];
const TOKEN =
  process.env.GITHUB_TOKEN ||
  execSync("gh auth token", { encoding: "utf8" }).trim();

const PALETTE = {
  bg: "#1a1b27",
  bg2: "#16161e",
  border: "#2f334d",
  title: "#7aa2f7",
  purple: "#bb9af7",
  cyan: "#7dcfff",
  green: "#9ece6a",
  text: "#c0caf5",
  muted: "#565f89",
};

const QUERY = `query($login:String!){
  user(login:$login){
    name
    createdAt
    followers{ totalCount }
    following{ totalCount }
    repositories(ownerAffiliations:OWNER, isFork:false){ totalCount }
    contributionsCollection{
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      restrictedContributionsCount
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ contributionCount date } }
      }
    }
    repos: repositories(ownerAffiliations:OWNER, isFork:false, first:100){
      nodes{
        name
        stargazerCount
        isPrivate
        languages(first:10, orderBy:{field:SIZE, direction:DESC}){
          edges{ size node{ name color } }
        }
      }
    }
  }
}`;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const nf = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

function flattenDays(cal) {
  const days = [];
  for (const w of cal.weeks) for (const d of w.contributionDays) days.push(d);
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}

function streaks(days) {
  let best = 0, bestEnd = null, cur = 0, curEnd = null;
  for (const d of days) {
    if (d.contributionCount > 0) {
      cur++;
      curEnd = d.date;
      if (cur > best) { best = cur; bestEnd = curEnd; }
    } else {
      cur = 0;
    }
  }
  return { current: cur, longest: best, currentEnd: curEnd, longestEnd: bestEnd };
}

function frame(w, h, extraDefs = "") {
  return { w, h, extraDefs };
}

function defs(w, h) {
  return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PALETTE.bg}"/>
      <stop offset="1" stop-color="${PALETTE.bg2}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${PALETTE.title}"/>
      <stop offset="0.5" stop-color="${PALETTE.purple}"/>
      <stop offset="1" stop-color="${PALETTE.cyan}"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PALETTE.title}"/>
      <stop offset="1" stop-color="${PALETTE.purple}"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;
}

function shell(w, h, title, accent) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}" font-family="Segoe UI, Ubuntu, Helvetica, Arial, sans-serif">
${defs(w, h)}
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="16" fill="url(#bg)" stroke="${PALETTE.border}"/>
  <rect x="20" y="24" width="6" height="22" rx="3" fill="${accent}" filter="url(#glow)"/>
  <text x="38" y="42" font-size="19" font-weight="700" fill="${PALETTE.text}">${esc(title)}</text>
`;
}

/* ---------- stats.svg ---------- */
function renderStats(d) {
  const w = 860, h = 214;
  const metrics = [
    { label: "Коммиты за год", value: d.commits, color: PALETTE.title },
    { label: "Pull requests", value: d.prs, color: PALETTE.purple },
    { label: "Issues", value: d.issues, color: PALETTE.cyan },
    { label: "Звёзды", value: d.stars, color: PALETTE.green },
    { label: "Подписчики", value: d.followers, color: PALETTE.title },
    { label: "Репозитории", value: d.repos, color: PALETTE.purple },
  ];
  const inner = w - 56;
  const gap = inner / metrics.length;
  const startX = 28 + gap / 2;

  let s = shell(w, h, "Статистика", PALETTE.title);
  s += `  <line x1="28" y1="56" x2="${w - 28}" y2="56" stroke="${PALETTE.border}" stroke-width="1"/>\n`;

  metrics.forEach((m, i) => {
    const cx = startX + i * gap;
    s += `  <text x="${cx}" y="104" text-anchor="middle" font-size="30" font-weight="700" fill="${PALETTE.text}">${esc(nf(m.value))}</text>\n`;
    s += `  <rect x="${cx - 16}" y="116" width="32" height="3" rx="1.5" fill="${m.color}"/>\n`;
    s += `  <text x="${cx}" y="138" text-anchor="middle" font-size="12.5" fill="${PALETTE.muted}">${esc(m.label)}</text>\n`;
  });

  s += `  <line x1="28" y1="160" x2="${w - 28}" y2="160" stroke="${PALETTE.border}" stroke-width="1"/>\n`;
  const chips = [
    { t: `Серия: ${d.streak.current}`, c: PALETTE.cyan },
    { t: `Лучшая серия: ${d.streak.longest}`, c: PALETTE.purple },
    { t: `Всего в году: ${d.totalContributions}`, c: PALETTE.title },
    { t: `Приватные: ${d.restricted}`, c: PALETTE.green },
  ];
  let cx = 28;
  for (const c of chips) {
    const textW = esc(c.t).length * 7.0 + 26;
    s += `  <rect x="${cx}" y="176" width="${textW}" height="26" rx="13" fill="${PALETTE.bg2}" stroke="${PALETTE.border}"/>\n`;
    s += `  <circle cx="${cx + 13}" cy="189" r="3.5" fill="${c.c}"/>\n`;
    s += `  <text x="${cx + 23}" y="193" font-size="12.5" fill="${PALETTE.text}">${esc(c.t)}</text>\n`;
    cx += textW + 10;
  }
  return s + "</svg>\n";
}

/* ---------- langs.svg ---------- */
function renderLangs(langs) {
  const w = 860;
  const rowH = 30;
  const h = 96 + Math.max(langs.length, 1) * rowH;
  let s = shell(w, h, "Языки", PALETTE.purple);

  // stacked bar
  const bx = 28, bw = w - 56, by = 68, bh = 12;
  const total = langs.reduce((a, l) => a + l.size, 0) || 1;
  let x = bx;
  s += `  <clipPath id="barclip"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="6"/></clipPath>\n`;
  s += `  <g clip-path="url(#barclip)">\n`;
  for (const l of langs) {
    const seg = (l.size / total) * bw;
    s += `    <rect x="${x}" y="${by}" width="${seg}" height="${bh}" fill="${l.color}"/>\n`;
    x += seg;
  }
  s += `  </g>\n`;

  let y = by + bh + 34;
  for (const l of langs) {
    const pct = (l.size / total) * 100;
    s += `  <circle cx="${bx + 6}" cy="${y - 4}" r="5" fill="${l.color}"/>\n`;
    s += `  <text x="${bx + 20}" y="${y}" font-size="14" fill="${PALETTE.text}">${esc(l.name)}</text>\n`;
    s += `  <text x="${w - 28}" y="${y}" text-anchor="end" font-size="13" fill="${PALETTE.muted}">${pct.toFixed(1)}%</text>\n`;
    y += rowH;
  }
  if (!langs.length) {
    s += `  <text x="${bx}" y="${y}" font-size="14" fill="${PALETTE.muted}">Нет публичных данных</text>\n`;
  }
  return s + "</svg>\n";
}

/* ---------- activity.svg ---------- */
function renderActivity(rawWeeks) {
  const weeks = rawWeeks.map((w) => (w && w.contributionDays ? w.contributionDays : w));
  const w = 860, h = 196;
  let s = shell(w, h, "Активность за год", PALETTE.cyan);

  const cell = 11, gap = 3, step = cell + gap;
  const gridX = 46, gridY = 84;

  const all = [];
  weeks.forEach((wk) => wk.forEach((d) => all.push(d)));
  const max = Math.max(1, ...all.map((d) => d.contributionCount));
  const level = (n) => {
    if (n <= 0) return "#232434";
    const r = n / max;
    if (r <= 0.25) return "#2f334d";
    if (r <= 0.5) return "#3d59a1";
    if (r <= 0.75) return PALETTE.title;
    return PALETTE.purple;
  };

  // weekday labels (row 0 = Sunday)
  [[1, "Пн"], [3, "Ср"], [5, "Пт"]].forEach(([row, t]) => {
    s += `  <text x="20" y="${gridY + row * step + cell - 1}" font-size="10" fill="${PALETTE.muted}">${t}</text>\n`;
  });

  // month labels
  const months = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
  let lastMonth = -1;
  weeks.forEach((wk, wi) => {
    const first = wk.find((d) => d && d.date);
    if (!first) return;
    const m = new Date(first.date).getMonth();
    if (m !== lastMonth) {
      lastMonth = m;
      s += `  <text x="${gridX + wi * step}" y="${gridY - 10}" font-size="10" fill="${PALETTE.muted}">${months[m]}</text>\n`;
    }
  });

  // cells aligned by real weekday
  weeks.forEach((wk, wi) => {
    wk.forEach((d) => {
      const row = new Date(d.date).getDay();
      s += `  <rect x="${gridX + wi * step}" y="${gridY + row * step}" width="${cell}" height="${cell}" rx="2.5" fill="${level(d.contributionCount)}"><title>${esc(d.date)}: ${d.contributionCount}</title></rect>\n`;
    });
  });

  // legend (top-right, next to the title)
  const lx = w - 158;
  s += `  <text x="${lx - 10}" y="43" text-anchor="end" font-size="11" fill="${PALETTE.muted}">Меньше</text>\n`;
  const legendColors = ["#232434", "#2f334d", "#3d59a1", PALETTE.title, PALETTE.purple];
  legendColors.forEach((c, i) => {
    s += `  <rect x="${lx + i * step}" y="32" width="${cell}" height="${cell}" rx="2.5" fill="${c}"/>\n`;
  });
  s += `  <text x="${lx + 5 * step + 8}" y="43" font-size="11" fill="${PALETTE.muted}">Больше</text>\n`;

  return s + "</svg>\n";
}

(async () => {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "zxclushkin-profile-builder",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  const json = await res.json();
  if (!json.data || !json.data.user) {
    console.error("GraphQL error:", JSON.stringify(json).slice(0, 800));
    process.exit(1);
  }
  const u = json.data.user;
  const weeks = u.contributionsCollection.contributionCalendar.weeks;
  const days = flattenDays(u.contributionsCollection.contributionCalendar);
  const st = streaks(days);

  const langMap = new Map();
  let stars = 0;
  for (const r of u.repos.nodes) {
    stars += r.stargazerCount;
    for (const e of r.languages.edges) {
      const cur = langMap.get(e.node.name) || { size: 0, color: e.node.color || PALETTE.title };
      cur.size += e.size;
      if (e.node.color) cur.color = e.node.color;
      langMap.set(e.node.name, cur);
    }
  }
  const langs = [...langMap.entries()]
    .map(([name, v]) => ({ name, size: v.size, color: v.color }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 8);

  const data = {
    login: LOGIN,
    name: u.name,
    followers: u.followers.totalCount,
    following: u.following.totalCount,
    repos: u.repositories.totalCount,
    stars,
    commits: u.contributionsCollection.totalCommitContributions,
    prs: u.contributionsCollection.totalPullRequestContributions,
    issues: u.contributionsCollection.totalIssueContributions,
    restricted: u.contributionsCollection.restrictedContributionsCount,
    totalContributions: u.contributionsCollection.contributionCalendar.totalContributions,
    streak: { current: st.current, longest: st.longest },
    langs,
    daysCount: days.length,
  };

  fs.mkdirSync(OUTDIR, { recursive: true });
  fs.writeFileSync(path.join(OUTDIR, "stats.svg"), renderStats(data), "utf8");
  fs.writeFileSync(path.join(OUTDIR, "langs.svg"), renderLangs(langs), "utf8");
  fs.writeFileSync(path.join(OUTDIR, "activity.svg"), renderActivity(weeks), "utf8");
  console.log(JSON.stringify({ ...data, days: undefined }, null, 2));
})();

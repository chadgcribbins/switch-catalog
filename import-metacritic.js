#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const DEFAULT_OUT = path.join(__dirname, "metacritic_cache.json");
const DEFAULT_SOURCES = [
  path.join(__dirname, "nintendo_us_sales_import.json"),
  path.join(__dirname, "nintendo_uk_search_import.json"),
];

const DEFAULTS = {
  max: Infinity,
  concurrency: 2,
  delay: 250,
  refresh: false,
};

function parseArgs(argv) {
  const args = { ...DEFAULTS, out: DEFAULT_OUT, sources: [...DEFAULT_SOURCES] };
  let sourcesOnly = false;
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--max") {
      args.max = Number(argv[++i] ?? "0");
    } else if (arg === "--concurrency") {
      args.concurrency = Number(argv[++i] ?? "2");
    } else if (arg === "--delay") {
      args.delay = Number(argv[++i] ?? "0");
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--refresh") {
      args.refresh = true;
    } else if (arg === "--sources-only" || arg === "--no-defaults") {
      sourcesOnly = true;
      args.sources = [];
    } else if (arg === "--source") {
      const value = argv[++i];
      if (value) args.sources.push(value);
    }
  }
  if (sourcesOnly && args.sources.length === 0) {
    args.sources = [];
  }
  return args;
}

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getTitlesFromSources(paths) {
  const map = new Map();
  paths.forEach((filePath) => {
    const data = loadJson(filePath);
    let items = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (data && typeof data === "object") {
      if (Array.isArray(data.items)) {
        items = data.items;
      } else if (Array.isArray(data.owned)) {
        items = data.owned;
      } else if (Array.isArray(data.wishlist)) {
        items = data.wishlist;
      }
    }
    items.forEach((item) => {
      const title = item?.canonical_title || item?.title;
      const matchKey = normalizeTitle(title);
      if (!matchKey || map.has(matchKey)) return;
      map.set(matchKey, {
        title: String(title || "").trim(),
        searchUrl: item?.metacritic_search_url || "",
      });
    });
  });
  return [...map.values()];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Switch Stash Metacritic Import)",
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}`);
  }
  return response.json();
}

function getSearchUrl(title) {
  return `https://backend.metacritic.com/finder/metacritic/search/${encodeURIComponent(
    title
  )}/web?mcoTypeId=13&offset=0&limit=10`;
}

function scoreCandidate(candidate, targetKey) {
  if (!candidate) return 0;
  const titleKey = normalizeTitle(candidate.title);
  let score = 0;
  if (titleKey === targetKey) score += 10;
  if (titleKey.includes(targetKey) || targetKey.includes(titleKey)) score += 4;
  if (
    Array.isArray(candidate.platforms) &&
    candidate.platforms.some((platform) =>
      String(platform.name || "").toLowerCase().includes("nintendo switch")
    )
  ) {
    score += 6;
  }
  if (candidate.criticScoreSummary?.score !== null) score += 1;
  return score;
}

function pickCandidate(items, targetKey) {
  let best = null;
  let bestScore = -1;
  items.forEach((candidate) => {
    const score = scoreCandidate(candidate, targetKey);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  });
  return best;
}

async function fetchUserScore(slug) {
  const url = `https://backend.metacritic.com/reviews/metacritic/user/games/${slug}/stats/web?componentName=user-score-summary&componentDisplayName=User+Score+Summary&componentType=MetaScoreSummary`;
  const data = await fetchJson(url);
  return {
    score: data?.data?.item?.score ?? null,
    reviewCount: data?.data?.item?.reviewCount ?? null,
  };
}

async function enrichTitle(entry) {
  const targetKey = normalizeTitle(entry.title);
  const searchUrl = entry.searchUrl || getSearchUrl(entry.title);
  const searchData = await fetchJson(searchUrl);
  const items = searchData?.data?.items || [];
  const candidate = pickCandidate(items, targetKey);
  if (!candidate) {
    return {
      matchKey: targetKey,
      title: entry.title,
      status: "missing",
    };
  }

  const slug = candidate.slug;
  const metascore = candidate.criticScoreSummary?.score ?? null;
  const userScore = await fetchUserScore(slug);

  return {
    matchKey: targetKey,
    title: entry.title,
    slug,
    url: `https://www.metacritic.com/game/${slug}/`,
    metascore,
    userscore: userScore.score,
    userscore_reviews: userScore.reviewCount,
    updated_at: new Date().toISOString(),
  };
}

async function runQueue(items, worker, concurrency, delayMs) {
  let index = 0;
  async function next() {
    if (index >= items.length) return;
    const current = index;
    index += 1;
    await worker(items[current], current);
    if (delayMs) await delay(delayMs);
    return next();
  }
  const workers = Array.from({ length: concurrency }, () => next());
  await Promise.all(workers);
}

async function main() {
  const args = parseArgs(process.argv);
  const max = Number.isFinite(args.max) ? args.max : Infinity;
  const titles = getTitlesFromSources(args.sources);
  const cacheRaw = loadJson(args.out);
  const cache =
    cacheRaw && typeof cacheRaw === "object" && !Array.isArray(cacheRaw)
      ? cacheRaw
      : {};

  const pending = titles
    .filter((entry) => entry.title)
    .filter((entry) => {
      const key = normalizeTitle(entry.title);
      if (!key) return false;
      if (args.refresh) return true;
      return !cache[key];
    })
    .slice(0, max);

  console.log(
    `Metacritic import: ${pending.length} of ${titles.length} titles.`
  );

  await runQueue(
    pending,
    async (entry, idx) => {
      const key = normalizeTitle(entry.title);
      try {
        const result = await enrichTitle(entry);
        cache[key] = result;
        if ((idx + 1) % 25 === 0) {
          console.log(`Processed ${idx + 1}/${pending.length}...`);
          saveJson(args.out, cache);
        }
      } catch (error) {
        cache[key] = {
          matchKey: key,
          title: entry.title,
          status: "error",
          error: error.message || String(error),
          updated_at: new Date().toISOString(),
        };
      }
    },
    args.concurrency,
    args.delay
  );

  saveJson(args.out, cache);
  console.log(`Saved Metacritic cache to ${args.out}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

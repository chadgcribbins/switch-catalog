#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const DEFAULT_OUT = path.join(__dirname, "igdb_cache.json");
const TOKEN_PATH = path.join(__dirname, "igdb_token.json");
const ENV_PATH = path.join(__dirname, ".env.local");
const DEFAULT_SOURCES = [
  path.join(__dirname, "owned.json"),
  path.join(__dirname, "wish_list.json"),
  path.join(__dirname, "nintendo_us_sales_import.json"),
  path.join(__dirname, "nintendo_uk_search_import.json"),
];

const DEFAULTS = {
  max: Infinity,
  concurrency: 2,
  delay: 250,
  refresh: false,
  refreshMissing: false,
  recentMonths: 3,
  platformId: 130,
};

const CATEGORY_LABELS = {
  0: "main_game",
  1: "dlc_addon",
  2: "expansion",
  3: "bundle",
  4: "standalone_expansion",
  5: "mod",
  6: "episode",
  7: "season",
  8: "remake",
  9: "remaster",
  10: "expanded_game",
  11: "port",
  12: "fork",
  13: "pack",
};

const STATUS_LABELS = {
  0: "released",
  2: "alpha",
  3: "beta",
  4: "early_access",
  5: "offline",
  6: "canceled",
  7: "rumored",
  8: "delisted",
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
    } else if (arg === "--refresh-missing") {
      args.refreshMissing = true;
    } else if (arg === "--recent-months") {
      args.recentMonths = Number(argv[++i] ?? "0");
    } else if (arg === "--platform") {
      args.platformId = Number(argv[++i] ?? "0");
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

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return;
  const lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (!key) return;
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

function extractItems(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.owned)) return data.owned;
    if (Array.isArray(data.wishlist)) return data.wishlist;
  }
  return [];
}

function isStoreSource(filePath) {
  const base = path.basename(filePath);
  return base.startsWith("nintendo_") || base === "store_catalog.json";
}

function parseReleaseTimestamp(item) {
  const candidates = [
    item?.release_date,
    item?.release_date_display,
    item?.release_pretty,
    item?.release_dates,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (Array.isArray(candidate) && candidate.length) {
      const ts = Date.parse(candidate[0]);
      if (Number.isFinite(ts)) return ts;
    } else if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    } else if (typeof candidate === "string") {
      const ts = Date.parse(candidate);
      if (Number.isFinite(ts)) return ts;
    }
  }
  return null;
}

function getTitlesFromSources(paths, recentMonths) {
  const map = new Map();
  const now = Date.now();
  const recentMs =
    Number.isFinite(recentMonths) && recentMonths > 0
      ? recentMonths * 30 * 24 * 60 * 60 * 1000
      : 0;

  paths.forEach((filePath) => {
    const data = loadJson(filePath);
    const items = extractItems(data);
    const storeSource = isStoreSource(filePath);

    items.forEach((item) => {
      const title =
        item?.canonical_title || item?.title || item?.name || item?.label;
      if (!title) return;
      if (storeSource && recentMs) {
        const ts = parseReleaseTimestamp(item);
        if (!ts || now - ts > recentMs) return;
      }
      const key = normalizeTitle(title);
      if (!key || map.has(key)) return;
      map.set(key, {
        title: String(title).trim(),
        searchUrl: item?.igdb_search_url || "",
      });
    });
  });

  return [...map.values()];
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extractCompanies(involved) {
  const developers = new Set();
  const publishers = new Set();

  normalizeArray(involved).forEach((entry) => {
    const name = entry?.company?.name;
    if (!name) return;
    if (entry.developer) developers.add(name);
    if (entry.publisher) publishers.add(name);
  });

  return {
    developers: [...developers],
    publishers: [...publishers],
  };
}

function pickFieldNames(list) {
  return normalizeArray(list)
    .map((entry) => entry?.name)
    .filter(Boolean);
}

function normalizeImageUrl(url, size) {
  if (!url) return "";
  const cleaned = url.startsWith("//") ? `https:${url}` : url;
  if (!size) return cleaned;
  return cleaned.replace(/t_[^/]+/g, size);
}

function scoreCandidate(candidate, targetKey) {
  if (!candidate) return 0;
  let score = 0;
  const nameKey = normalizeTitle(candidate.name);
  if (nameKey === targetKey) score += 12;
  if (nameKey.includes(targetKey) || targetKey.includes(nameKey)) score += 4;

  const altNames = normalizeArray(candidate.alternative_names).map(
    (alt) => alt?.name
  );
  altNames.forEach((alt) => {
    const altKey = normalizeTitle(alt);
    if (!altKey) return;
    if (altKey === targetKey) score += 8;
    if (altKey.includes(targetKey) || targetKey.includes(altKey)) score += 3;
  });

  if (
    normalizeArray(candidate.platforms).some((platform) =>
      String(platform?.name || "")
        .toLowerCase()
        .includes("nintendo switch")
    )
  ) {
    score += 2;
  }

  if (Number.isFinite(candidate.aggregated_rating_count)) {
    score += Math.min(candidate.aggregated_rating_count / 50, 4);
  } else if (Number.isFinite(candidate.rating_count)) {
    score += Math.min(candidate.rating_count / 50, 3);
  }

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

function mapCandidate(candidate, entry) {
  const companies = extractCompanies(candidate.involved_companies);
  return {
    matchKey: normalizeTitle(entry.title),
    title: entry.title,
    igdb_id: candidate.id ?? null,
    name: candidate.name || "",
    slug: candidate.slug || "",
    url: candidate.url || "",
    category: candidate.category ?? null,
    category_label:
      CATEGORY_LABELS[candidate.category] || String(candidate.category ?? ""),
    status: candidate.status ?? null,
    status_label:
      STATUS_LABELS[candidate.status] || String(candidate.status ?? ""),
    summary: candidate.summary || "",
    storyline: candidate.storyline || "",
    rating: candidate.rating ?? null,
    rating_count: candidate.rating_count ?? null,
    aggregated_rating: candidate.aggregated_rating ?? null,
    aggregated_rating_count: candidate.aggregated_rating_count ?? null,
    total_rating: candidate.total_rating ?? null,
    total_rating_count: candidate.total_rating_count ?? null,
    hypes: candidate.hypes ?? null,
    first_release_date: candidate.first_release_date ?? null,
    genres: pickFieldNames(candidate.genres),
    themes: pickFieldNames(candidate.themes),
    franchises: pickFieldNames(candidate.franchises),
    game_modes: pickFieldNames(candidate.game_modes),
    player_perspectives: pickFieldNames(candidate.player_perspectives),
    platforms: pickFieldNames(candidate.platforms),
    alternative_names: pickFieldNames(candidate.alternative_names),
    developers: companies.developers,
    publishers: companies.publishers,
    release_dates: normalizeArray(candidate.release_dates).map((release) => ({
      date: release?.date ?? null,
      platform: release?.platform ?? null,
    })),
    cover: normalizeImageUrl(candidate.cover?.url, "t_cover_big"),
    screenshots: normalizeArray(candidate.screenshots).map((shot) =>
      normalizeImageUrl(shot?.url, "t_screenshot_huge")
    ),
    artworks: normalizeArray(candidate.artworks).map((art) =>
      normalizeImageUrl(art?.url, "t_screenshot_huge")
    ),
    websites: normalizeArray(candidate.websites)
      .map((site) => site?.url)
      .filter(Boolean),
    updated_at: new Date().toISOString(),
  };
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed ${response.status}: ${text}`);
  }
  return response.json();
}

async function fetchAccessToken(clientId, clientSecret) {
  const url = new URL("https://id.twitch.tv/oauth2/token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");
  const data = await fetchJson(url.toString(), { method: "POST" });
  return {
    access_token: data.access_token,
    token_type: data.token_type || "bearer",
    expires_in: data.expires_in,
    expires_at: Date.now() + Math.max(0, data.expires_in - 60) * 1000,
  };
}

async function getAccessToken() {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing IGDB_CLIENT_ID or IGDB_CLIENT_SECRET.");
  }

  const cached = loadJson(TOKEN_PATH);
  if (
    cached &&
    cached.access_token &&
    Number.isFinite(cached.expires_at) &&
    cached.expires_at > Date.now()
  ) {
    return cached.access_token;
  }

  const token = await fetchAccessToken(clientId, clientSecret);
  saveJson(TOKEN_PATH, token);
  return token.access_token;
}

async function igdbRequest(pathName, query, token) {
  const clientId = process.env.IGDB_CLIENT_ID;
  const response = await fetch(`https://api.igdb.com/v4/${pathName}`, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body: query,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IGDB request failed ${response.status}: ${text}`);
  }
  return response.json();
}

async function fetchIgdbEntry(entry, platformId, token) {
  const title = entry.title;
  const escaped = String(title).replace(/"/g, '\\"');
  const fields = [
    "id",
    "name",
    "slug",
    "category",
    "status",
    "summary",
    "storyline",
    "url",
    "rating",
    "rating_count",
    "aggregated_rating",
    "aggregated_rating_count",
    "total_rating",
    "total_rating_count",
    "hypes",
    "first_release_date",
    "genres.name",
    "themes.name",
    "franchises.name",
    "game_modes.name",
    "player_perspectives.name",
    "platforms.name",
    "alternative_names.name",
    "release_dates.date",
    "release_dates.platform",
    "cover.url",
    "screenshots.url",
    "artworks.url",
    "websites.url",
    "involved_companies.company.name",
    "involved_companies.developer",
    "involved_companies.publisher",
  ];
  const fieldList = fields.join(",");

  const queryWithPlatform = `search "${escaped}"; fields ${fieldList}; where platforms = (${platformId}); limit 10;`;
  let results = await igdbRequest("games", queryWithPlatform, token);

  if (!results.length) {
    const queryNoPlatform = `search "${escaped}"; fields ${fieldList}; limit 10;`;
    results = await igdbRequest("games", queryNoPlatform, token);
  }

  if (!results.length) {
    return {
      matchKey: normalizeTitle(title),
      title,
      status: "missing",
    };
  }

  const candidate = pickCandidate(results, normalizeTitle(title));
  if (!candidate) {
    return {
      matchKey: normalizeTitle(title),
      title,
      status: "missing",
    };
  }

  return mapCandidate(candidate, entry);
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

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function needsRefresh(entry) {
  if (!entry || typeof entry !== "object") return true;
  if (entry.status === "missing" || entry.status === "error") return false;
  return !(
    hasOwn(entry, "total_rating") &&
    hasOwn(entry, "total_rating_count") &&
    hasOwn(entry, "hypes") &&
    hasOwn(entry, "category") &&
    hasOwn(entry, "status")
  );
}

async function main() {
  loadEnvFile();
  const args = parseArgs(process.argv);
  const titles = getTitlesFromSources(args.sources, args.recentMonths);
  const max = Number.isFinite(args.max) ? args.max : Infinity;
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
      if (args.refreshMissing) {
        return !cache[key] || needsRefresh(cache[key]);
      }
      return !cache[key];
    })
    .slice(0, max);

  console.log(`IGDB import: ${pending.length} of ${titles.length} titles.`);

  if (!pending.length) {
    return;
  }

  const token = await getAccessToken();

  await runQueue(
    pending,
    async (entry, idx) => {
      const key = normalizeTitle(entry.title);
      try {
        const result = await fetchIgdbEntry(entry, args.platformId, token);
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
  console.log(`Saved IGDB cache to ${args.out}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

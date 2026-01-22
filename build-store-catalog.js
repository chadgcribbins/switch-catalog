#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const SOURCE_US = path.join(__dirname, "nintendo_us_sales_import.json");
const SOURCE_UK = path.join(__dirname, "nintendo_uk_search_import.json");
const META_PATH = path.join(__dirname, "metacritic_cache.json");
const IGDB_PATH = path.join(__dirname, "igdb_cache.json");
const DEFAULT_OUT = path.join(__dirname, "store_catalog.json");

const DEFAULTS = {
  metascoreMin: 45,
  popularityMin: null,
  recentMonths: 3,
  requireReleaseDate: true,
};

function parseArgs(argv) {
  const args = { ...DEFAULTS, out: DEFAULT_OUT };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--metascore") {
      args.metascoreMin = Number(argv[++i] ?? "0");
    } else if (arg === "--popularity") {
      args.popularityMin = Number(argv[++i] ?? "0");
    } else if (arg === "--recent-months") {
      args.recentMonths = Number(argv[++i] ?? "0");
    } else if (arg === "--require-release") {
      args.requireReleaseDate = true;
    } else if (arg === "--allow-missing-release") {
      args.requireReleaseDate = false;
    } else if (arg === "--out") {
      args.out = argv[++i];
    }
  }
  return args;
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(num) ? num : null;
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function mergeArray(base, incoming) {
  return [...new Set([...normalizeArray(base), ...normalizeArray(incoming)])].filter(
    (item) => item !== null && item !== undefined && item !== ""
  );
}

function extractTags(item) {
  const bucket = [];
  const pushTag = (tag) => {
    if (!tag && tag !== 0) return;
    if (Array.isArray(tag)) {
      tag.forEach(pushTag);
      return;
    }
    const cleaned = String(tag).trim();
    if (!cleaned) return;
    cleaned
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => bucket.push(part.toLowerCase()));
  };

  pushTag(item.tags);
  pushTag(item.genres);
  pushTag(item.genre);
  pushTag(item.categories);
  pushTag(item.category);

  if (item.is_cloud_version) bucket.push("cloud");
  if (item.is_demo) bucket.push("demo");
  if (item.is_nso_app) bucket.push("nso");

  return [...new Set(bucket)];
}

function parsePlayersFromTag(tag) {
  const range = tag.match(/(\d+)\s*(?:-|to)\s*(\d+)/);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]) };
  }
  const single = tag.match(/(\d+)/);
  if (single) {
    return { min: Number(single[1]), max: Number(single[1]) };
  }
  return null;
}

function extractPlayers(item, tags) {
  const min = parseNumber(item.players_min ?? item.min_players);
  const max = parseNumber(item.players_max ?? item.max_players);
  if (min || max) {
    return {
      min: min || max || null,
      max: max || min || null,
    };
  }

  const playerString = item.players || item.player_count || item.player_range;
  const fromString = playerString
    ? parsePlayersFromTag(String(playerString).toLowerCase())
    : null;
  if (fromString) return fromString;

  for (const tag of tags) {
    if (tag.includes("player") || tag.match(/\d+p/)) {
      const parsed = parsePlayersFromTag(tag);
      if (parsed) return parsed;
    }
  }

  return { min: null, max: null };
}

function getRegionCurrency(region) {
  if (region === "US") return "USD";
  if (region === "UK") return "GBP";
  if (region === "EU") return "EUR";
  return "";
}

function normalizePrices(rawPrices) {
  if (!rawPrices || typeof rawPrices !== "object") return null;
  const output = {};
  Object.entries(rawPrices).forEach(([region, entry]) => {
    if (!entry || typeof entry !== "object") return;
    const price = parseNumber(entry.price ?? entry.price_lowest);
    const discount = parseNumber(entry.discount ?? entry.discount_percent);
    output[region] = {
      price,
      discount,
      currency: entry.currency || getRegionCurrency(region),
      url: entry.url || entry.nintendo_url || "",
    };
  });
  return Object.keys(output).length ? output : null;
}

function normalizeItem(item) {
  const title = String(item.canonical_title || item.title || "Untitled").trim();
  const tags = extractTags(item);
  const players = extractPlayers(item, tags);
  const regions = Array.isArray(item.regions)
    ? item.regions.filter(Boolean)
    : item.region
      ? [item.region]
      : [];
  const ownership = item.ownership || "";
  const metascore = parseNumber(item.metacritic_metascore ?? item.metascore);
  const userscore = parseNumber(item.metacritic_userscore ?? item.userscore);
  const discountRaw =
    parseNumber(item.discount_percent ?? item.discount ?? item.discount_pct) ??
    parseNumber(item.discountPercent ?? item.sale_discount);
  const discount =
    discountRaw && discountRaw > 0 && discountRaw <= 1
      ? discountRaw * 100
      : discountRaw;
  const popularity = parseNumber(
    item.popularity ?? item.popularity_score ?? item.popularity_index
  );
  const releaseRaw =
    item.release_pretty ||
    item.release_date_display ||
    item.release_date ||
    (Array.isArray(item.release_dates) ? item.release_dates[0] : item.release_dates) ||
    "";
  const releaseTimestamp = releaseRaw ? Date.parse(releaseRaw) : null;
  const imageSquare =
    item.image_square ||
    item.imageSquare ||
    item.image ||
    item.imageUrl ||
    item.image_url;
  const imageWide = item.image_wide || item.imageWide;
  const price = parseNumber(
    item.price_lowest ??
      item.price ??
      item.sale_price ??
      item.current_price ??
      item.price_amount
  );
  const currency =
    item.currency ||
    item.price_currency ||
    item.price_lowest_currency ||
    item.currency_code ||
    (regions.includes("UK")
      ? "GBP"
      : regions.includes("US")
        ? "USD"
        : "");
  let prices = normalizePrices(item.prices);
  const primaryRegion = item.region || regions[0] || "";
  if (!prices && primaryRegion && price !== null) {
    prices = {
      [primaryRegion]: {
        price,
        discount,
        currency: currency || getRegionCurrency(primaryRegion),
        url: item.nintendo_url || item.nintendoUrl || item.url || "",
      },
    };
  }

  return {
    title,
    canonical_title: title,
    matchKey: normalizeTitle(title),
    type: item.type || "",
    platform: item.platform || "",
    regions,
    tags,
    ownership,
    is_demo: Boolean(item.is_demo),
    is_cloud_version: Boolean(item.is_cloud_version),
    is_nso_app: Boolean(item.is_nso_app),
    players_min: players.min,
    players_max: players.max,
    discount_percent: discount,
    popularity,
    metacritic_userscore_reviews: parseNumber(
      item.metacritic_userscore_reviews ?? item.userscore_reviews
    ),
    release_date: item.release_date || "",
    release_date_display: item.release_date_display || "",
    release_pretty: item.release_pretty || "",
    release_dates: item.release_dates || [],
    release_timestamp: Number.isFinite(releaseTimestamp) ? releaseTimestamp : null,
    image_square: imageSquare || "",
    image_wide: imageWide || "",
    nintendo_url: item.nintendo_url || item.nintendoUrl || item.url || "",
    metacritic_metascore: metascore,
    metacritic_userscore: userscore,
    metacritic_url: item.metacritic_url || item.metacriticUrl || "",
    metacritic_search_url: item.metacritic_search_url || "",
    notes: item.notes || "",
    publisher: item.publisher || "",
    age_rating: item.age_rating || "",
    age_rating_value: parseNumber(item.age_rating_value),
    age_rating_code: item.age_rating_code || "",
    nsuid: mergeArray([], item.nsuid || item.nsuid_txt || []),
    sku: item.sku || "",
    fs_id: item.fs_id || "",
    system_names: mergeArray([], item.system_names || item.system_names_txt || []),
    playable_on: mergeArray([], item.playable_on || item.playable_on_txt || []),
    prices,
    sources: Array.isArray(item.sources)
      ? item.sources
      : item.source
        ? [item.source]
        : [],
  };
}

function mergeStoreCatalogs(items) {
  const map = new Map();

  items.forEach((item) => {
    if (!item.matchKey) return;
    let entry = map.get(item.matchKey);
    if (!entry) {
      entry = {
        ...item,
        tags: [...item.tags],
        regions: [...item.regions],
        sources: [...(item.sources || [])],
        prices: {},
      };
      map.set(item.matchKey, entry);
    }

    entry.tags = [...new Set([...entry.tags, ...item.tags])];
    entry.regions = [...new Set([...entry.regions, ...item.regions])];
    entry.sources = [...new Set([...entry.sources, ...(item.sources || [])])];

    if (!entry.players_min && item.players_min) entry.players_min = item.players_min;
    if (!entry.players_max && item.players_max) entry.players_max = item.players_max;
    if (!entry.type && item.type) entry.type = item.type;
    if (!entry.platform && item.platform) entry.platform = item.platform;
    if (!entry.notes && item.notes) entry.notes = item.notes;
    if (!entry.publisher && item.publisher) entry.publisher = item.publisher;
    if (!entry.age_rating && item.age_rating) entry.age_rating = item.age_rating;
    if (!entry.age_rating_value && item.age_rating_value) {
      entry.age_rating_value = item.age_rating_value;
    }
    if (!entry.age_rating_code && item.age_rating_code) {
      entry.age_rating_code = item.age_rating_code;
    }
    if (!entry.sku && item.sku) entry.sku = item.sku;
    if (!entry.fs_id && item.fs_id) entry.fs_id = item.fs_id;
    if (!entry.metacritic_userscore_reviews && item.metacritic_userscore_reviews) {
      entry.metacritic_userscore_reviews = item.metacritic_userscore_reviews;
    }
    entry.is_demo = entry.is_demo || item.is_demo;
    entry.is_cloud_version = entry.is_cloud_version || item.is_cloud_version;
    entry.is_nso_app = entry.is_nso_app || item.is_nso_app;
    entry.nsuid = mergeArray(entry.nsuid, item.nsuid);
    entry.system_names = mergeArray(entry.system_names, item.system_names);
    entry.playable_on = mergeArray(entry.playable_on, item.playable_on);
    if (!entry.metacritic_metascore && item.metacritic_metascore) {
      entry.metacritic_metascore = item.metacritic_metascore;
    }
    if (!entry.metacritic_userscore && item.metacritic_userscore) {
      entry.metacritic_userscore = item.metacritic_userscore;
    }
    if (!entry.release_timestamp && item.release_timestamp) {
      entry.release_timestamp = item.release_timestamp;
      entry.release_date = item.release_date;
      entry.release_date_display = item.release_date_display;
      entry.release_pretty = item.release_pretty;
      entry.release_dates = item.release_dates;
    }
    if (!entry.image_wide && item.image_wide) entry.image_wide = item.image_wide;
    if (!entry.image_square && item.image_square) entry.image_square = item.image_square;
    if (
      (entry.popularity === null || entry.popularity === undefined) &&
      item.popularity !== null &&
      item.popularity !== undefined
    ) {
      entry.popularity = item.popularity;
    }

    const priceSources = item.prices || {};
    Object.entries(priceSources).forEach(([region, detail]) => {
      if (!detail) return;
      entry.prices[region] = {
        price: parseNumber(detail.price),
        discount: parseNumber(detail.discount),
        currency: detail.currency || getRegionCurrency(region),
        url: detail.url || "",
      };
    });
  });

  return [...map.values()];
}

function loadMetacriticCache() {
  const data = loadJson(META_PATH);
  if (!data) return new Map();
  if (Array.isArray(data)) {
    return new Map(
      data
        .map((entry) => [
          entry.matchKey || normalizeTitle(entry.title),
          entry,
        ])
        .filter(([key]) => key)
    );
  }
  if (data.items && Array.isArray(data.items)) {
    return new Map(
      data.items
        .map((entry) => [
          entry.matchKey || normalizeTitle(entry.title),
          entry,
        ])
        .filter(([key]) => key)
    );
  }
  return new Map(Object.entries(data));
}

function attachMetacritic(items, cache) {
  items.forEach((item) => {
    const entry = cache.get(item.matchKey);
    if (!entry) return;
    if (entry.metascore !== null && entry.metascore !== undefined) {
      item.metacritic_metascore = parseNumber(entry.metascore);
    }
    if (entry.userscore !== null && entry.userscore !== undefined) {
      item.metacritic_userscore = parseNumber(entry.userscore);
    }
    if (entry.userscore_reviews !== null && entry.userscore_reviews !== undefined) {
      item.metacritic_userscore_reviews = parseNumber(entry.userscore_reviews);
    }
    if (entry.url && !item.metacritic_url) {
      item.metacritic_url = entry.url;
    }
  });
}

function loadIgdbCache() {
  const data = loadJson(IGDB_PATH);
  if (!data) return new Map();
  if (Array.isArray(data)) {
    return new Map(
      data
        .map((entry) => [
          entry.matchKey || normalizeTitle(entry.title),
          entry,
        ])
        .filter(([key]) => key)
    );
  }
  if (data.items && Array.isArray(data.items)) {
    return new Map(
      data.items
        .map((entry) => [
          entry.matchKey || normalizeTitle(entry.title),
          entry,
        ])
        .filter(([key]) => key)
    );
  }
  return new Map(Object.entries(data));
}

function normalizeIgdbImage(url, size) {
  if (!url) return "";
  const cleaned = url.startsWith("//") ? `https:${url}` : url;
  if (!size) return cleaned;
  return cleaned.replace(/t_[^/]+/g, size);
}

function attachIgdb(items, cache) {
  items.forEach((item) => {
    const entry = cache.get(item.matchKey);
    if (!entry) return;

    item.igdb_id = entry.igdb_id ?? entry.id ?? null;
    item.igdb_slug = entry.slug || "";
    item.igdb_url = entry.url || "";
    item.igdb_category = entry.category ?? null;
    item.igdb_category_label = entry.category_label || "";
    item.igdb_status = entry.status ?? null;
    item.igdb_status_label = entry.status_label || "";
    item.igdb_summary = entry.summary || "";
    item.igdb_storyline = entry.storyline || "";
    item.igdb_rating = parseNumber(entry.rating);
    item.igdb_rating_count = parseNumber(entry.rating_count);
    item.igdb_aggregated_rating = parseNumber(entry.aggregated_rating);
    item.igdb_aggregated_rating_count = parseNumber(
      entry.aggregated_rating_count
    );
    item.igdb_total_rating = parseNumber(entry.total_rating);
    item.igdb_total_rating_count = parseNumber(entry.total_rating_count);
    item.igdb_hypes = parseNumber(entry.hypes);
    item.igdb_first_release_date = parseNumber(entry.first_release_date);
    item.igdb_genres = normalizeArray(entry.genres);
    item.igdb_themes = normalizeArray(entry.themes);
    item.igdb_franchises = normalizeArray(entry.franchises);
    item.igdb_game_modes = normalizeArray(entry.game_modes);
    item.igdb_player_perspectives = normalizeArray(entry.player_perspectives);
    item.igdb_platforms = normalizeArray(entry.platforms);
    item.igdb_alternative_names = normalizeArray(entry.alternative_names);
    item.igdb_developers = normalizeArray(entry.developers);
    item.igdb_publishers = normalizeArray(entry.publishers);
    item.igdb_release_dates = normalizeArray(entry.release_dates);
    item.igdb_cover = normalizeIgdbImage(entry.cover, "t_cover_big");
    item.igdb_screenshots = normalizeArray(entry.screenshots)
      .map((shot) => normalizeIgdbImage(shot, "t_screenshot_huge"))
      .filter(Boolean);
    item.igdb_artworks = normalizeArray(entry.artworks)
      .map((art) => normalizeIgdbImage(art, "t_screenshot_huge"))
      .filter(Boolean);
    item.igdb_websites = normalizeArray(entry.websites);
    item.igdb_updated_at = entry.updated_at || "";

    if (!item.notes && item.igdb_summary) {
      item.notes = item.igdb_summary;
    }
    if (!item.publisher && item.igdb_publishers.length) {
      item.publisher = item.igdb_publishers.join(", ");
    }

    const igdbTags = [
      ...item.igdb_genres,
      ...item.igdb_themes,
      ...item.igdb_franchises,
      ...item.igdb_game_modes,
      ...item.igdb_player_perspectives,
    ]
      .map((tag) => String(tag).trim().toLowerCase())
      .filter(Boolean);
    if (igdbTags.length) {
      item.tags = [...new Set([...item.tags, ...igdbTags])];
    }

    if (!item.image_square && item.igdb_cover) {
      item.image_square = item.igdb_cover;
    }
    if (!item.image_wide && item.igdb_screenshots.length) {
      item.image_wide = item.igdb_screenshots[0];
    }

    if (
      !item.release_timestamp &&
      Number.isFinite(item.igdb_first_release_date)
    ) {
      const ts = item.igdb_first_release_date * 1000;
      item.release_timestamp = ts;
      item.release_date = new Date(ts).toISOString();
    }
  });
}

function applyPopularityFallback(items) {
  const values = items
    .map((item) => item.popularity)
    .filter((value) => Number.isFinite(value));
  const unique = [...new Set(values)];
  const placeholder =
    unique.length === 1 && (unique[0] === 300 || unique[0] === 0)
      ? unique[0]
      : null;

  items.forEach((item) => {
    if (placeholder !== null && item.popularity === placeholder) {
      item.popularity = null;
    }
    const igdbCount =
      parseNumber(item.igdb_rating_count) ??
      parseNumber(item.igdb_aggregated_rating_count);
    const igdbTotalCount = parseNumber(item.igdb_total_rating_count);
    if (
      (item.popularity === null || item.popularity === undefined) &&
      Number.isFinite(igdbTotalCount)
    ) {
      item.popularity = igdbTotalCount;
    }
    if (
      (item.popularity === null || item.popularity === undefined) &&
      Number.isFinite(igdbCount)
    ) {
      item.popularity = igdbCount;
    }
    if (
      (item.popularity === null || item.popularity === undefined) &&
      Number.isFinite(item.igdb_hypes)
    ) {
      item.popularity = item.igdb_hypes;
    }
    if (
      (item.popularity === null || item.popularity === undefined) &&
      Number.isFinite(item.metacritic_userscore_reviews)
    ) {
      item.popularity = item.metacritic_userscore_reviews;
    }
  });
}

function computeStats(items) {
  const metascores = items
    .map((item) => item.metacritic_metascore)
    .filter((value) => Number.isFinite(value));
  const popularity = items
    .map((item) => item.popularity)
    .filter((value) => Number.isFinite(value));
  const avg = (values) =>
    values.length
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) /
        100
      : null;
  const median = (values) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100
      : sorted[mid];
  };
  const percentile = (values, pct) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(
      sorted.length - 1,
      Math.max(0, Math.floor(sorted.length * pct))
    );
    return sorted[idx];
  };

  return {
    avg_metascore: avg(metascores),
    avg_popularity: avg(popularity),
    popularity_median: median(popularity),
    p75_popularity: percentile(popularity, 0.75),
    popularity_max: popularity.length ? Math.max(...popularity) : null,
  };
}

function buildFilter({ metascoreMin, popularityMin, recentMonths, requireReleaseDate }) {
  const now = Date.now();
  const recentMs = recentMonths ? recentMonths * 30 * 24 * 60 * 60 * 1000 : 0;
  return (item) => {
    const metascore = item.metacritic_metascore;
    if (Number.isFinite(metascore)) {
      return metascore >= metascoreMin;
    }
    const hasRelease = Number.isFinite(item.release_timestamp);
    if (!hasRelease && requireReleaseDate) return false;
    if (!hasRelease && !requireReleaseDate) {
      const popularityOk =
        popularityMin === null || popularityMin === undefined
          ? true
          : Number.isFinite(item.popularity) && item.popularity >= popularityMin;
      return popularityOk;
    }
    const isRecent = recentMs ? now - item.release_timestamp <= recentMs : true;
    const popularityOk =
      popularityMin === null || popularityMin === undefined
        ? true
        : Number.isFinite(item.popularity) && item.popularity >= popularityMin;
    return isRecent && popularityOk;
  };
}

function main() {
  const args = parseArgs(process.argv);
  const usRaw = loadJson(SOURCE_US) || [];
  const ukRaw = loadJson(SOURCE_UK) || [];
  const normalized = [...usRaw, ...ukRaw].map((item) => normalizeItem(item));
  const merged = mergeStoreCatalogs(normalized);
  const metaCache = loadMetacriticCache();
  attachMetacritic(merged, metaCache);
  const igdbCache = loadIgdbCache();
  attachIgdb(merged, igdbCache);
  applyPopularityFallback(merged);

  const stats = computeStats(merged);
  const popularityMin =
    Number.isFinite(args.popularityMin) && args.popularityMin > 0
      ? args.popularityMin
      : stats.avg_popularity ?? stats.p75_popularity ?? 0;
  const filter = buildFilter({
    metascoreMin: args.metascoreMin,
    popularityMin,
    recentMonths: args.recentMonths,
    requireReleaseDate: args.requireReleaseDate,
  });

  const filtered = merged.filter(filter);
  const metadata = {
    generated: new Date().toISOString(),
    last_refreshed: new Date().toISOString(),
    sources: [
      "nintendo_us_sales_import.json",
      "nintendo_uk_search_import.json",
      "metacritic_cache.json",
      "igdb_cache.json",
    ],
    filters: {
      metascore_min: args.metascoreMin,
      popularity_min: popularityMin,
      recent_months: args.recentMonths,
      require_release_date: args.requireReleaseDate,
    },
    stats: {
      total_raw: merged.length,
      total_kept: filtered.length,
      ...stats,
    },
  };

  saveJson(args.out, { metadata, items: filtered });
  console.log(
    `Saved ${filtered.length} of ${merged.length} titles to ${args.out}`
  );
}

main();

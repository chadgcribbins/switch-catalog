#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const OWNED_PATH = path.join(__dirname, "catalog.json");
const CATALOGS = [
  {
    path: path.join(__dirname, "nintendo_us_sales_import.json"),
    label: "US",
  },
  {
    path: path.join(__dirname, "nintendo_uk_search_import.json"),
    label: "UK",
  },
];

const FIELD_PRIORITY = [
  "players_min",
  "players_max",
  "discount_percent",
  "price_lowest",
  "popularity",
  "release_date",
  "release_date_display",
  "release_pretty",
  "publisher",
  "nintendo_url",
  "image_square",
  "image_wide",
  "nsuid",
  "sku",
  "age_rating",
  "age_rating_value",
  "age_rating_code",
];

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function mergeArrays(base, extras) {
  const merged = new Set([...(base || []), ...(extras || [])]);
  return [...merged].filter((item) => !isEmpty(item));
}

function buildCatalogIndex(items) {
  const index = new Map();
  const scores = new Map();

  items.forEach((item) => {
    const key = normalizeTitle(item.canonical_title || item.title);
    if (!key) return;
    const score = FIELD_PRIORITY.reduce(
      (acc, field) => acc + (isEmpty(item[field]) ? 0 : 1),
      0
    );

    const prevScore = scores.get(key) || -1;
    if (!index.has(key) || score > prevScore) {
      index.set(key, item);
      scores.set(key, score);
    }
  });

  return index;
}

function pickValue(owned, candidates, field) {
  if (!isEmpty(owned[field])) return owned[field];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!isEmpty(candidate[field])) return candidate[field];
  }
  return owned[field];
}

function mergeOwned(owned, catalogs) {
  const key = normalizeTitle(owned.canonical_title || owned.title);
  const candidates = catalogs
    .map((catalog) => catalog.index.get(key))
    .filter(Boolean);

  if (candidates.length === 0) return owned;

  const merged = { ...owned };

  FIELD_PRIORITY.forEach((field) => {
    const value = pickValue(merged, candidates, field);
    if (!isEmpty(value)) merged[field] = value;
  });

  merged.tags = mergeArrays(merged.tags, candidates.flatMap((c) => c.tags || []));
  merged.regions = mergeArrays(
    merged.regions,
    candidates.flatMap((c) => c.regions || [])
  );

  merged.sources = mergeArrays(
    merged.sources,
    candidates.flatMap((c) => c.sources || [])
  );

  merged.enriched_from = mergeArrays(
    merged.enriched_from,
    catalogs
      .filter((catalog) => catalog.index.has(key))
      .map((catalog) => catalog.label)
  );

  return merged;
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  const data = loadJson(OWNED_PATH);
  let owned = [];
  let container = null;

  if (Array.isArray(data)) {
    owned = data;
  } else if (data && typeof data === "object") {
    container = data;
    if (Array.isArray(data.owned)) {
      owned = data.owned;
    } else if (Array.isArray(data.items)) {
      owned = data.items;
    } else {
      throw new Error("Owned catalog does not contain an items array.");
    }
  } else {
    throw new Error("Owned catalog is not valid JSON.");
  }

  const catalogs = CATALOGS.map((catalog) => {
    const data = loadJson(catalog.path);
    return {
      ...catalog,
      index: buildCatalogIndex(Array.isArray(data) ? data : []),
    };
  });

  const enriched = owned.map((item) => mergeOwned(item, catalogs));
  if (container) {
    const output = { ...container, owned: enriched };
    if (!Array.isArray(container.owned) && Array.isArray(container.items)) {
      output.items = enriched;
    }
    if (output.metadata?.counts) {
      output.metadata.counts.owned_titles = enriched.length;
    }
    fs.writeFileSync(OWNED_PATH, JSON.stringify(output, null, 2));
  } else {
    fs.writeFileSync(OWNED_PATH, JSON.stringify(enriched, null, 2));
  }

  const withMatches = enriched.filter(
    (item) => item.enriched_from?.length
  ).length;
  console.log(`Enriched ${withMatches} of ${enriched.length} owned titles.`);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}

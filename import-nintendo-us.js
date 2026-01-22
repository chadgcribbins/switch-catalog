#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ALGOLIA_APP_ID = "U3B6GR4UA3";
const ALGOLIA_API_KEY = "a29c6927638bfd8cee23993e51e721c9";
const ALGOLIA_HOST = `https://${ALGOLIA_APP_ID}-dsn.algolia.net`;

const DEFAULT_INDEX = "store_all_products_en_us";
const DEFAULT_FILTERS = 'topLevelFilters:"Deals"';
const DEFAULT_OUTPUT = path.join(__dirname, "nintendo_us_sales_import.json");
const DEFAULT_MAX = 2000;
const MAX_HITS_PER_QUERY = 1000;
const MAX_RANGE_DEPTH = 20;
const RANGE_EPSILON = 0.001;
const RANGE_MAX = 10000;
const FALLBACK_FACET = "playerCount";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;
    const key = current.replace(/^--/, "");
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parsePlayerCount(value) {
  if (!value) return { min: null, max: null };
  const text = String(value).trim();
  const range = text.match(/(\d+)\s*-\s*(\d+)/);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]) };
  }
  const plus = text.match(/(\d+)\s*\+/);
  if (plus) {
    return { min: Number(plus[1]), max: null };
  }
  const single = text.match(/(\d+)/);
  if (single) {
    return { min: Number(single[1]), max: Number(single[1]) };
  }
  return { min: null, max: null };
}

function toMetacriticSearchUrl(title) {
  return `https://www.metacritic.com/search/${encodeURIComponent(
    title
  )}/?category=game`;
}

function mapHit(hit, region) {
  const tags = [
    ...normalizeArray(hit.gameGenreLabels),
    ...normalizeArray(hit.gameFeatureLabels),
    ...normalizeArray(hit.topLevelFilters),
    ...normalizeArray(hit.waysToPlayLabels),
    ...normalizeArray(hit.playModes),
    ...normalizeArray(hit.nsoFeatures),
  ];

  if (hit.demoNsuid) tags.push("demo");
  if (hit.hasDlc) tags.push("dlc");
  if (hit.exclusive) tags.push("exclusive");

  const playerInfo = parsePlayerCount(hit.playerCount || "");

  const price = hit.price || {};
  const nintendoUrl = hit.url
    ? hit.url.startsWith("http")
      ? hit.url
      : `https://www.nintendo.com${hit.url}`
    : "";

  return {
    title: hit.title || "Untitled",
    canonical_title: hit.title || "Untitled",
    platform: hit.platform || "Nintendo Switch",
    type:
      hit.topLevelCategoryCode === "GAMES" || hit.topLevelCategory === "Games"
        ? "game"
        : "game",
    is_demo: Boolean(hit.demoNsuid),
    is_cloud_version: false,
    is_nso_app: false,
    ownership: "",
    sources: ["nintendo_us_algolia"],
    regions: region ? [region] : [],
    tags,
    metacritic_search_url: toMetacriticSearchUrl(hit.title || ""),
    metacritic_metascore: "",
    metacritic_userscore: "",
    metacritic_url: "",
    notes: hit.description || "",
    players_min: playerInfo.min,
    players_max: playerInfo.max,
    discount_percent: price.percentOff ?? null,
    price_lowest: price.finalPrice ?? null,
    popularity: null,
    release_date: hit.releaseDate || "",
    release_date_display: hit.releaseDateDisplay || "",
    age_rating: hit.contentRating?.label || "",
    age_rating_code: hit.contentRatingCode || "",
    publisher: hit.softwarePublisher || "",
    nintendo_url: nintendoUrl,
    nsuid: hit.nsuid || "",
    image_square: hit.productImageSquare?.url || "",
    image_wide: hit.productImage?.url || "",
    sku: hit.sku || "",
  };
}

function buildRangeFilter(min, maxExclusive) {
  return `price.finalPrice >= ${min} AND price.finalPrice < ${maxExclusive}`;
}

function combineFilters(base, extra) {
  if (base && extra) return `${base} AND ${extra}`;
  return base || extra || "";
}

async function fetchJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Algolia-Application-Id": ALGOLIA_APP_ID,
      "X-Algolia-API-Key": ALGOLIA_API_KEY,
      "Content-Type": "application/json",
      Origin: "https://www.nintendo.com",
      Referer: "https://www.nintendo.com/us/store/sales-and-deals/",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Algolia request failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function fetchSearch({
  indexName,
  query,
  filters,
  hitsPerPage,
  page,
  facets,
  maxValuesPerFacet,
}) {
  const url = `${ALGOLIA_HOST}/1/indexes/${indexName}/query`;
  const params = new URLSearchParams({
    query: query || "",
    hitsPerPage: String(hitsPerPage),
    page: String(page),
    filters: filters || "",
  });
  if (facets) params.set("facets", facets);
  if (maxValuesPerFacet) {
    params.set("maxValuesPerFacet", String(maxValuesPerFacet));
  }

  return fetchJson(url, { params: params.toString() });
}

async function fetchTotalHits(indexName, query, filters) {
  const data = await fetchSearch({
    indexName,
    query,
    filters,
    hitsPerPage: 0,
    page: 0,
  });
  return data.nbHits || 0;
}

async function countRangeHits(indexName, query, baseFilters, min, maxExclusive) {
  const rangeFilter = buildRangeFilter(min, maxExclusive);
  const filters = combineFilters(baseFilters, rangeFilter);
  return fetchTotalHits(indexName, query, filters);
}

async function fetchFacetCounts(indexName, query, filters, facetName) {
  const data = await fetchSearch({
    indexName,
    query,
    filters,
    hitsPerPage: 0,
    page: 0,
    facets: facetName,
    maxValuesPerFacet: 100,
  });
  return data.facets?.[facetName] || {};
}

async function splitRanges(indexName, query, baseFilters, min, maxExclusive, depth) {
  const count = await countRangeHits(
    indexName,
    query,
    baseFilters,
    min,
    maxExclusive
  );

  if (count === 0) return [];
  if (
    count <= MAX_HITS_PER_QUERY ||
    depth >= MAX_RANGE_DEPTH ||
    maxExclusive - min <= RANGE_EPSILON
  ) {
    if (count <= MAX_HITS_PER_QUERY) {
      return [{ min, maxExclusive, count }];
    }
    const rangeFilter = buildRangeFilter(min, maxExclusive);
    const filters = combineFilters(baseFilters, rangeFilter);
    const facetCounts = await fetchFacetCounts(
      indexName,
      query,
      filters,
      FALLBACK_FACET
    );
    const entries = Object.entries(facetCounts);
    if (entries.length) {
      const ranges = entries.map(([value, facetCount]) => ({
        min,
        maxExclusive,
        count: facetCount,
        facetFilter: `${FALLBACK_FACET}:"${value.replace(/"/g, "\\\"")}"`,
      }));
      const notFilters = entries
        .map(
          ([value]) =>
            `NOT ${FALLBACK_FACET}:"${value.replace(/"/g, "\\\"")}"`
        )
        .join(" AND ");
      const missingFilters = combineFilters(filters, notFilters);
      const missingCount = await fetchTotalHits(
        indexName,
        query,
        missingFilters
      );
      if (missingCount > 0) {
        ranges.push({
          min,
          maxExclusive,
          count: missingCount,
          facetFilter: notFilters,
        });
      }
      return ranges;
    }
    return [{ min, maxExclusive, count }];
  }

  const mid = Number(((min + maxExclusive) / 2).toFixed(3));
  if (mid <= min + RANGE_EPSILON) {
    return [{ min, maxExclusive, count }];
  }

  const left = await splitRanges(
    indexName,
    query,
    baseFilters,
    min,
    mid,
    depth + 1
  );
  const right = await splitRanges(
    indexName,
    query,
    baseFilters,
    mid,
    maxExclusive,
    depth + 1
  );

  return [...left, ...right];
}

async function fetchRangeHits(indexName, query, baseFilters, range) {
  const rangeFilter = buildRangeFilter(range.min, range.maxExclusive);
  const filters = combineFilters(
    baseFilters,
    combineFilters(rangeFilter, range.facetFilter)
  );
  const hitsPerPage = Math.min(range.count, MAX_HITS_PER_QUERY);
  const data = await fetchSearch({
    indexName,
    query,
    filters,
    hitsPerPage,
    page: 0,
  });

  if (range.count > MAX_HITS_PER_QUERY) {
    console.warn(
      `Range ${range.min}-${range.maxExclusive} still has ${range.count} hits; results may be truncated.`
    );
  }

  return data.hits || [];
}

async function fetchAllByRanges({ indexName, query, filters }) {
  const ranges = await splitRanges(
    indexName,
    query,
    filters,
    0,
    RANGE_MAX,
    0
  );

  console.log(`Split into ${ranges.length} price ranges.`);

  const hitMap = new Map();
  for (const range of ranges) {
    const rangeHits = await fetchRangeHits(
      indexName,
      query,
      filters,
      range
    );
    rangeHits.forEach((hit) => {
      const key = hit.objectID || hit.sku || hit.urlKey || hit.title;
      if (!key) return;
      if (!hitMap.has(key)) hitMap.set(key, hit);
    });
  }

  return [...hitMap.values()];
}

async function fetchLimited({ indexName, query, filters, max }) {
  const hits = [];
  let page = 0;

  while (hits.length < max) {
    const remaining = max - hits.length;
    const hitsPerPage = Math.min(remaining, MAX_HITS_PER_QUERY);
    const data = await fetchSearch({
      indexName,
      query,
      filters,
      hitsPerPage,
      page,
    });

    hits.push(...(data.hits || []));
    page += 1;

    if (page >= data.nbPages) break;
  }

  return hits.slice(0, max);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node import-nintendo-us.js [options]

Options:
  --index       Algolia index name (default: ${DEFAULT_INDEX})
  --filters     Algolia filters (default: ${DEFAULT_FILTERS})
  --query       Query string (default: empty)
  --out         Output JSON path (default: ${DEFAULT_OUTPUT})
  --max         Max results (default: ${DEFAULT_MAX})
  --all         Fetch all results for the filters
  --region      Region label for output (default: US)
`);
    process.exit(0);
  }

  const indexName = args.index || DEFAULT_INDEX;
  const filters = args.filters || DEFAULT_FILTERS;
  const query = args.query || "";
  const outputPath = args.out || DEFAULT_OUTPUT;
  const region = args.region || "US";

  const total = await fetchTotalHits(indexName, query, filters);
  const max = args.all
    ? total
    : Number(args.max || Math.min(total, DEFAULT_MAX));

  console.log(`Total hits for filters: ${total}`);

  let hits = [];
  if (args.all) {
    hits = await fetchAllByRanges({ indexName, query, filters });
  } else {
    if (max > MAX_HITS_PER_QUERY) {
      console.warn(
        `Requested ${max} items, but Algolia limits results to ${MAX_HITS_PER_QUERY} per query. Use --all for full pulls.`
      );
    }
    hits = await fetchLimited({ indexName, query, filters, max });
  }

  const mapped = hits.map((hit) => mapHit(hit, region));
  fs.writeFileSync(outputPath, JSON.stringify(mapped, null, 2));

  console.log(`Fetched ${mapped.length} items.`);
  console.log(`Saved to ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { URL } = require("url");

const DEFAULT_SEARCH_URL =
  "https://www.nintendo.com/en-gb/Search/Search-299117.html?f=147394-5-10-72-6955-119600";
const DEFAULT_OUTPUT = path.join(__dirname, "nintendo_uk_search_import.json");
const SOLR_BASE = "https://searching.nintendo-europe.com/en/select";

const DEFAULT_FIELDS = [
  "title",
  "title_master_s",
  "pretty_game_categories_txt",
  "product_catalog_description_s",
  "price_discount_percentage_f",
  "price_lowest_f",
  "pretty_date_s",
  "dates_released_dts",
  "players_from",
  "players_to",
  "demo_availability",
  "system_names_txt",
  "playable_on_txt",
  "url",
  "image_url_sq_s",
  "image_url_h2x1_s",
  "hits_i",
  "pg_s",
  "age_rating_value",
  "pretty_agerating_s",
  "publisher",
  "fs_id",
  "nsuid_txt",
  "digital_version_b",
  "physical_version_b",
  "switch_game_voucher_b",
  "paid_subscription_online_play_b",
  "paid_subscription_required_b",
  "title_extras_txt",
];

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

function decompressActiveItems(input) {
  if (!input) return [];
  const deltas = input
    .split("-")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));
  const result = [];
  let sum = 0;
  deltas.forEach((delta) => {
    sum += delta;
    result.push(sum);
  });
  return result;
}

function extractSearchState(html) {
  const marker = "var searchState = searchState ||";
  const startIndex = html.indexOf(marker);
  if (startIndex === -1) return null;
  const braceStart = html.indexOf("{", startIndex);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < html.length; i += 1) {
    const char = html[i];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      return html.slice(braceStart, i + 1);
    }
  }
  return null;
}

function parseSearchState(objectLiteral) {
  if (!objectLiteral) return null;
  const script = `(${objectLiteral})`;
  try {
    return vm.runInNewContext(script, {});
  } catch (error) {
    return null;
  }
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function pickActiveItems(items, activeIds) {
  const activeSet = new Set(activeIds);
  return items.map((item) => ({
    ...item,
    active: activeSet.has(item.id) || Boolean(item.active),
  }));
}

function chooseDefaultItems(items, groups) {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const updated = items.map((item) => ({ ...item }));

  groups.forEach((group) => {
    const groupItems = updated.filter((item) =>
      normalizeArray(item.groups).includes(group.id)
    );
    if (groupItems.some((item) => item.active)) return;
    const defaultItem = groupItems.find((item) => item.default);
    if (defaultItem) defaultItem.active = true;
  });

  return { items: updated, groupsById };
}

function resolveSort(resolvedItems, groups) {
  const sortGroups = groups.filter(
    (group) => group.options?.type === "sortGroup"
  );
  const sortParts = [];

  sortGroups.forEach((group) => {
    const groupItems = resolvedItems.filter((item) =>
      normalizeArray(item.groups).includes(group.id)
    );
    const active =
      groupItems.find((item) => item.active) ||
      groupItems.find((item) => item.default);
    if (!active || !active.value) return;
    sortParts.push(String(active.value));
  });

  if (!sortParts.length) return "";
  return sortParts.join(", ");
}

function buildFilterExpression(item, group) {
  const key = item.key || group.key || "";
  if (!key) return null;
  const rawValue = item.value;
  if (rawValue === "*") return null;

  if (typeof rawValue === "number" || typeof rawValue === "boolean") {
    return `${key}:${rawValue}`;
  }

  const value = String(rawValue);
  if (item.type === "complex" || item.type === "date") {
    return `${key}:${value}`;
  }

  const needsQuotes = /\s|:/.test(value);
  const safeValue = needsQuotes ? `"${value.replace(/"/g, "\\\"")}"` : value;
  return `${key}:${safeValue}`;
}

function buildSolrFilters(searchState, searchUrl) {
  const groups = normalizeArray(searchState.groups);
  const items = normalizeArray(searchState.items);
  const activeIds = decompressActiveItems(searchUrl.searchParams.get("f") || "");
  const withActive = pickActiveItems(items, activeIds);
  const { items: resolvedItems } = chooseDefaultItems(withActive, groups);

  const firstLevelGroups = groups.filter(
    (group) =>
      normalizeArray(group.parents).length === 0 &&
      group.options?.type === "filterGroup"
  );
  const filters = [];

  firstLevelGroups.forEach((group) => {
    const groupItems = resolvedItems.filter((item) =>
      normalizeArray(item.groups).includes(group.id)
    );
    const active = groupItems.find((item) => item.active) || groupItems[0];
    if (active && active.value) {
      const value = String(active.value);
      filters.push(`type:${value}`);
    }
  });

  groups
    .filter(
      (group) =>
        normalizeArray(group.parents).length > 0 &&
        group.options?.type === "filterGroup"
    )
    .forEach((group) => {
      const groupItems = resolvedItems.filter((item) =>
        normalizeArray(item.groups).includes(group.id)
      );
      const activeItems = groupItems.filter((item) => item.active);
      if (!activeItems.length) return;

      const expressions = activeItems
        .map((item) => buildFilterExpression(item, group))
        .filter(Boolean);
      if (!expressions.length) return;

      const conjunction = group.options?.conjunction || "OR";
      const joined = expressions.join(` ${conjunction} `);
      filters.push(expressions.length > 1 ? `(${joined})` : joined);
    });

  filters.push("sorting_title:*");
  const sort = resolveSort(resolvedItems, groups);
  return { filters, sort };
}

function buildQueryParams({ q, start, rows, filters, fields, sort }) {
  const params = new URLSearchParams();
  params.set("q", q || "*");
  params.set("rows", String(rows));
  params.set("start", String(start));
  params.set("wt", "json");
  params.set("fl", fields.join(","));
  if (sort) params.set("sort", sort);
  filters.forEach((filter) => params.append("fq", filter));
  return params;
}

function toMetacriticSearchUrl(title) {
  return `https://www.metacritic.com/search/${encodeURIComponent(
    title
  )}/?category=game`;
}

function mapDoc(doc, region) {
  const tags = [
    ...normalizeArray(doc.pretty_game_categories_txt),
    ...normalizeArray(doc.title_extras_txt),
  ];

  if (doc.demo_availability) tags.push("demo");
  if (doc.digital_version_b) tags.push("digital");
  if (doc.physical_version_b) tags.push("physical");
  if (doc.paid_subscription_online_play_b) tags.push("online-play");
  if (doc.paid_subscription_required_b) tags.push("online-subscription");
  if (doc.switch_game_voucher_b) tags.push("voucher");

  const nintendoUrl = doc.url ? `https://www.nintendo.com${doc.url}` : "";

  return {
    title: doc.title || "Untitled",
    canonical_title: doc.title_master_s || doc.title || "Untitled",
    platform: "Nintendo Switch",
    type: "game",
    is_demo: Boolean(doc.demo_availability),
    is_cloud_version: false,
    is_nso_app: false,
    ownership: "",
    sources: ["nintendo_eu_search"],
    regions: region ? [region] : [],
    tags,
    metacritic_search_url: toMetacriticSearchUrl(doc.title || ""),
    metacritic_metascore: "",
    metacritic_userscore: "",
    metacritic_url: "",
    notes: doc.product_catalog_description_s || "",
    players_min: doc.players_from ?? null,
    players_max: doc.players_to ?? null,
    discount_percent: doc.price_discount_percentage_f ?? null,
    price_lowest: doc.price_lowest_f ?? null,
    popularity: doc.hits_i ?? null,
    release_pretty: doc.pretty_date_s || "",
    release_dates: doc.dates_released_dts || [],
    age_rating: doc.pretty_agerating_s || "",
    age_rating_value: doc.age_rating_value ?? null,
    publisher: doc.publisher || "",
    nintendo_url: nintendoUrl,
    nsuid: doc.nsuid_txt || [],
    image_square: doc.image_url_sq_s || "",
    image_wide: doc.image_url_h2x1_s || "",
    system_names: doc.system_names_txt || [],
    playable_on: doc.playable_on_txt || [],
    fs_id: doc.fs_id || "",
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "codex" } });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

async function fetchAllDocs({ q, filters, pageSize, max, fields, sort }) {
  let start = 0;
  let total = Infinity;
  const docs = [];

  while (start < total && docs.length < max) {
    const remaining = max - docs.length;
    const rows = Math.min(pageSize, remaining);
    const params = buildQueryParams({
      q,
      start,
      rows,
      filters,
      fields,
      sort,
    });
    const url = `${SOLR_BASE}?${params.toString()}`;
    const data = await fetchJson(url);

    const batch = data.response?.docs || [];
    total = Number.isFinite(data.response?.numFound)
      ? data.response.numFound
      : total;

    docs.push(...batch);
    start += batch.length;

    if (!batch.length) break;
    if (batch.length < rows) break;
  }

  return docs;
}

async function loadSearchState(searchUrl) {
  const response = await fetch(searchUrl.toString(), {
    headers: { "User-Agent": "codex" },
  });
  if (!response.ok) {
    throw new Error(`Search page failed: ${response.status}`);
  }
  const html = await response.text();
  const objectLiteral = extractSearchState(html);
  const searchState = parseSearchState(objectLiteral);
  if (!searchState) {
    throw new Error("Could not parse searchState from Nintendo page.");
  }
  return searchState;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node import-nintendo-uk.js [options]

Options:
  --search-url   Nintendo search URL (default: UK Switch deals link)
  --out          Output JSON path (default: ${DEFAULT_OUTPUT})
  --page-size    Solr page size (default: 200)
  --max          Max results (default: 1000)
  --all          Fetch all results
  --region       Region label for output (default: UK)
`);
    process.exit(0);
  }

  const searchUrl = new URL(args["search-url"] || DEFAULT_SEARCH_URL);
  const outputPath = args.out || DEFAULT_OUTPUT;
  const pageSize = Number(args["page-size"] || 200);
  const max = args.all ? Number.POSITIVE_INFINITY : Number(args.max || 1000);
  const region = args.region || "UK";

  const searchState = await loadSearchState(searchUrl);
  const { filters, sort } = buildSolrFilters(searchState, searchUrl);
  const q = searchUrl.searchParams.get("q") || "*";
  const docs = await fetchAllDocs({
    q,
    filters,
    pageSize,
    max,
    fields: DEFAULT_FIELDS,
    sort,
  });

  const mapped = docs.map((doc) => mapDoc(doc, region));
  fs.writeFileSync(outputPath, JSON.stringify(mapped, null, 2));

  console.log(`Fetched ${mapped.length} items.`);
  console.log(`Saved to ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

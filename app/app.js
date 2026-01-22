const DEFAULT_OWNED_PATH = "../owned.json";
const DEFAULT_STORE_PATH = "../store_catalog.json";
const DEFAULT_WISHLIST_PATH = "../wish_list.json";
const DEFAULT_METACRITIC_PATH = "../metacritic_cache.json";
const DEFAULT_TYPES = ["game", "app", "demo"];
const SORT_OPTIONS = [
  { value: "title", label: "Title (A-Z)" },
  { value: "metascore", label: "Metascore" },
  { value: "userscore", label: "Userscore" },
  { value: "discount", label: "Discount" },
  { value: "popularity", label: "Popularity" },
  { value: "players", label: "Players (max)" },
  { value: "match", label: "Match score" },
];
const GOOD_DEAL_THRESHOLD = 40;
const EXPERIMENT_DEFAULT_TITLE = "Super Mario Odyssey";

const state = {
  owned: [],
  ownedMeta: null,
  ownedEmptyMessage: null,
  wishlist: [],
  wishlistMeta: null,
  wishlistEmptyMessage: null,
  catalog: [],
  catalogMeta: null,
  metacriticMap: new Map(),
  view: [],
  activeTags: new Set(),
  playersFilter: "any",
  highlightFilters: new Set(),
  ownedSort: "title",
  catalogTitles: [],
  ownedAutocompleteIndex: -1,
  ownedAutocompleteItems: [],
  typeOptions: [],
  selectedTypes: new Set(),
  catalogMap: new Map(),
  wishlistSort: "title",
  wishlistAutocompleteIndex: -1,
  wishlistAutocompleteItems: [],
  sortOption: "title",
  experimentQuery: "",
};

const elements = {
  ownedStatus: document.getElementById("owned-status"),
  wishlistStatus: document.getElementById("wishlist-status"),
  catalogStatus: document.getElementById("catalog-status"),
  tabButtons: document.querySelectorAll(".tab-button"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  reloadOwned: document.getElementById("reload-owned"),
  reloadWishlist: document.getElementById("reload-wishlist"),
  ownedFile: document.getElementById("owned-file"),
  ownedInput: document.getElementById("owned-input"),
  ownedAdd: document.getElementById("owned-add"),
  ownedList: document.getElementById("owned-list"),
  ownedSave: document.getElementById("owned-save"),
  ownedDownload: document.getElementById("owned-download"),
  ownedClear: document.getElementById("owned-clear"),
  ownedCount: document.getElementById("owned-count"),
  ownedSort: document.getElementById("owned-sort"),
  ownedAutocomplete: document.getElementById("owned-autocomplete"),
  wishlistFile: document.getElementById("wishlist-file"),
  wishlistInput: document.getElementById("wishlist-input"),
  wishlistAdd: document.getElementById("wishlist-add"),
  wishlistList: document.getElementById("wishlist-list"),
  wishlistSave: document.getElementById("wishlist-save"),
  wishlistDownload: document.getElementById("wishlist-download"),
  wishlistClear: document.getElementById("wishlist-clear"),
  wishlistCount: document.getElementById("wishlist-count"),
  wishlistSort: document.getElementById("wishlist-sort"),
  wishlistAutocomplete: document.getElementById("wishlist-autocomplete"),
  catalogFile: document.getElementById("catalog-file"),
  catalogDownload: document.getElementById("catalog-download"),
  clearCatalog: document.getElementById("clear-catalog"),
  catalogRefresh: document.getElementById("catalog-refresh"),
  catalogMetascore: document.getElementById("catalog-metascore"),
  catalogRecent: document.getElementById("catalog-recent"),
  catalogPopularity: document.getElementById("catalog-popularity"),
  catalogRequireRelease: document.getElementById("catalog-require-release"),
  catalogStats: document.getElementById("catalog-stats"),
  catalogMeta: document.getElementById("catalog-meta"),
  catalogRefreshMeta: document.getElementById("catalog-refresh-meta"),
  experimentInput: document.getElementById("experiment-input"),
  experimentList: document.getElementById("experiment-list"),
  experimentGrid: document.getElementById("experiment-grid"),
  experimentMeta: document.getElementById("experiment-meta"),
  searchInput: document.getElementById("search-input"),
  playersFilter: document.getElementById("players-filter"),
  typeSelectButton: document.getElementById("type-select-button"),
  typeSelectMenu: document.getElementById("type-select-menu"),
  regionSelect: document.getElementById("region-select"),
  sortSelectButton: document.getElementById("sort-select-button"),
  sortSelectMenu: document.getElementById("sort-select-menu"),
  highlightFilters: document.getElementById("highlight-filters"),
  filterSummary: document.getElementById("filter-summary"),
  discountMin: document.getElementById("discount-min"),
  discountMax: document.getElementById("discount-max"),
  metascoreMin: document.getElementById("metascore-min"),
  metascoreMax: document.getElementById("metascore-max"),
  discountDistribution: document.getElementById("discount-distribution"),
  discountSliderMin: document.getElementById("discount-slider-min"),
  discountSliderMax: document.getElementById("discount-slider-max"),
  metascoreDistribution: document.getElementById("metascore-distribution"),
  metascoreSliderMin: document.getElementById("metascore-slider-min"),
  metascoreSliderMax: document.getElementById("metascore-slider-max"),
  matchesToggle: document.getElementById("matches-toggle"),
  tagFilter: document.getElementById("tag-filter"),
  genreFilter: document.getElementById("genre-filter"),
  stats: document.getElementById("stats"),
  resultsGrid: document.getElementById("results-grid"),
};

function setStatus(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? "#b93818" : "";
}

function setActiveTab(tabKey) {
  elements.tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tabKey;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  elements.tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabKey);
  });
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

function mergeUniqueValues(primary, secondary) {
  return [...new Set([...(primary || []), ...(secondary || [])])].filter(
    (value) => value !== null && value !== undefined && value !== ""
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

function normalizeItem(item) {
  const title = String(
    item.canonical_title || item.title || item.name || item.label || ""
  ).trim();
  const providedKey = item.key || item.matchKey || item.id || "";
  const matchKey = normalizeTitle(providedKey || title || "Untitled");
  const displayTitle = title || String(item.title || item.name || providedKey || "Untitled").trim();
  const tags = extractTags(item);
  const players = extractPlayers(item, tags);
  let regions = Array.isArray(item.regions)
    ? item.regions.filter(Boolean)
    : item.region
      ? [item.region]
      : [];
  let type = String(item.type || "").toLowerCase();
  if (!type) {
    if (item.is_demo || /demo/i.test(title)) {
      type = "demo";
    } else if (
      item.is_nso_app ||
      /nintendo switch online|youtube/i.test(title)
    ) {
      type = "app";
    } else {
      type = "game";
    }
  }
  if (item.is_demo) type = "demo";
  if (item.is_nso_app) type = "app";
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
  const popularityScore = parseNumber(
    item.popularity ?? item.popularity_score ?? item.popularity_index
  );
  const popularityRank = parseNumber(item.popularity_rank ?? item.rank);
  const popularity =
    popularityScore ?? (popularityRank !== null ? -popularityRank : null);
  const popularityLabel =
    popularityScore !== null
      ? String(popularityScore)
      : popularityRank !== null
        ? `#${popularityRank}`
        : "--";
  const releaseRaw =
    item.release_pretty ||
    item.release_date_display ||
    item.release_date ||
    (Array.isArray(item.release_dates) ? item.release_dates[0] : item.release_dates) ||
    "";
  const releaseTimestamp = releaseRaw
    ? Date.parse(releaseRaw)
    : parseNumber(item.release_timestamp);
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
  if (!regions.length && prices) {
    regions = Object.keys(prices);
  }
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

  const priceValues = prices
    ? Object.values(prices)
        .map((entry) => entry.price)
        .filter((value) => Number.isFinite(value))
    : [];
  const discountValues = prices
    ? Object.values(prices)
        .map((entry) => entry.discount)
        .filter((value) => Number.isFinite(value))
    : [];
  const bestPrice = priceValues.length ? Math.min(...priceValues) : null;
  const bestDiscount = discountValues.length ? Math.max(...discountValues) : null;
  let bestCurrency = currency;
  if (prices && bestPrice !== null) {
    const entry = Object.values(prices).find((value) => value.price === bestPrice);
    bestCurrency = entry?.currency || bestCurrency;
  }

  return {
    raw: item,
    title: displayTitle,
    matchKey,
    key: matchKey,
    type,
    ownership,
    addedAt: item.added_at || item.addedAt || item.added || null,
    regions,
    tags,
    metascore,
    userscore,
    discount: bestDiscount ?? discount,
    popularity,
    popularityLabel,
    releaseDate: releaseRaw,
    releaseTimestamp: Number.isFinite(releaseTimestamp)
      ? releaseTimestamp
      : null,
    imageSquare,
    imageWide,
    prices,
    price: bestPrice ?? price,
    currency: bestCurrency,
    playersMin: players.min,
    playersMax: players.max,
    notes: item.notes || "",
    metacriticUrl: item.metacritic_url || item.metacritic || "",
    metacriticSearchUrl:
      item.metacritic_search_url || item.metacritic_search || "",
    isCloud: Boolean(item.is_cloud_version ?? item.cloud),
    isDemo: Boolean(item.is_demo),
    nintendoUrl: item.nintendo_url || item.nintendoUrl || item.url || "",
    sources: Array.isArray(item.sources)
      ? item.sources
      : item.source
        ? [item.source]
        : [],
  };
}

function normalizeArray(data) {
  if (!Array.isArray(data)) return [];
  return data.map((item) => {
    if (typeof item === "string") {
      return normalizeItem({ title: item });
    }
    return normalizeItem(item);
  });
}

function normalizeDataset(data, fallbackKey) {
  const items = getDatasetItems(data, fallbackKey);
  return normalizeArray(items);
}

function normalizeMetacriticCache(data) {
  const map = new Map();
  if (!data) return map;
  if (Array.isArray(data)) {
    data.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const key = entry.matchKey || normalizeTitle(entry.title);
      if (key) map.set(key, entry);
    });
    return map;
  }
  if (data && typeof data === "object") {
    const entries = data.items || data.data || null;
    if (Array.isArray(entries)) {
      entries.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const key = entry.matchKey || normalizeTitle(entry.title);
        if (key) map.set(key, entry);
      });
      return map;
    }
    Object.entries(data).forEach(([key, entry]) => {
      if (!entry || typeof entry !== "object") return;
      map.set(key, entry);
    });
  }
  return map;
}

function parseIsoDate(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function formatDateShort(value) {
  if (!value) return "--";
  const date = value instanceof Date ? value : parseIsoDate(value);
  if (!date) return "--";
  return date.toLocaleDateString();
}

function mergeMetacriticIntoItems(items) {
  if (!state.metacriticMap || state.metacriticMap.size === 0) return;
  items.forEach((item) => {
    const entry = state.metacriticMap.get(item.matchKey);
    if (!entry) return;
    if (entry.metascore !== null && entry.metascore !== undefined) {
      item.metascore = entry.metascore;
    }
    if (entry.userscore !== null && entry.userscore !== undefined) {
      item.userscore = entry.userscore;
    }
    if (entry.url && !item.metacriticUrl) {
      item.metacriticUrl = entry.url;
    }
  });
}

function getPrimaryRegion(item) {
  if (item.regions.includes("US")) return "US";
  if (item.regions.includes("UK")) return "UK";
  return item.regions[0] || "";
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

    entry.tags = mergeUniqueValues(entry.tags, item.tags);
    entry.regions = mergeUniqueValues(entry.regions, item.regions);
    entry.sources = mergeUniqueValues(entry.sources, item.sources || []);

    if (!entry.playersMin && item.playersMin) entry.playersMin = item.playersMin;
    if (!entry.playersMax && item.playersMax) entry.playersMax = item.playersMax;
    if (!entry.metascore && item.metascore) entry.metascore = item.metascore;
    if (!entry.userscore && item.userscore) entry.userscore = item.userscore;
    if (!entry.notes && item.notes) entry.notes = item.notes;
    if (
      (entry.popularity === null || entry.popularity === undefined) &&
      item.popularity !== null &&
      item.popularity !== undefined
    ) {
      entry.popularity = item.popularity;
      entry.popularityLabel = item.popularityLabel;
    }

    if (
      item.releaseTimestamp &&
      (!entry.releaseTimestamp || item.releaseTimestamp < entry.releaseTimestamp)
    ) {
      entry.releaseTimestamp = item.releaseTimestamp;
      entry.releaseDate = item.releaseDate;
    } else if (!entry.releaseDate && item.releaseDate) {
      entry.releaseDate = item.releaseDate;
      entry.releaseTimestamp = item.releaseTimestamp;
    }

    if (!entry.imageWide && item.imageWide) entry.imageWide = item.imageWide;
    if (!entry.imageSquare && item.imageSquare) entry.imageSquare = item.imageSquare;

    const priceSources = item.prices || {};
    if (Object.keys(priceSources).length) {
      Object.entries(priceSources).forEach(([region, detail]) => {
        if (!detail) return;
        entry.prices[region] = {
          price: parseNumber(detail.price ?? detail.price_lowest),
          discount: parseNumber(detail.discount ?? detail.discount_percent),
          currency: detail.currency || getRegionCurrency(region),
          url: detail.url || detail.nintendo_url || "",
        };
      });
    } else {
      const region = getPrimaryRegion(item);
      if (region) {
        entry.prices[region] = {
          price: item.price,
          discount: item.discount,
          currency: item.currency || getRegionCurrency(region),
          url: item.nintendoUrl || item.raw?.nintendo_url || "",
        };
      }
    }
  });

  return [...map.values()].map((entry) => {
    const prices = entry.prices || {};
    const priceValues = Object.values(prices)
      .map((detail) => detail?.price)
      .filter((value) => Number.isFinite(value));
    const discountValues = Object.values(prices)
      .map((detail) => detail?.discount)
      .filter((value) => Number.isFinite(value));
    const bestPrice = priceValues.length ? Math.min(...priceValues) : null;
    const bestDiscount = discountValues.length
      ? Math.max(...discountValues)
      : null;
    let bestCurrency = entry.currency;
    if (bestPrice !== null) {
      const match = Object.values(prices).find(
        (detail) => detail?.price === bestPrice
      );
      bestCurrency = match?.currency || bestCurrency;
    }

    return {
      ...entry,
      prices,
      price: bestPrice ?? entry.price,
      discount: bestDiscount ?? entry.discount,
      currency: bestCurrency,
    };
  });
}

function getDatasetItems(data, fallbackKey) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data.items)) return data.items;
  if (fallbackKey && Array.isArray(data[fallbackKey])) return data[fallbackKey];
  if (Array.isArray(data.owned)) return data.owned;
  if (Array.isArray(data.wishlist)) return data.wishlist;
  return [];
}

function getDatasetMeta(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data.metadata || data.meta || null;
}

function getDatasetVersion(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data.version || data.catalog_version || data.metadata?.version || null;
}

function formatVersionLabel(version) {
  if (!version) return "";
  return ` (${version})`;
}

function formatStat(value) {
  if (value === null || value === undefined || value === "") return "--";
  return value;
}

function getTitleList(items) {
  const seen = new Set();
  const titles = [];
  items.forEach((item) => {
    const title = String(item?.title || "").trim();
    const key = normalizeTitle(item?.key || item?.matchKey || title);
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (title) {
      titles.push(title);
    } else if (key) {
      titles.push(key);
    }
  });
  return titles;
}

function mergeUnique(primary, secondary) {
  const map = new Map();
  primary.forEach((item) => map.set(item.matchKey, item));
  secondary.forEach((item) => {
    if (!map.has(item.matchKey)) map.set(item.matchKey, item);
  });
  return [...map.values()];
}

function buildTagSet(items) {
  const tags = new Set();
  items.forEach((item) => {
    if (!item) return;
    (item.tags || []).forEach((tag) => tags.add(tag));
  });
  return tags;
}

function buildTagCounts() {
  const tagCounts = new Map();
  state.view.forEach((item) => {
    if (!item) return;
    (item.tags || []).forEach((tag) => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });
  return tagCounts;
}

function buildGenreCounts() {
  const counts = new Map();
  state.view.forEach((item) => {
    if (!item) return;
    const raw = item.raw || {};
    const genres = [];
    if (Array.isArray(raw.genres)) genres.push(...raw.genres);
    if (raw.genre) genres.push(raw.genre);
    genres.forEach((genre) => {
      const cleaned = String(genre).trim().toLowerCase();
      if (!cleaned) return;
      counts.set(cleaned, (counts.get(cleaned) || 0) + 1);
    });
  });
  return counts;
}

function getMatchScore(item, tagSet) {
  if (!tagSet || tagSet.size === 0) return 0;
  let score = 0;
  item.tags.forEach((tag) => {
    if (tagSet.has(tag)) score += 1;
  });
  return score;
}

function updateViewData() {
  const ownedSet = new Set(state.owned.map((item) => item.matchKey));
  const wishlistSet = new Set(state.wishlist.map((item) => item.matchKey));
  const ownedWishlist = mergeUnique(state.owned, state.wishlist);
  const base = state.catalog.length
    ? mergeUnique(state.catalog, ownedWishlist)
    : ownedWishlist;
  const catalogIndex = new Map(
    state.catalog.map((item) => [item.matchKey, item])
  );
  const ownedTags = buildTagSet(
    state.owned.map((item) =>
      item.tags.length ? item : catalogIndex.get(item.matchKey) || item
    )
  );
  const now = Date.now();

  state.view = base.map((item) => {
    const isOwned = ownedSet.has(item.matchKey);
    const isWished = wishlistSet.has(item.matchKey);
    const matchScore = getMatchScore(item, ownedTags);
    const releaseTimestamp =
      Number.isFinite(item.releaseTimestamp) ? item.releaseTimestamp : null;

    return {
      ...item,
      isOwned,
      isWished,
      matchScore,
      isMatch: matchScore > 0,
      isUpcoming:
        releaseTimestamp !== null && releaseTimestamp > now,
      ownership:
        item.ownership || (isOwned ? "owned" : isWished ? "wishlist" : ""),
    };
  });
}

function updateFilterOptions() {
  updateViewData();
  const types = new Set();
  const regions = new Set();

  state.view.forEach((item) => {
    if (item.type) types.add(item.type);
    item.regions.forEach((region) => regions.add(region));
  });

  const tagCounts = buildTagCounts();
  const genreCounts = buildGenreCounts();

  state.activeTags.forEach((tag) => {
    const exists = tagCounts.has(tag) || genreCounts.has(tag);
    if (!exists) state.activeTags.delete(tag);
  });

  updateTypeSelect(types);
  updateSelect(elements.regionSelect, regions, "all", "All regions");
  renderTagFilters(tagCounts, genreCounts);
}

function updateSelect(select, values, defaultValue, defaultLabel) {
  if (!select) return;
  const current = select.value;
  const options = [
    { value: defaultValue, label: defaultLabel },
    ...[...values]
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value })),
  ];

  select.innerHTML = "";
  options.forEach((option) => {
    const opt = document.createElement("option");
    opt.value = option.value;
    opt.textContent = option.label;
    select.appendChild(opt);
  });

  if ([...values, defaultValue].includes(current)) {
    select.value = current;
  } else {
    select.value = defaultValue;
  }
}

function renderFilterButtons(container, counts) {
  if (!container) return;
  container.innerHTML = "";
  const entries = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });

  entries.forEach(([tag, count]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tag = tag;
    button.textContent = `${tag} (${count})`;
    button.classList.toggle("active", state.activeTags.has(tag));
    button.addEventListener("click", () => {
      toggleTag(tag);
    });
    container.appendChild(button);
  });
}

function renderTagFilters(tagCounts, genreCounts) {
  renderFilterButtons(elements.tagFilter, tagCounts);
  renderFilterButtons(elements.genreFilter, genreCounts);
}

function toggleTag(tag) {
  if (state.activeTags.has(tag)) {
    state.activeTags.delete(tag);
  } else {
    state.activeTags.add(tag);
  }
  applyFilters();
}

function setPlayersFilterValue(value) {
  state.playersFilter = value;
  if (!elements.playersFilter) return;
  elements.playersFilter.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.value === value);
  });
}

function updateHighlightButtonsFromState() {
  if (!elements.highlightFilters) return;
  elements.highlightFilters.querySelectorAll("button").forEach((button) => {
    const key = button.dataset.filter;
    button.classList.toggle("active", key && state.highlightFilters.has(key));
  });
}

function renderFilterSummary() {
  if (!elements.filterSummary) return;

  const chips = [];
  const addChip = (key, label) => chips.push({ key, label });
  const searchValue = elements.searchInput.value.trim();
  if (searchValue) addChip("search", `Search: ${searchValue}`);
  if (state.playersFilter && state.playersFilter !== "any") {
    addChip("players", `Players: ${state.playersFilter}`);
  }
  const selectedTypes = getSelectedTypes();
  if (selectedTypes.length > 0) {
    const label =
      selectedTypes.length <= 2
        ? `Type: ${selectedTypes.join(", ")}`
        : `Type: ${selectedTypes.length} selected`;
    addChip("type", label);
  }
  if (elements.regionSelect.value !== "all") {
    addChip("region", `Region: ${elements.regionSelect.options[elements.regionSelect.selectedIndex].text}`);
  }
  if (elements.matchesToggle.checked) {
    addChip("matches", "Only matches");
  }
  const discountMin = parseNumber(elements.discountMin?.value);
  const discountMax = parseNumber(elements.discountMax?.value);
  if (discountMin !== null || discountMax !== null) {
    const label = `Discount ${discountMin !== null ? `≥${discountMin}%` : ""}${
      discountMin !== null && discountMax !== null ? " - " : " "
    }${discountMax !== null ? `≤${discountMax}%` : ""}`.trim();
    addChip("discount-range", label);
  }
  const metascoreMin = parseNumber(elements.metascoreMin?.value);
  const metascoreMax = parseNumber(elements.metascoreMax?.value);
  if (metascoreMin !== null || metascoreMax !== null) {
    const label = `Metascore ${metascoreMin !== null ? `≥${metascoreMin}` : ""}${
      metascoreMin !== null && metascoreMax !== null ? " - " : " "
    }${metascoreMax !== null ? `≤${metascoreMax}` : ""}`.trim();
    addChip("metascore-range", label);
  }
  if (state.highlightFilters.has("owned")) {
    addChip("highlight-owned", "Owned");
  }
  if (state.highlightFilters.has("wishlist")) {
    addChip("highlight-wishlist", "On wishlist");
  }
  if (state.highlightFilters.has("good-match")) {
    addChip("highlight-good-match", "Good match");
  }
  if (state.activeTags.size > 0) {
    addChip("tags", `Tags (${state.activeTags.size})`);
  }

  elements.filterSummary.innerHTML = "";
  if (!chips.length) {
    elements.filterSummary.classList.add("empty");
    elements.filterSummary.style.display = "none";
    return;
  }

  elements.filterSummary.classList.remove("empty");
  elements.filterSummary.style.display = "flex";
  const label = document.createElement("span");
  label.style.fontWeight = "600";
  label.textContent = "Active filters:";
  elements.filterSummary.appendChild(label);

  chips.forEach(({ key, label }) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "filter-chip";
    chip.textContent = label;
    chip.dataset.action = key;
    chip.addEventListener("click", () => handleSummaryAction(key));
    elements.filterSummary.appendChild(chip);
  });
}

function handleSummaryAction(action) {
  switch (action) {
    case "discount-range":
      if (elements.discountMin) elements.discountMin.value = "";
      if (elements.discountMax) elements.discountMax.value = "";
      updateSlidersFromInputs(
        elements.discountMin,
        elements.discountMax,
        elements.discountSliderMin,
        elements.discountSliderMax
      );
      break;
    case "metascore-range":
      if (elements.metascoreMin) elements.metascoreMin.value = "";
      if (elements.metascoreMax) elements.metascoreMax.value = "";
      updateSlidersFromInputs(
        elements.metascoreMin,
        elements.metascoreMax,
        elements.metascoreSliderMin,
        elements.metascoreSliderMax
      );
      break;
    case "search":
      elements.searchInput.value = "";
      break;
    case "players":
      setPlayersFilterValue("any");
      break;
    case "type":
      state.selectedTypes = new Set(state.typeOptions);
      renderTypeMenu();
      break;
    case "region":
      elements.regionSelect.value = "all";
      break;
    case "matches":
      elements.matchesToggle.checked = false;
      break;
    case "highlight-owned":
      state.highlightFilters.delete("owned");
      break;
    case "highlight-wishlist":
      state.highlightFilters.delete("wishlist");
      break;
    case "highlight-good-match":
      state.highlightFilters.delete("good-match");
      break;
    case "tags":
      state.activeTags.clear();
      break;
    default:
      break;
  }

  updateHighlightButtonsFromState();

  applyFilters();
}

function getDistributionBuckets(values, binCount = 10, min = 0, max = 100) {
  const range = max - min || 1;
  const bins = new Array(binCount).fill(0);
  values.forEach((value) => {
    if (value === null || value === undefined) return;
    const clamped = Math.min(Math.max(value, min), max);
    const ratio = (clamped - min) / range;
    const index = Math.min(binCount - 1, Math.floor(ratio * binCount));
    bins[index] += 1;
  });
  return bins;
}

function renderDistribution(values, container, min = 0, max = 100) {
  if (!container) return;
  const buckets = getDistributionBuckets(values, 12, min, max);
  const highest = Math.max(...buckets, 1);
  container.innerHTML = "";
  buckets.forEach((count) => {
    const bar = document.createElement("span");
    bar.style.height = `${(count / highest) * 100}%`;
    container.appendChild(bar);
  });
}

function renderDiscountDistribution() {
  const values = state.view
    .map((item) => item.discount)
    .filter((value) => value !== null && value !== undefined);
  renderDistribution(values, elements.discountDistribution, 0, 100);
}

function renderMetascoreDistribution() {
  const values = state.view
    .map((item) => item.metascore)
    .filter((value) => value !== null && value !== undefined);
  renderDistribution(values, elements.metascoreDistribution, 0, 100);
}

function updateRangeFromSliders(inputMin, inputMax, sliderMin, sliderMax) {
  if (!inputMin || !inputMax || !sliderMin || !sliderMax) return;
  let minVal = Number(sliderMin.value);
  let maxVal = Number(sliderMax.value);
  if (minVal > maxVal) {
    if (document.activeElement === sliderMin) {
      maxVal = minVal;
      sliderMax.value = String(minVal);
    } else {
      minVal = maxVal;
      sliderMin.value = String(maxVal);
    }
  }
  inputMin.value = String(minVal);
  inputMax.value = String(maxVal);
}

function updateSlidersFromInputs(inputMin, inputMax, sliderMin, sliderMax) {
  if (!inputMin || !inputMax || !sliderMin || !sliderMax) return;
  const minVal = parseNumber(inputMin.value);
  const maxVal = parseNumber(inputMax.value);
  if (minVal !== null) sliderMin.value = String(Math.min(Math.max(minVal, 0), 100));
  if (maxVal !== null) sliderMax.value = String(Math.min(Math.max(maxVal, 0), 100));
  if (Number(sliderMin.value) > Number(sliderMax.value)) {
    sliderMax.value = sliderMin.value;
  }
}

function bindRangeControls({ sliderMin, sliderMax, inputMin, inputMax }) {
  if (!sliderMin || !sliderMax || !inputMin || !inputMax) return;
  sliderMin.addEventListener("input", () => {
    updateRangeFromSliders(inputMin, inputMax, sliderMin, sliderMax);
    applyFilters();
  });
  sliderMax.addEventListener("input", () => {
    updateRangeFromSliders(inputMin, inputMax, sliderMin, sliderMax);
    applyFilters();
  });
  inputMin.addEventListener("input", () => {
    updateSlidersFromInputs(inputMin, inputMax, sliderMin, sliderMax);
    applyFilters();
  });
  inputMax.addEventListener("input", () => {
    updateSlidersFromInputs(inputMin, inputMax, sliderMin, sliderMax);
    applyFilters();
  });
}

function formatPlayers(item) {
  const min = item.playersMin;
  const max = item.playersMax;
  if (!min && !max) return "--";
  if (min && max && min !== max) return `${min}-${max}`;
  return String(max || min);
}

function formatScore(score) {
  if (score === null || score === undefined) return "--";
  return score.toString();
}

function formatDecimal(value, digits = 1) {
  if (!Number.isFinite(value)) return "--";
  return Number(value).toFixed(digits);
}

function formatCount(value) {
  if (!Number.isFinite(value)) return "--";
  return Math.round(value).toLocaleString();
}

function formatList(values, max = 4) {
  if (!Array.isArray(values) || values.length === 0) return "--";
  const items = values.filter(Boolean);
  const shown = items.slice(0, max);
  const remaining = items.length - shown.length;
  if (remaining > 0) {
    return `${shown.join(", ")} +${remaining} more`;
  }
  return shown.join(", ");
}

function formatUnixDateSeconds(value) {
  if (!Number.isFinite(value)) return "--";
  return new Date(value * 1000).toLocaleDateString();
}

function formatDiscount(discount) {
  if (discount === null || discount === undefined) return "--";
  return `${Math.round(discount)}%`;
}

function formatCurrency(code) {
  if (code === "USD") return "$";
  if (code === "GBP") return "£";
  if (code === "EUR") return "€";
  if (!code) return "";
  return `${code} `;
}

function formatPriceValue(price) {
  if (price === null || price === undefined) return "--";
  return Number(price).toFixed(2);
}

function formatPrice(item) {
  if (item.price === null || item.price === undefined) return "--";
  const currency = formatCurrency(item.currency);
  return `${currency}${formatPriceValue(item.price)}`;
}

function formatRelease(item) {
  if (!item.releaseDate && !item.releaseTimestamp) return "";
  if (item.releaseTimestamp) {
    return new Date(item.releaseTimestamp).toLocaleDateString();
  }
  return item.releaseDate;
}

function formatMatch(item) {
  if (!item.matchScore) return "--";
  return `${item.matchScore} tag${item.matchScore === 1 ? "" : "s"}`;
}

function formatRegionPrice(region, entry) {
  if (!entry || entry.price === null || entry.price === undefined) {
    return `${region} --`;
  }
  const currency = formatCurrency(entry.currency || getRegionCurrency(region));
  const priceText = `${region} ${currency}${formatPriceValue(entry.price)}`.trim();
  const discount =
    entry.discount && entry.discount > 0
      ? ` -${Math.round(entry.discount)}%`
      : "";
  return `${priceText}${discount}`;
}

function buildPriceRow(item) {
  const row = document.createElement("div");
  row.className = "price-row";
  const prices = item.prices || {};
  const primaryRegions = ["US", "UK", "EU"];
  const extraRegions = Object.keys(prices).filter(
    (region) => !primaryRegions.includes(region)
  );
  const regions = [...primaryRegions, ...extraRegions];
  let hasAny = false;

  regions.forEach((region) => {
    const entry = prices[region] || null;
    if (entry && entry.price !== null && entry.price !== undefined) {
      hasAny = true;
    }
    const chip = document.createElement("span");
    const hasDiscount = entry && entry.discount && entry.discount > 0;
    chip.className = `price-chip ${entry ? "" : "missing"} ${
      hasDiscount ? "discounted" : ""
    }`.trim();
    chip.textContent = formatRegionPrice(region, entry);
    row.appendChild(chip);
  });

  if (!hasAny) {
    row.classList.add("empty");
  }

  return row;
}

function createIconToggle({ type, active, label, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `icon-toggle ${active ? "active" : ""}`.trim();
  button.dataset.type = type;
  button.setAttribute("aria-pressed", active ? "true" : "false");
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML =
    type === "wishlist"
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-6.8-4.3-9-8.2C1.1 8.4 3 6 5.8 6c1.9 0 3.4 1 4.2 2.4C10.8 7 12.3 6 14.2 6c2.8 0 4.7 2.4 2.8 6.3-2.2 3.9-9 8.2-9 8.2z"/></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12l2.5 2.5L16 9"/></svg>`;
  button.addEventListener("click", onClick);
  return button;
}

function renderCatalogMeta() {
  if (!state.catalogMeta) return;
  const meta = state.catalogMeta;
  const refreshed = meta.last_refreshed || meta.generated || "";
  if (elements.catalogRefreshMeta) {
    elements.catalogRefreshMeta.textContent = refreshed
      ? `Last refreshed ${formatDateShort(refreshed)}`
      : "";
  }
  if (!elements.catalogMeta) return;
  elements.catalogMeta.innerHTML = "";
}

function renderCatalogStats() {
  if (!elements.catalogStats) return;
  const stats = state.catalogMeta?.stats || {};
  elements.catalogStats.innerHTML = "";
  
  // Remove any existing stat-row from catalogStatus
  if (elements.catalogStatus) {
    const existingStatRow = elements.catalogStatus.querySelector('.stat-row');
    if (existingStatRow) {
      existingStatRow.remove();
    }
  }
  
  if (!stats || Object.keys(stats).length === 0) return;

  const metaRow = document.createElement("div");
  metaRow.className = "stat-row";
  metaRow.innerHTML = `
    <span>Catalog size: ${formatStat(stats.total_kept)} of ${
      formatStat(stats.total_raw)
    }</span>
    <span>Avg Metascore: ${formatStat(stats.avg_metascore)}</span>
    <span>Avg Popularity: ${formatStat(stats.avg_popularity)}</span>
    <span>P75 Popularity: ${formatStat(stats.p75_popularity)}</span>
  `;
  elements.catalogStatus.appendChild(metaRow);

  const metricRow = document.createElement("div");
  metricRow.className = "stat-row";
  const popularity = Number.isFinite(stats.avg_popularity)
    ? stats.avg_popularity
    : 0;
  const popScale = Math.min(popularity / (stats.popularity_max || 1), 1);
  const metascore = Number.isFinite(stats.avg_metascore)
    ? stats.avg_metascore
    : 0;
  const metaScale = Math.min(metascore / 100, 1);
  metricRow.innerHTML = `
    <div class="metric">
      <span>Metascore avg</span>
      <div class="metric-bar"><span style="width: ${Math.round(
        metaScale * 100
      )}%"></span></div>
      <span class="metric-value">${formatStat(stats.avg_metascore)} / 100</span>
    </div>
    <div class="metric">
      <span>Popularity avg</span>
      <div class="metric-bar"><span style="width: ${Math.round(
        popScale * 100
      )}%"></span></div>
      <span class="metric-value">${formatStat(stats.avg_popularity)} (max ${
        formatStat(stats.popularity_max)
      })</span>
    </div>
  `;
  elements.catalogStats.appendChild(metricRow);
}

function applyCatalogMetaToControls() {
  if (!state.catalogMeta) return;
  const filters = state.catalogMeta.filters || {};
  if (elements.catalogMetascore && filters.metascore_min !== undefined) {
    elements.catalogMetascore.value = filters.metascore_min;
  }
  if (elements.catalogRecent && filters.recent_months !== undefined) {
    elements.catalogRecent.value = filters.recent_months;
  }
  if (elements.catalogPopularity) {
    const value =
      filters.popularity_min ??
      state.catalogMeta.stats?.p75_popularity ??
      state.catalogMeta.stats?.avg_popularity ??
      "";
    if (value !== "" && elements.catalogPopularity.value === "") {
      elements.catalogPopularity.value = value;
    } else if (filters.popularity_min !== undefined) {
      elements.catalogPopularity.value = filters.popularity_min;
    }
  }
  if (elements.catalogRequireRelease && filters.require_release_date !== undefined) {
    elements.catalogRequireRelease.checked = Boolean(filters.require_release_date);
  }
}

function updateCatalogTitleOptions() {
  const source = state.catalog.length
    ? state.catalog
    : mergeUnique(state.owned, state.wishlist);
  state.catalogTitles = getTitleList(source).sort((a, b) => a.localeCompare(b));
  if (elements.ownedInput && elements.ownedInput.value.trim()) {
    updateOwnedAutocomplete();
  }
  if (elements.wishlistInput && elements.wishlistInput.value.trim()) {
    updateWishlistAutocomplete();
  }
  updateExperimentOptions();
  renderExperiment();
}

function formatTypeLabel(value) {
  return String(value || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveTitle(item) {
  if (item.title) return item.title;
  const key = item.key || item.matchKey;
  if (key && state.catalogMap?.has(key)) {
    return state.catalogMap.get(key).title;
  }
  return key ? String(key) : "Untitled";
}

function refreshCatalogMap() {
  state.catalogMap = new Map(
    state.catalog.map((item) => [item.matchKey, item])
  );
}

function getSelectedTypes() {
  if (!state.typeOptions.length) return [];
  if (state.selectedTypes.size === 0) return [];
  if (state.selectedTypes.size === state.typeOptions.length) return [];
  return [...state.selectedTypes];
}

function updateTypeSelect(types) {
  state.typeOptions = [...new Set([...DEFAULT_TYPES, ...types])].sort((a, b) =>
    a.localeCompare(b)
  );
  if (state.selectedTypes.size === 0) {
    state.selectedTypes = new Set(state.typeOptions);
  } else {
    state.selectedTypes.forEach((value) => {
      if (!state.typeOptions.includes(value)) {
        state.selectedTypes.delete(value);
      }
    });
    if (state.selectedTypes.size === 0) {
      state.selectedTypes = new Set(state.typeOptions);
    }
  }
  renderTypeMenu();
  renderSortMenu();
}

function renderTypeMenu() {
  if (!elements.typeSelectMenu || !elements.typeSelectButton) return;
  const options = state.typeOptions;
  const selected = state.selectedTypes;
  const allSelected = selected.size === options.length;

  if (allSelected) {
    elements.typeSelectButton.textContent = "All types";
  } else if (selected.size === 1) {
    elements.typeSelectButton.textContent = formatTypeLabel([...selected][0]);
  } else {
    elements.typeSelectButton.textContent = `${selected.size} types`;
  }

  elements.typeSelectMenu.innerHTML = "";

  options.forEach((value) => {
    const row = document.createElement("label");
    row.className = "multi-select-item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selected.has(value);
    input.addEventListener("change", (event) => {
      if (event.target.checked) {
        selected.add(value);
      } else {
        selected.delete(value);
      }
      if (selected.size === 0) {
        selected.add(value);
      }
      renderTypeMenu();
      applyFilters();
    });
    const text = document.createElement("span");
    text.textContent = formatTypeLabel(value);
    row.appendChild(input);
    row.appendChild(text);
    elements.typeSelectMenu.appendChild(row);
  });
}

function getSortLabel(value) {
  const option = SORT_OPTIONS.find((opt) => opt.value === value);
  return option ? option.label : "Sort";
}

function renderSortMenu() {
  if (!elements.sortSelectMenu) return;
  elements.sortSelectMenu.innerHTML = "";
  SORT_OPTIONS.forEach(({ value, label }) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `multi-select-item ${
      state.sortOption === value ? "active" : ""
    }`.trim();
    item.textContent = label;
    item.dataset.value = value;
    item.addEventListener("click", () => {
      selectSortOption(value);
    });
    elements.sortSelectMenu.appendChild(item);
  });
  if (elements.sortSelectButton) {
    elements.sortSelectButton.textContent = getSortLabel(state.sortOption);
  }
}

function toggleSortMenu(forceOpen = null) {
  if (!elements.sortSelectMenu) return;
  const shouldOpen =
    forceOpen !== null
      ? forceOpen
      : !elements.sortSelectMenu.classList.contains("active");
  elements.sortSelectMenu.classList.toggle("active", shouldOpen);
}

function selectSortOption(value) {
  state.sortOption = value;
  toggleSortMenu(false);
  renderSortMenu();
  applyFilters();
}

function toggleTypeMenu(forceOpen = null) {
  if (!elements.typeSelectMenu) return;
  const shouldOpen =
    forceOpen !== null
      ? forceOpen
      : !elements.typeSelectMenu.classList.contains("active");
  elements.typeSelectMenu.classList.toggle("active", shouldOpen);
}

function closeOwnedAutocomplete() {
  state.ownedAutocompleteItems = [];
  state.ownedAutocompleteIndex = -1;
  if (elements.ownedAutocomplete) {
    elements.ownedAutocomplete.innerHTML = "";
    elements.ownedAutocomplete.classList.remove("active");
  }
}

function renderOwnedAutocomplete() {
  if (!elements.ownedAutocomplete) return;
  const matches = state.ownedAutocompleteItems;
  if (!matches.length) {
    closeOwnedAutocomplete();
    return;
  }

  elements.ownedAutocomplete.innerHTML = "";
  elements.ownedAutocomplete.classList.add("active");
  matches.forEach((title, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `autocomplete-item ${
      index === state.ownedAutocompleteIndex ? "active" : ""
    }`.trim();
    item.textContent = title;
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectOwnedSuggestion(title);
    });
    elements.ownedAutocomplete.appendChild(item);
  });
}

function selectOwnedSuggestion(title, shouldAdd = false) {
  if (!elements.ownedInput) return;
  elements.ownedInput.value = title;
  closeOwnedAutocomplete();
  if (shouldAdd) {
    addOwnedTitle(title);
    elements.ownedInput.value = "";
    elements.ownedInput.focus();
  }
}

function updateOwnedAutocomplete() {
  const query = elements.ownedInput?.value.trim().toLowerCase() || "";
  if (!query) {
    closeOwnedAutocomplete();
    return;
  }

  const ownedKeys = new Set(state.owned.map((item) => item.matchKey));
  const matches = state.catalogTitles.filter((title) => {
    const key = normalizeTitle(title);
    if (ownedKeys.has(key)) return false;
    return title.toLowerCase().includes(query);
  });

  state.ownedAutocompleteItems = matches.slice(0, 12);
  state.ownedAutocompleteIndex = state.ownedAutocompleteItems.length ? 0 : -1;
  renderOwnedAutocomplete();
}

function handleOwnedAutocompleteKeydown(event) {
  if (!state.ownedAutocompleteItems.length) return false;

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      state.ownedAutocompleteIndex =
        (state.ownedAutocompleteIndex + 1) % state.ownedAutocompleteItems.length;
      renderOwnedAutocomplete();
      return true;
    case "ArrowUp":
      event.preventDefault();
      state.ownedAutocompleteIndex =
        (state.ownedAutocompleteIndex - 1 + state.ownedAutocompleteItems.length) %
        state.ownedAutocompleteItems.length;
      renderOwnedAutocomplete();
      return true;
    case "Enter": {
      event.preventDefault();
      const selection =
        state.ownedAutocompleteItems[state.ownedAutocompleteIndex] ||
        state.ownedAutocompleteItems[0];
      if (selection) {
        selectOwnedSuggestion(selection, true);
      }
      return true;
    }
    case "Escape":
      event.preventDefault();
      closeOwnedAutocomplete();
      return true;
    default:
      return false;
  }
}

function closeWishlistAutocomplete() {
  state.wishlistAutocompleteItems = [];
  state.wishlistAutocompleteIndex = -1;
  if (elements.wishlistAutocomplete) {
    elements.wishlistAutocomplete.innerHTML = "";
    elements.wishlistAutocomplete.classList.remove("active");
  }
}

function renderWishlistAutocomplete() {
  if (!elements.wishlistAutocomplete) return;
  const matches = state.wishlistAutocompleteItems;
  if (!matches.length) {
    closeWishlistAutocomplete();
    return;
  }

  elements.wishlistAutocomplete.innerHTML = "";
  elements.wishlistAutocomplete.classList.add("active");
  matches.forEach((title, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `autocomplete-item ${
      index === state.wishlistAutocompleteIndex ? "active" : ""
    }`.trim();
    item.textContent = title;
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectWishlistSuggestion(title);
    });
    elements.wishlistAutocomplete.appendChild(item);
  });
}

function selectWishlistSuggestion(title, shouldAdd = false) {
  if (!elements.wishlistInput) return;
  elements.wishlistInput.value = title;
  closeWishlistAutocomplete();
  if (shouldAdd) {
    addWishlistTitle(title);
    elements.wishlistInput.value = "";
    elements.wishlistInput.focus();
  }
}

function updateWishlistAutocomplete() {
  const query = elements.wishlistInput?.value.trim().toLowerCase() || "";
  if (!query) {
    closeWishlistAutocomplete();
    return;
  }

  const wishlistKeys = new Set(state.wishlist.map((item) => item.matchKey));
  const matches = state.catalogTitles.filter((title) => {
    const key = normalizeTitle(title);
    if (wishlistKeys.has(key)) return false;
    return title.toLowerCase().includes(query);
  });

  state.wishlistAutocompleteItems = matches.slice(0, 12);
  state.wishlistAutocompleteIndex = state.wishlistAutocompleteItems.length
    ? 0
    : -1;
  renderWishlistAutocomplete();
}

function handleWishlistAutocompleteKeydown(event) {
  if (!state.wishlistAutocompleteItems.length) return false;

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      state.wishlistAutocompleteIndex =
        (state.wishlistAutocompleteIndex + 1) %
        state.wishlistAutocompleteItems.length;
      renderWishlistAutocomplete();
      return true;
    case "ArrowUp":
      event.preventDefault();
      state.wishlistAutocompleteIndex =
        (state.wishlistAutocompleteIndex - 1 + state.wishlistAutocompleteItems.length) %
        state.wishlistAutocompleteItems.length;
      renderWishlistAutocomplete();
      return true;
    case "Enter": {
      event.preventDefault();
      const selection =
        state.wishlistAutocompleteItems[state.wishlistAutocompleteIndex] ||
        state.wishlistAutocompleteItems[0];
      if (selection) {
        selectWishlistSuggestion(selection, true);
      }
      return true;
    }
    case "Escape":
      event.preventDefault();
      closeWishlistAutocomplete();
      return true;
    default:
      return false;
  }
}

function hasTag(item, candidates) {
  return item.tags.some((tag) => candidates.includes(tag));
}

function passesPlayersFilter(item, filter) {
  const max = item.playersMax || item.playersMin || null;
  const min = item.playersMin || item.playersMax || null;

  switch (filter) {
    case "2+":
      return max ? max >= 2 : false;
    case "4+":
      return max ? max >= 4 : false;
    case "co-op":
      return hasTag(item, ["co-op", "coop", "co op", "local-coop", "multiplayer"]);
    case "solo":
      return max === 1 || min === 1 || hasTag(item, ["solo", "singleplayer"]);
    default:
      return true;
  }
}

function matchesHighlights(item) {
  if (state.highlightFilters.size === 0) return true;
  for (const flag of state.highlightFilters) {
    if (
      (flag === "owned" && item.isOwned) ||
      (flag === "wishlist" && item.isWished) ||
      (flag === "good-match" && item.isMatch)
    ) {
      return true;
    }
  }
  return false;
}

function applyFilters() {
  updateViewData();
  const search = elements.searchInput.value.trim().toLowerCase();
  const selectedTypes = getSelectedTypes();
  const selectedRegion = elements.regionSelect.value;
  const sortKey = state.sortOption;
  const discountMin = parseNumber(elements.discountMin?.value);
  const discountMax = parseNumber(elements.discountMax?.value);
  const metascoreMin = parseNumber(elements.metascoreMin?.value);
  const metascoreMax = parseNumber(elements.metascoreMax?.value);
  const matchesOnly = elements.matchesToggle.checked;

  state.view.forEach((item) => {
    item.isGoodDeal =
      item.isWished &&
      item.discount !== null &&
      item.discount >= GOOD_DEAL_THRESHOLD;
  });

  let filtered = state.view.filter((item) => {
    if (!matchesHighlights(item)) return false;
    if (matchesOnly && !item.isMatch) return false;
    if (selectedTypes.length > 0 && !selectedTypes.includes(item.type)) {
      return false;
    }
    if (
      selectedRegion !== "all" &&
      !item.regions.includes(selectedRegion)
    ) {
      return false;
    }
    if (state.activeTags.size > 0) {
      const hasMatch = item.tags.some((tag) => state.activeTags.has(tag));
      if (!hasMatch) return false;
    }
    if (discountMin !== null) {
      if (item.discount === null || item.discount < discountMin) return false;
    }
    if (discountMax !== null) {
      if (item.discount === null || item.discount > discountMax) return false;
    }
    if (metascoreMin !== null) {
      if (item.metascore === null || item.metascore < metascoreMin) return false;
    }
    if (metascoreMax !== null) {
      if (item.metascore === null || item.metascore > metascoreMax) return false;
    }
    if (!passesPlayersFilter(item, state.playersFilter)) return false;

    if (search) {
      const haystack = [
        item.title,
        item.tags.join(" "),
        item.notes,
        item.type,
        item.ownership,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  filtered = sortItems(filtered, sortKey);
  renderFilterSummary();
  renderDiscountDistribution();
  renderMetascoreDistribution();
  renderResults(filtered);
}

function sortItems(items, key) {
  const copy = [...items];
  const fallback = (a, b) => a.title.localeCompare(b.title);

  copy.sort((a, b) => {
    switch (key) {
      case "metascore":
        return (b.metascore ?? -1) - (a.metascore ?? -1) || fallback(a, b);
      case "userscore":
        return (b.userscore ?? -1) - (a.userscore ?? -1) || fallback(a, b);
      case "discount":
        return (b.discount ?? -1) - (a.discount ?? -1) || fallback(a, b);
      case "popularity":
        return (b.popularity ?? -1) - (a.popularity ?? -1) || fallback(a, b);
      case "players":
        return (b.playersMax ?? -1) - (a.playersMax ?? -1) || fallback(a, b);
      case "match":
        return (b.matchScore ?? -1) - (a.matchScore ?? -1) || fallback(a, b);
      default:
        return fallback(a, b);
    }
  });

  return copy;
}

function renderResults(items) {
  const total = state.view.length;
  const ownedCount = state.view.filter((item) => item.isOwned).length;
  const wishlistCount = state.view.filter((item) => item.isWished).length;
  const unownedCount = state.view.filter(
    (item) => !item.isOwned && !item.isWished
  ).length;
  const dealCount = state.view.filter((item) => item.isGoodDeal).length;
  const matchCount = state.view.filter((item) => item.isMatch).length;

  const metaCount = state.metacriticMap?.size || 0;
  const metaLabel = metaCount ? ` Metacritic: ${metaCount} loaded.` : "";
  elements.stats.textContent = `Showing ${items.length} of ${total} titles. Owned matches: ${ownedCount} of ${state.owned.length}. Wishlist matches: ${wishlistCount} of ${state.wishlist.length}. Unowned: ${unownedCount}. Deals: ${dealCount}. Matches: ${matchCount}.${metaLabel}`;
  elements.resultsGrid.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      "No matches. Try clearing filters or load a larger catalog file.";
    elements.resultsGrid.appendChild(empty);
    return;
  }

  items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "card";
    if (item.isGoodDeal) card.classList.add("deal");
    if (item.isMatch) card.classList.add("match");
    if (item.isUpcoming) card.classList.add("upcoming");
    card.style.setProperty("--delay", index);

    const media = document.createElement("div");
    media.className = "card-media";
    const coverUrl =
      item.imageWide ||
      item.imageSquare ||
      item.raw?.image_wide ||
      item.raw?.image_square ||
      item.raw?.image;
    const fallback = document.createElement("div");
    fallback.className = "media-fallback";
    fallback.textContent = item.title.slice(0, 1).toUpperCase();
    if (coverUrl) {
      const img = document.createElement("img");
      img.src = coverUrl.startsWith("http://")
        ? coverUrl.replace("http://", "https://")
        : coverUrl;
      img.alt = `${item.title} cover art`;
      img.loading = "lazy";
      img.addEventListener("error", () => {
        if (!media.contains(fallback)) {
          media.innerHTML = "";
          media.appendChild(fallback);
        }
      });
      media.appendChild(img);
    } else {
      media.appendChild(fallback);
    }

    const regionText = item.regions.length ? item.regions.join(", ") : "--";
    const releaseValue = formatRelease(item);
    const releaseText = releaseValue ? `Release ${releaseValue}` : "";
    const metaLine = [item.type, regionText, releaseText]
      .filter(Boolean)
      .join(" | ");

    const tags = item.tags.slice(0, 8);
    const extraTags = item.tags.length - tags.length;

    const content = document.createElement("div");
    content.className = "card-body";

    const header = document.createElement("div");
    header.className = "card-body-header";

    const titleBlock = document.createElement("div");
    titleBlock.className = "card-title-block";
    const h3 = document.createElement("h3");
    h3.textContent = item.title;
    const sub = document.createElement("p");
    sub.className = "subline";
    sub.textContent = metaLine;
    titleBlock.appendChild(h3);
    titleBlock.appendChild(sub);

    const cardActions = document.createElement("div");
    cardActions.className = "card-actions";

    const toggleRow = document.createElement("div");
    toggleRow.className = "toggle-row";
    const ownedToggle = createIconToggle({
      type: "owned",
      active: item.isOwned,
      label: item.isOwned ? "Remove from owned" : "Mark as owned",
      onClick: () => toggleOwned(item),
    });
    const wishToggle = createIconToggle({
      type: "wishlist",
      active: item.isWished,
      label: item.isWished ? "Remove from wishlist" : "Add to wishlist",
      onClick: () => toggleWishlist(item),
    });
    toggleRow.appendChild(ownedToggle);
    toggleRow.appendChild(wishToggle);
    cardActions.appendChild(toggleRow);

    const badgeGroup = document.createElement("div");
    badgeGroup.className = "badge-group";

    if (item.isGoodDeal) {
      const dealBadge = document.createElement("span");
      dealBadge.className = "badge-pill deal";
      dealBadge.textContent = "Good deal";
      badgeGroup.appendChild(dealBadge);
    }

    if (item.isMatch) {
      const matchBadge = document.createElement("span");
      matchBadge.className = "badge-pill match";
      matchBadge.textContent = `Match +${item.matchScore}`;
      badgeGroup.appendChild(matchBadge);
    }

    if (item.isUpcoming) {
      const upcomingBadge = document.createElement("span");
      upcomingBadge.className = "badge-pill upcoming";
      upcomingBadge.textContent = "Upcoming";
      badgeGroup.appendChild(upcomingBadge);
    }

    if (badgeGroup.childNodes.length > 0) {
      cardActions.appendChild(badgeGroup);
    }

    const priceSummary = document.createElement("div");
    priceSummary.className = "price-summary";
    const priceValue = document.createElement("span");
    priceValue.className = "price-main";
    priceValue.textContent = formatPrice(item);
    const discountValue = document.createElement("span");
    discountValue.className = "discount-pill";
    discountValue.textContent =
      item.discount !== null ? `Best discount ${formatDiscount(item.discount)}` : "No discount";

    priceSummary.appendChild(priceValue);
    priceSummary.appendChild(discountValue);

    header.appendChild(titleBlock);
    header.appendChild(priceSummary);
    header.appendChild(cardActions);
    content.appendChild(header);

    const metaGroup = document.createElement("div");
    metaGroup.className = "card-meta-grid";
    const metrics = [
      { label: "Players", value: formatPlayers(item) },
      { label: "Metascore", value: formatScore(item.metascore) },
      { label: "Userscore", value: formatScore(item.userscore) },
      { label: "Popularity", value: item.popularityLabel },
      { label: "Best discount", value: formatDiscount(item.discount) },
      { label: "Match", value: formatMatch(item) },
    ];
    metrics.forEach((metric) => {
      const block = document.createElement("div");
      block.className = "card-metric";
      block.innerHTML = `
        <span class="label">${metric.label}</span>
        <strong>${metric.value}</strong>
      `;
      metaGroup.appendChild(block);
    });

    const tagRow = document.createElement("div");
    tagRow.className = "tag-row";
    tags.forEach((tag) => {
      const tagEl = document.createElement("span");
      tagEl.textContent = tag;
      tagRow.appendChild(tagEl);
    });
    if (extraTags > 0) {
      const tagEl = document.createElement("span");
      tagEl.textContent = `+${extraTags} more`;
      tagRow.appendChild(tagEl);
    }

    const links = document.createElement("div");
    links.className = "meta-links";
    if (item.metacriticUrl) {
      const link = document.createElement("a");
      link.href = item.metacriticUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Metacritic";
      links.appendChild(link);
    } else if (item.metacriticSearchUrl) {
      const link = document.createElement("a");
      link.href = item.metacriticSearchUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Metacritic search";
      links.appendChild(link);
    }

    if (item.notes) {
      const note = document.createElement("span");
      note.textContent = item.notes;
      links.appendChild(note);
    }

    content.appendChild(buildPriceRow(item));
    content.appendChild(metaGroup);
    if (tags.length > 0) content.appendChild(tagRow);
    if (links.childNodes.length > 0) content.appendChild(links);

    card.appendChild(media);
    card.appendChild(content);
    elements.resultsGrid.appendChild(card);
  });
}

function getExperimentScore(item) {
  const raw = item.raw || {};
  const meta = parseNumber(raw.metacritic_metascore ?? item.metascore);
  if (Number.isFinite(meta)) return meta;
  const igdbTotal = parseNumber(raw.igdb_total_rating);
  if (Number.isFinite(igdbTotal)) return igdbTotal;
  const igdbAgg = parseNumber(raw.igdb_aggregated_rating);
  if (Number.isFinite(igdbAgg)) return igdbAgg;
  const igdbUser = parseNumber(raw.igdb_rating);
  if (Number.isFinite(igdbUser)) return igdbUser;
  return -1;
}

function formatMetaValue(value, max = 4) {
  if (Array.isArray(value)) return formatList(value, max);
  if (value === null || value === undefined || value === "") return "--";
  return String(value);
}

function updateExperimentOptions() {
  if (!elements.experimentList) return;
  elements.experimentList.innerHTML = "";
  state.catalogTitles.forEach((title) => {
    const option = document.createElement("option");
    option.value = title;
    elements.experimentList.appendChild(option);
  });
}

function getExperimentItems() {
  const source = state.catalog.length
    ? state.catalog
    : mergeUnique(state.owned, state.wishlist);
  if (!source.length) return [];
  const query = state.experimentQuery.trim().toLowerCase();
  if (query) {
    const queryKey = normalizeTitle(query);
    return source
      .filter((item) => {
        const titleMatch = item.title.toLowerCase().includes(query);
        const keyMatch = queryKey && item.matchKey?.includes(queryKey);
        return titleMatch || keyMatch;
      })
      .slice(0, 6);
  }
  const defaultKey = normalizeTitle(EXPERIMENT_DEFAULT_TITLE);
  const preferred = source.find((item) => item.matchKey === defaultKey);
  if (preferred) return [preferred];
  const sorted = [...source].sort(
    (a, b) => getExperimentScore(b) - getExperimentScore(a)
  );
  return sorted.slice(0, 1);
}

function createExperimentCard(item) {
  const raw = item.raw || {};
  const card = document.createElement("article");
  card.className = "exp-card";
  card.style.setProperty("--accent-left", "#00a3e0");
  card.style.setProperty("--accent-right", "#ff3b9a");

  const media = document.createElement("div");
  media.className = "exp-media";

  const heroUrl =
    raw.igdb_screenshots?.[0] ||
    item.imageWide ||
    raw.image_wide ||
    item.imageSquare ||
    raw.image_square;
  const coverUrl =
    raw.igdb_cover ||
    item.imageSquare ||
    raw.image_square ||
    item.imageWide ||
    raw.image_wide;

  const hero = document.createElement("div");
  hero.className = "exp-hero";
  if (heroUrl) {
    const img = document.createElement("img");
    img.src = heroUrl;
    img.alt = `${item.title} hero art`;
    img.loading = "lazy";
    hero.appendChild(img);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "media-fallback";
    fallback.textContent = item.title.slice(0, 1).toUpperCase();
    hero.appendChild(fallback);
  }

  const cover = document.createElement("div");
  cover.className = "exp-cover";
  if (coverUrl) {
    const img = document.createElement("img");
    img.src = coverUrl;
    img.alt = `${item.title} cover`;
    img.loading = "lazy";
    cover.appendChild(img);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "media-fallback";
    fallback.textContent = item.title.slice(0, 1).toUpperCase();
    cover.appendChild(fallback);
  }

  const mosaic = document.createElement("div");
  mosaic.className = "exp-mosaic";
  const shots = Array.isArray(raw.igdb_screenshots)
    ? raw.igdb_screenshots.slice(1, 7)
    : [];
  shots.forEach((shot) => {
    const tile = document.createElement("div");
    tile.className = "exp-tile";
    const img = document.createElement("img");
    img.src = shot;
    img.alt = `${item.title} screenshot`;
    img.loading = "lazy";
    tile.appendChild(img);
    mosaic.appendChild(tile);
  });

  media.appendChild(hero);
  media.appendChild(cover);
  if (mosaic.childNodes.length > 0) media.appendChild(mosaic);

  const joyLeft = document.createElement("div");
  joyLeft.className = "exp-joycon exp-joycon-left";
  const joyRight = document.createElement("div");
  joyRight.className = "exp-joycon exp-joycon-right";

  const body = document.createElement("div");
  body.className = "exp-body";

  const header = document.createElement("div");
  header.className = "exp-header";

  const heading = document.createElement("div");
  heading.className = "exp-heading";
  const title = document.createElement("h3");
  title.textContent = item.title;
  const release = item.releaseTimestamp
    ? new Date(item.releaseTimestamp).toLocaleDateString()
    : raw.igdb_first_release_date
      ? formatUnixDateSeconds(raw.igdb_first_release_date)
      : "--";
  const categoryRaw =
    raw.igdb_category_label || raw.igdb_category || "unknown category";
  const statusRaw = raw.igdb_status_label || raw.igdb_status || "status unknown";
  const category = formatTypeLabel(categoryRaw);
  const status = formatTypeLabel(statusRaw);
  const subtitle = document.createElement("p");
  subtitle.className = "exp-subline";
  subtitle.textContent = `${formatTypeLabel(item.type)} • ${category} • ${status} • Release ${release}`;
  heading.appendChild(title);
  heading.appendChild(subtitle);

  const actions = document.createElement("div");
  actions.className = "exp-actions";
  const ownedToggle = createIconToggle({
    type: "owned",
    active: item.isOwned,
    label: item.isOwned ? "Remove from owned" : "Mark as owned",
    onClick: () => toggleOwned(item),
  });
  const wishToggle = createIconToggle({
    type: "wishlist",
    active: item.isWished,
    label: item.isWished ? "Remove from wishlist" : "Add to wishlist",
    onClick: () => toggleWishlist(item),
  });
  actions.appendChild(ownedToggle);
  actions.appendChild(wishToggle);

  header.appendChild(heading);
  header.appendChild(actions);

  const summary = document.createElement("p");
  summary.className = "exp-summary";
  summary.textContent =
    raw.igdb_summary ||
    raw.notes ||
    item.notes ||
    "No summary available.";

  const priceBoard = document.createElement("div");
  priceBoard.className = "exp-prices";
  const prices = item.prices || {};
  const regions = ["US", "UK", "EU"];
  regions.forEach((region) => {
    const entry = prices[region] || null;
    const block = document.createElement("div");
    block.className = "exp-price";
    if (entry && entry.discount && entry.discount > 0) {
      block.classList.add("discounted");
    }
    block.innerHTML = `
      <span class="label">${region}</span>
      <strong>${formatRegionPrice(region, entry)}</strong>
      <span class="note">${entry?.discount ? `-${Math.round(entry.discount)}%` : "No discount"}</span>
    `;
    priceBoard.appendChild(block);
  });

  const scoreRow = document.createElement("div");
  scoreRow.className = "exp-scores";
  const scoreItems = [
    {
      label: "Metacritic",
      value: item.metascore,
      count: raw.metacritic_userscore_reviews,
    },
    {
      label: "IGDB Total",
      value: raw.igdb_total_rating,
      count: raw.igdb_total_rating_count,
    },
    {
      label: "IGDB Critics",
      value: raw.igdb_aggregated_rating,
      count: raw.igdb_aggregated_rating_count,
    },
    {
      label: "IGDB Users",
      value: raw.igdb_rating,
      count: raw.igdb_rating_count,
    },
  ];
  scoreItems.forEach((metric) => {
    const block = document.createElement("div");
    block.className = "exp-score";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = metric.label;

    const scoreValue = Number.isFinite(metric.value) ? metric.value : null;
    const gauge = document.createElement("div");
    gauge.className = "exp-score-gauge";
    gauge.style.setProperty("--score", scoreValue ?? 0);
    const gaugeValue = document.createElement("span");
    gaugeValue.textContent = scoreValue !== null ? Math.round(scoreValue) : "--";
    gauge.appendChild(gaugeValue);

    const note = document.createElement("span");
    note.className = "note";
    note.textContent = `${formatCount(metric.count)} ratings`;

    block.appendChild(label);
    block.appendChild(gauge);
    block.appendChild(note);
    scoreRow.appendChild(block);
  });

  const chips = document.createElement("div");
  chips.className = "exp-tags";
  const tagValues = [
    ...(raw.igdb_genres || []),
    ...(raw.igdb_themes || []),
    ...(raw.igdb_game_modes || []),
    ...(raw.igdb_player_perspectives || []),
    ...(raw.igdb_franchises || []),
  ].map((tag) => String(tag).trim());
  const fallbackTags = item.tags.slice(0, 8);
  const uniqueTags = [...new Set([...tagValues, ...fallbackTags])].filter(Boolean);
  uniqueTags.forEach((tag) => {
    const chip = document.createElement("span");
    chip.textContent = tag;
    chips.appendChild(chip);
  });

  const signals = document.createElement("div");
  signals.className = "exp-signals";
  const signalItems = [
    {
      label: "Popularity",
      value: item.popularity,
      max: 2000,
    },
    {
      label: "Hypes",
      value: raw.igdb_hypes,
      max: 200,
    },
    {
      label: "Discount",
      value: item.discount ?? 0,
      max: 100,
      suffix: "%",
    },
  ];
  signalItems.forEach((signal) => {
    const block = document.createElement("div");
    block.className = "exp-signal";
    const rawValue = Number.isFinite(signal.value) ? signal.value : 0;
    const pct =
      signal.max > 0
        ? Math.max(0, Math.min(100, (rawValue / signal.max) * 100))
        : 0;
    block.innerHTML = `
      <span class="label">${signal.label}</span>
      <strong>${formatCount(rawValue)}${signal.suffix || ""}</strong>
      <div class="exp-signal-meter"><span style="width: ${pct}%;"></span></div>
    `;
    signals.appendChild(block);
  });

  const publishers =
    Array.isArray(raw.igdb_publishers) && raw.igdb_publishers.length
      ? raw.igdb_publishers
      : raw.publisher;
  const developers =
    Array.isArray(raw.igdb_developers) && raw.igdb_developers.length
      ? raw.igdb_developers
      : null;

  const sections = [
    {
      title: "Signals",
      rows: [
        { label: "Popularity", value: formatCount(item.popularity) },
        { label: "Hypes", value: formatCount(raw.igdb_hypes) },
        { label: "Userscore", value: formatDecimal(item.userscore, 1) },
        { label: "Metacritic reviews", value: formatCount(raw.metacritic_userscore_reviews) },
      ],
    },
    {
      title: "Taxonomy",
      rows: [
        { label: "Genres", value: formatMetaValue(raw.igdb_genres) },
        { label: "Themes", value: formatMetaValue(raw.igdb_themes) },
        { label: "Franchise", value: formatMetaValue(raw.igdb_franchises, 3) },
        { label: "Modes", value: formatMetaValue(raw.igdb_game_modes) },
        { label: "Perspectives", value: formatMetaValue(raw.igdb_player_perspectives) },
      ],
    },
    {
      title: "Production",
      rows: [
        { label: "Developers", value: formatMetaValue(developers) },
        { label: "Publishers", value: formatMetaValue(publishers) },
        { label: "Platforms", value: formatMetaValue(raw.igdb_platforms) },
        { label: "Age rating", value: raw.age_rating || raw.age_rating_code || "--" },
        { label: "Players", value: formatPlayers(item) },
      ],
    },
    {
      title: "Identifiers",
      rows: [
        { label: "IGDB ID", value: formatMetaValue(raw.igdb_id) },
        { label: "NSUID", value: formatMetaValue(raw.nsuid, 2) },
        { label: "SKU", value: raw.sku || "--" },
        { label: "Nintendo URL", value: raw.nintendo_url || item.nintendoUrl || "--" },
        { label: "Metacritic URL", value: item.metacriticUrl || item.metacriticSearchUrl || "--" },
      ],
    },
  ];

  const sectionGrid = document.createElement("div");
  sectionGrid.className = "exp-sections";
  sections.forEach((section) => {
    const block = document.createElement("div");
    block.className = "exp-section";
    const heading = document.createElement("h4");
    heading.textContent = section.title;
    const list = document.createElement("div");
    list.className = "exp-kv";
    section.rows.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "exp-row";
      rowEl.innerHTML = `
        <span class="label">${row.label}</span>
        <strong>${row.value}</strong>
      `;
      list.appendChild(rowEl);
    });
    block.appendChild(heading);
    block.appendChild(list);
    sectionGrid.appendChild(block);
  });

  const links = document.createElement("div");
  links.className = "exp-links";
  const linkItems = [
    { label: "Nintendo", url: item.nintendoUrl || raw.nintendo_url || "" },
    { label: "Metacritic", url: item.metacriticUrl || item.metacriticSearchUrl || "" },
    { label: "IGDB", url: raw.igdb_url || "" },
  ];
  const extraLinks = Array.isArray(raw.igdb_websites)
    ? raw.igdb_websites.slice(0, 3)
    : [];
  extraLinks.forEach((url, idx) => {
    linkItems.push({ label: `Link ${idx + 1}`, url });
  });

  linkItems.forEach((link) => {
    if (!link.url) return;
    const a = document.createElement("a");
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = link.label;
    links.appendChild(a);
  });

  body.appendChild(header);
  body.appendChild(summary);
  body.appendChild(priceBoard);
  body.appendChild(scoreRow);
  body.appendChild(signals);
  if (chips.childNodes.length > 0) body.appendChild(chips);
  body.appendChild(sectionGrid);
  if (links.childNodes.length > 0) body.appendChild(links);

  card.appendChild(joyLeft);
  card.appendChild(joyRight);
  card.appendChild(media);
  card.appendChild(body);
  return card;
}

function renderExperiment() {
  if (!elements.experimentGrid) return;
  const items = getExperimentItems();
  elements.experimentGrid.innerHTML = "";

  if (elements.experimentMeta) {
    const label = state.experimentQuery
      ? `Showing ${items.length} matches for "${state.experimentQuery}".`
      : `Showcasing ${EXPERIMENT_DEFAULT_TITLE}.`;
    elements.experimentMeta.textContent = label;
  }

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      "No titles available yet. Load the master catalog to preview.";
    elements.experimentGrid.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    elements.experimentGrid.appendChild(createExperimentCard(item));
  });
}

async function loadMetacriticCache() {
  try {
    const response = await fetch(DEFAULT_METACRITIC_PATH, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    state.metacriticMap = normalizeMetacriticCache(data);
    if (state.metacriticMap.size === 0) return;
    mergeMetacriticIntoItems(state.owned);
    mergeMetacriticIntoItems(state.wishlist);
    mergeMetacriticIntoItems(state.catalog);
    updateFilterOptions();
    applyFilters();
  } catch (error) {
    // Optional cache; ignore failures.
  }
}

async function loadDefaultOwned() {
  setStatus(elements.ownedStatus, "Loading owned list...");
  try {
    const response = await fetch(DEFAULT_OWNED_PATH, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load file");
    const data = await response.json();
    const items = getDatasetItems(data, "owned");
    state.ownedMeta = getDatasetMeta(data);
    const version = getDatasetVersion(data);
    state.owned = normalizeArray(items);
    state.ownedEmptyMessage = null;
    mergeMetacriticIntoItems(state.owned);
    setStatus(elements.ownedStatus, "");
    updateFilterOptions();
    applyFilters();
    renderOwnedEditor();
    updateCatalogTitleOptions();
  } catch (error) {
    state.owned = [];
    state.ownedEmptyMessage =
      "No owned titles loaded yet. Add a title or upload your owned list.";
    setStatus(elements.ownedStatus, "");
    updateFilterOptions();
    applyFilters();
    renderOwnedEditor();
    updateCatalogTitleOptions();
  }
}

async function loadDefaultWishlist() {
  setStatus(elements.wishlistStatus, "Loading default wishlist...");
  try {
    const response = await fetch(DEFAULT_WISHLIST_PATH, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load file");
    const data = await response.json();
    const items = getDatasetItems(data, "wishlist");
    state.wishlistMeta = getDatasetMeta(data);
    state.wishlist = normalizeArray(items);
    state.wishlistEmptyMessage = null;
    mergeMetacriticIntoItems(state.wishlist);
    setStatus(elements.wishlistStatus, "");
    updateFilterOptions();
    applyFilters();
    renderWishlistEditor();
    updateCatalogTitleOptions();
  } catch (error) {
    state.wishlist = [];
    state.wishlistEmptyMessage =
      "No wishlist titles loaded yet. Add a title or upload your wishlist.";
    setStatus(elements.wishlistStatus, "");
    updateFilterOptions();
    applyFilters();
    renderWishlistEditor();
    updateCatalogTitleOptions();
  }
}

async function loadDefaultCatalog() {
  await loadCatalogFromUrl(DEFAULT_STORE_PATH, "master catalog", true);
}

function wishlistPayload() {
  return state.wishlist.map((item) => {
    const entry = { key: item.key || item.matchKey };
    if (item.title) entry.title = item.title;
    const addedAt =
      item.addedAt || item.raw?.added_at || item.raw?.addedAt || null;
    if (addedAt) entry.added_at = addedAt;
    return entry;
  });
}

function updateWishlistStatus(message, isError = false) {
  setStatus(
    elements.wishlistStatus,
    message || "",
    isError
  );
}

function ownedPayload() {
  return state.owned.map((item) => {
    const entry = { key: item.key || item.matchKey };
    if (item.title) entry.title = item.title;
    const addedAt =
      item.addedAt || item.raw?.added_at || item.raw?.addedAt || null;
    if (addedAt) entry.added_at = addedAt;
    return entry;
  });
}

function updateOwnedStatus(message, isError = false) {
  setStatus(
    elements.ownedStatus,
    message || "",
    isError
  );
}

function renderOwnedEditor() {
  if (!elements.ownedList) return;
  elements.ownedList.innerHTML = "";
  const entries = state.owned.map((item, index) => ({ item, index }));
  const sortKey = elements.ownedSort?.value || state.ownedSort;
  const sorted =
    sortKey === "title"
      ? entries.sort((a, b) =>
          resolveTitle(a.item).localeCompare(resolveTitle(b.item))
        )
      : sortKey === "title-desc"
        ? entries.sort((a, b) =>
            resolveTitle(b.item).localeCompare(resolveTitle(a.item))
          )
        : entries.sort((a, b) => {
            const aTime = a.item.addedAt ? Date.parse(a.item.addedAt) : 0;
            const bTime = b.item.addedAt ? Date.parse(b.item.addedAt) : 0;
            if (bTime !== aTime) return bTime - aTime;
            return b.index - a.index;
          });

  if (elements.ownedCount) {
    elements.ownedCount.textContent = `Library: ${state.owned.length} titles owned currently`;
  }

  if (sorted.length === 0) {
    const empty = document.createElement("li");
    empty.className = "list-empty";
    empty.textContent =
      state.ownedEmptyMessage || "No owned titles yet.";
    elements.ownedList.appendChild(empty);
    return;
  }

  sorted.forEach(({ item, index }) => {
    const row = document.createElement("li");
    row.className = "list-item";

    const titleBlock = document.createElement("div");
    titleBlock.className = "list-title";
    const title = document.createElement("span");
    title.className = "list-name";
    title.textContent = resolveTitle(item);
    titleBlock.appendChild(title);
    const meta = document.createElement("span");
    meta.className = "list-meta";
    meta.textContent = `Added ${item.addedAt ? formatDateShort(item.addedAt) : "--"}`;
    titleBlock.appendChild(meta);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost danger";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      state.owned = state.owned.filter((_, idx) => idx !== index);
      if (state.owned.length === 0) {
        state.ownedEmptyMessage = null;
      }
      updateFilterOptions();
      applyFilters();
      renderOwnedEditor();
      updateOwnedStatus();
      updateCatalogTitleOptions();
      saveOwnedToDisk();
    });

    row.appendChild(titleBlock);
    row.appendChild(remove);
    elements.ownedList.appendChild(row);
  });
}

function renderWishlistEditor() {
  if (!elements.wishlistList) return;
  elements.wishlistList.innerHTML = "";
  const entries = state.wishlist.map((item, index) => ({ item, index }));
  const sortKey = elements.wishlistSort?.value || state.wishlistSort;
  const sorted =
    sortKey === "title"
      ? entries.sort((a, b) =>
          resolveTitle(a.item).localeCompare(resolveTitle(b.item))
        )
      : sortKey === "title-desc"
        ? entries.sort((a, b) =>
            resolveTitle(b.item).localeCompare(resolveTitle(a.item))
          )
        : entries.sort((a, b) => {
            const aTime = a.item.addedAt ? Date.parse(a.item.addedAt) : 0;
            const bTime = b.item.addedAt ? Date.parse(b.item.addedAt) : 0;
            if (bTime !== aTime) return bTime - aTime;
            return b.index - a.index;
          });

  if (elements.wishlistCount) {
    elements.wishlistCount.textContent = `Library: ${state.wishlist.length} wishlist titles currently`;
  }

  if (sorted.length === 0) {
    const empty = document.createElement("li");
    empty.className = "list-empty";
    empty.textContent =
      state.wishlistEmptyMessage || "No wishlist titles yet.";
    elements.wishlistList.appendChild(empty);
    return;
  }

  sorted.forEach(({ item, index }) => {
    const row = document.createElement("li");
    row.className = "list-item";

    const titleBlock = document.createElement("div");
    titleBlock.className = "list-title";
    const title = document.createElement("span");
    title.className = "list-name";
    title.textContent = resolveTitle(item);
    titleBlock.appendChild(title);
    const meta = document.createElement("span");
    meta.className = "list-meta";
    meta.textContent = `Added ${item.addedAt ? formatDateShort(item.addedAt) : "--"}`;
    titleBlock.appendChild(meta);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost danger";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      state.wishlist = state.wishlist.filter((_, idx) => idx !== index);
      if (state.wishlist.length === 0) {
        state.wishlistEmptyMessage = null;
      }
      updateFilterOptions();
      applyFilters();
      renderWishlistEditor();
      updateWishlistStatus();
      updateCatalogTitleOptions();
      saveWishlistToDisk();
    });

    row.appendChild(titleBlock);
    row.appendChild(remove);
    elements.wishlistList.appendChild(row);
  });
}

function addOwnedTitle(title) {
  const trimmed = String(title || "").trim();
  if (!trimmed) return;
  const matchKey = normalizeTitle(trimmed);
  if (state.owned.some((item) => item.matchKey === matchKey)) return;

  const entry = normalizeItem({
    title: trimmed,
    key: matchKey,
    ownership: "owned",
    added_at: new Date().toISOString(),
  });
  state.owned = [...state.owned, entry];
  state.ownedEmptyMessage = null;
  updateFilterOptions();
  applyFilters();
  renderOwnedEditor();
  updateOwnedStatus();
  updateCatalogTitleOptions();
  saveOwnedToDisk();
}

function addWishlistTitle(title) {
  const trimmed = String(title || "").trim();
  if (!trimmed) return;
  const matchKey = normalizeTitle(trimmed);
  if (state.wishlist.some((item) => item.matchKey === matchKey)) return;

  const entry = normalizeItem({
    title: trimmed,
    key: matchKey,
    ownership: "wishlist",
    added_at: new Date().toISOString(),
  });
  state.wishlist = [...state.wishlist, entry];
  state.wishlistEmptyMessage = null;
  updateFilterOptions();
  applyFilters();
  renderWishlistEditor();
  updateWishlistStatus();
  updateCatalogTitleOptions();
  saveWishlistToDisk();
}

function downloadOwned() {
  const payload = ownedPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "owned.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadWishlist() {
  const payload = wishlistPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "wish_list.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadCatalog() {
  if (!state.catalog || state.catalog.length === 0) return;
  const payload = {
    metadata: state.catalogMeta || {},
    items: state.catalog.map((item) => item.raw || item),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "store_catalog.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function saveOwnedToDisk() {
  const payload = ownedPayload();
  try {
    const response = await fetch("/api/owned", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Save failed");
    }
    updateOwnedStatus("");
  } catch (error) {
    updateOwnedStatus(error.message || "Could not save owned list.", true);
  }
}

async function saveWishlistToDisk() {
  const payload = wishlistPayload();
  try {
    const response = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Save failed");
    }
    updateWishlistStatus("");
  } catch (error) {
    updateWishlistStatus(
      error.message || "Could not save wishlist to disk.",
      true
    );
  }
}

function toggleOwned(item) {
  const matchKey = item.key || item.matchKey || normalizeTitle(item.title);
  const exists = state.owned.some((entry) => entry.matchKey === matchKey);
  if (exists) {
    state.owned = state.owned.filter((entry) => entry.matchKey !== matchKey);
  } else {
    state.owned = [
      ...state.owned,
      normalizeItem({
        title: item.title,
        key: matchKey,
        ownership: "owned",
        added_at: new Date().toISOString(),
      }),
    ];
  }
  updateFilterOptions();
  applyFilters();
  renderOwnedEditor();
  updateOwnedStatus();
  updateCatalogTitleOptions();
  saveOwnedToDisk();
}

function toggleWishlist(item) {
  const matchKey = item.key || item.matchKey || normalizeTitle(item.title);
  const exists = state.wishlist.some((entry) => entry.matchKey === matchKey);
  if (exists) {
    state.wishlist = state.wishlist.filter((entry) => entry.matchKey !== matchKey);
  } else {
    state.wishlist = [
      ...state.wishlist,
      normalizeItem({
        title: item.title,
        key: matchKey,
        ownership: "wishlist",
        added_at: new Date().toISOString(),
      }),
    ];
  }
  updateFilterOptions();
  applyFilters();
  renderWishlistEditor();
  updateWishlistStatus();
  updateCatalogTitleOptions();
  saveWishlistToDisk();
}

async function loadCatalogFromUrl(path, label, merge = false) {
  setStatus(elements.catalogStatus, `Loading ${label}...`);
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load file");
    const data = await response.json();
    const normalized = normalizeDataset(data, "items");
    state.catalog = merge ? mergeStoreCatalogs(normalized) : normalized;
    refreshCatalogMap();
    state.catalogMeta = getDatasetMeta(data) || data.metadata || null;
    mergeMetacriticIntoItems(state.catalog);
    setStatus(
      elements.catalogStatus,
      `Loaded from ${label}`
    );
    renderCatalogStats();
    renderCatalogMeta();
    applyCatalogMetaToControls();
    updateFilterOptions();
    applyFilters();
    updateCatalogTitleOptions();
  } catch (error) {
    setStatus(
      elements.catalogStatus,
      `${label} not found. Run the import script or upload a JSON file instead.`,
      true
    );
  }
}

async function refreshCatalog() {
  if (!elements.catalogRefresh) return;
  elements.catalogRefresh.disabled = true;
  elements.catalogRefresh.textContent = "Refreshing...";
  setStatus(elements.catalogStatus, "Refreshing master catalog...");
  try {
    const payload = {
      metascoreMin: parseNumber(elements.catalogMetascore?.value),
      recentMonths: parseNumber(elements.catalogRecent?.value),
      popularityMin: parseNumber(elements.catalogPopularity?.value),
      requireReleaseDate: elements.catalogRequireRelease?.checked ?? true,
    };
    const response = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Refresh failed");
    }
    const result = await response.json();
    await loadDefaultCatalog();
    const addedLabel =
      result.added !== undefined ? ` Added ${result.added} new.` : "";
    const totalLabel =
      result.total !== undefined ? ` Total ${result.total}.` : "";
    setStatus(
      elements.catalogStatus,
      `Refreshed${addedLabel}${totalLabel}`
    );
  } catch (error) {
    setStatus(
      elements.catalogStatus,
      error.message || "Refresh failed. See server logs for details.",
      true
    );
  } finally {
    elements.catalogRefresh.disabled = false;
    elements.catalogRefresh.textContent = "Refresh catalog";
  }
}

async function loadFromFile(file, target) {
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const items =
      target === "owned"
        ? getDatasetItems(data, "owned")
        : target === "wishlist"
          ? getDatasetItems(data, "wishlist")
          : getDatasetItems(data, "items");
    const normalized = normalizeArray(items);
    const version = getDatasetVersion(data);

    if (target === "owned") {
      state.owned = normalized;
      state.ownedMeta = getDatasetMeta(data);
      mergeMetacriticIntoItems(state.owned);
      setStatus(
        elements.ownedStatus,
        `Loaded ${state.owned.length} owned titles${formatVersionLabel(
          version
        )} from ${file.name}.`
      );
      renderOwnedEditor();
    } else if (target === "wishlist") {
      state.wishlist = normalized;
      state.wishlistMeta = getDatasetMeta(data);
      mergeMetacriticIntoItems(state.wishlist);
      setStatus(
        elements.wishlistStatus,
        `Loaded ${state.wishlist.length} wishlist titles from ${file.name}.`
      );
      renderWishlistEditor();
    } else {
      state.catalog = mergeStoreCatalogs(normalized);
      refreshCatalogMap();
      state.catalogMeta = getDatasetMeta(data) || data.metadata || null;
      mergeMetacriticIntoItems(state.catalog);
      setStatus(
        elements.catalogStatus,
        `Loaded from ${file.name}`
      );
    }

    renderCatalogStats();
    renderCatalogMeta();
    applyCatalogMetaToControls();
    updateFilterOptions();
    applyFilters();
    updateCatalogTitleOptions();
  } catch (error) {
    const message = `Could not read ${file.name}. Make sure it is valid JSON.`;
    if (target === "owned") {
      setStatus(elements.ownedStatus, message, true);
    } else if (target === "wishlist") {
      setStatus(elements.wishlistStatus, message, true);
    } else {
      setStatus(elements.catalogStatus, message, true);
    }
  }
}

function clearCatalog() {
  state.catalog = [];
  refreshCatalogMap();
  state.catalogMeta = null;
  setStatus(elements.catalogStatus, "No data loaded.");
  if (elements.catalogStats) elements.catalogStats.innerHTML = "";
  if (elements.catalogMeta) elements.catalogMeta.innerHTML = "";
  updateFilterOptions();
  applyFilters();
  updateCatalogTitleOptions();
}

function setupEventListeners() {
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab);
    });
  });
  if (elements.reloadOwned) {
    elements.reloadOwned.addEventListener("click", () => loadDefaultOwned());
  }
  if (elements.reloadWishlist) {
    elements.reloadWishlist.addEventListener("click", () => loadDefaultWishlist());
  }
  if (elements.ownedAdd && elements.ownedInput) {
    elements.ownedAdd.addEventListener("click", () => {
      addOwnedTitle(elements.ownedInput.value);
      elements.ownedInput.value = "";
      elements.ownedInput.focus();
      closeOwnedAutocomplete();
    });
    elements.ownedInput.addEventListener("input", updateOwnedAutocomplete);
    elements.ownedInput.addEventListener("focus", updateOwnedAutocomplete);
    elements.ownedInput.addEventListener("blur", () => {
      setTimeout(() => closeOwnedAutocomplete(), 120);
    });
    elements.ownedInput.addEventListener("keydown", (event) => {
      if (handleOwnedAutocompleteKeydown(event)) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        elements.ownedAdd.click();
      }
    });
  }
  if (elements.wishlistAdd && elements.wishlistInput) {
    elements.wishlistAdd.addEventListener("click", () => {
      addWishlistTitle(elements.wishlistInput.value);
      elements.wishlistInput.value = "";
      elements.wishlistInput.focus();
      closeWishlistAutocomplete();
    });
    elements.wishlistInput.addEventListener("input", updateWishlistAutocomplete);
    elements.wishlistInput.addEventListener("focus", updateWishlistAutocomplete);
    elements.wishlistInput.addEventListener("blur", () => {
      setTimeout(() => closeWishlistAutocomplete(), 120);
    });
    elements.wishlistInput.addEventListener("keydown", (event) => {
      if (handleWishlistAutocompleteKeydown(event)) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        elements.wishlistAdd.click();
      }
    });
  }
  if (elements.wishlistDownload) {
    elements.wishlistDownload.addEventListener("click", downloadWishlist);
  }
  if (elements.wishlistSave) {
    elements.wishlistSave.addEventListener("click", saveWishlistToDisk);
  }
  if (elements.wishlistClear) {
    elements.wishlistClear.addEventListener("click", () => {
      if (!window.confirm("Clear the entire wishlist? This cannot be undone.")) {
        return;
      }
      state.wishlist = [];
      state.wishlistEmptyMessage = null;
      updateFilterOptions();
      applyFilters();
      renderWishlistEditor();
      updateWishlistStatus();
      saveWishlistToDisk();
    });
  }
  if (elements.ownedDownload) {
    elements.ownedDownload.addEventListener("click", downloadOwned);
  }
  if (elements.ownedSave) {
    elements.ownedSave.addEventListener("click", saveOwnedToDisk);
  }
  if (elements.ownedClear) {
    elements.ownedClear.addEventListener("click", () => {
      if (!window.confirm("Clear the entire owned list? This cannot be undone.")) {
        return;
      }
      state.owned = [];
      state.ownedEmptyMessage = null;
      updateFilterOptions();
      applyFilters();
      renderOwnedEditor();
      updateOwnedStatus();
      saveOwnedToDisk();
    });
  }
  if (elements.ownedSort) {
    elements.ownedSort.addEventListener("change", (event) => {
      state.ownedSort = event.target.value;
      renderOwnedEditor();
    });
  }
  if (elements.wishlistSort) {
    elements.wishlistSort.addEventListener("change", (event) => {
      state.wishlistSort = event.target.value;
      renderWishlistEditor();
    });
  }
  elements.ownedFile.addEventListener("change", (event) => {
    loadFromFile(event.target.files[0], "owned");
  });
  elements.wishlistFile.addEventListener("change", (event) => {
    loadFromFile(event.target.files[0], "wishlist");
  });
  elements.catalogFile.addEventListener("change", (event) => {
    loadFromFile(event.target.files[0], "catalog");
  });
  if (elements.catalogDownload) {
    elements.catalogDownload.addEventListener("click", downloadCatalog);
  }
  elements.clearCatalog.addEventListener("click", clearCatalog);
  if (elements.catalogRefresh) {
    elements.catalogRefresh.addEventListener("click", refreshCatalog);
  }

  if (elements.experimentInput) {
    elements.experimentInput.addEventListener("input", () => {
      state.experimentQuery = elements.experimentInput.value || "";
      renderExperiment();
    });
  }

  elements.searchInput.addEventListener("input", applyFilters);
  elements.regionSelect.addEventListener("change", applyFilters);
  if (elements.sortSelectButton) {
    elements.sortSelectButton.addEventListener("click", () => {
      toggleSortMenu();
    });
  }
  elements.discountMin?.addEventListener("input", applyFilters);
  elements.discountMax?.addEventListener("input", applyFilters);
  elements.metascoreMin?.addEventListener("input", applyFilters);
  elements.metascoreMax?.addEventListener("input", applyFilters);
  elements.matchesToggle.addEventListener("change", applyFilters);
  bindRangeControls({
    sliderMin: elements.discountSliderMin,
    sliderMax: elements.discountSliderMax,
    inputMin: elements.discountMin,
    inputMax: elements.discountMax,
  });
  bindRangeControls({
    sliderMin: elements.metascoreSliderMin,
    sliderMax: elements.metascoreSliderMax,
    inputMin: elements.metascoreMin,
    inputMax: elements.metascoreMax,
  });
  updateRangeFromSliders(
    elements.discountMin,
    elements.discountMax,
    elements.discountSliderMin,
    elements.discountSliderMax
  );
  updateRangeFromSliders(
    elements.metascoreMin,
    elements.metascoreMax,
    elements.metascoreSliderMin,
    elements.metascoreSliderMax
  );
  elements.playersFilter.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      setPlayersFilterValue(button.dataset.value);
      applyFilters();
    });
  });

  if (elements.typeSelectButton) {
    elements.typeSelectButton.addEventListener("click", () => {
      toggleTypeMenu();
    });
  }

  document.addEventListener("click", (event) => {
    if (!elements.ownedAutocomplete || !elements.ownedInput) return;
    if (
      elements.ownedAutocomplete.contains(event.target) ||
      elements.ownedInput.contains(event.target)
    ) {
      return;
    }
    closeOwnedAutocomplete();
  });

  document.addEventListener("click", (event) => {
    if (!elements.wishlistAutocomplete || !elements.wishlistInput) return;
    if (
      elements.wishlistAutocomplete.contains(event.target) ||
      elements.wishlistInput.contains(event.target)
    ) {
      return;
    }
    closeWishlistAutocomplete();
  });

  document.addEventListener("click", (event) => {
    if (!elements.typeSelectMenu || !elements.typeSelectButton) return;
    const withinMenu = elements.typeSelectMenu.contains(event.target);
    const withinButton = elements.typeSelectButton.contains(event.target);
    if (!withinMenu && !withinButton) {
      toggleTypeMenu(false);
    }
  });

  document.addEventListener("click", (event) => {
    if (!elements.sortSelectMenu || !elements.sortSelectButton) return;
    const withinMenu = elements.sortSelectMenu.contains(event.target);
    const withinButton = elements.sortSelectButton.contains(event.target);
    if (!withinMenu && !withinButton) {
      toggleSortMenu(false);
    }
  });

  if (elements.highlightFilters) {
    elements.highlightFilters.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const filterKey = button.dataset.filter;
        if (!filterKey) return;
        button.classList.toggle("active");
        if (state.highlightFilters.has(filterKey)) {
          state.highlightFilters.delete(filterKey);
        } else {
          state.highlightFilters.add(filterKey);
        }
        applyFilters();
      });
    });
  }
}

setupEventListeners();
setActiveTab("browse");
loadMetacriticCache();
loadDefaultOwned();
loadDefaultWishlist();
loadDefaultCatalog();

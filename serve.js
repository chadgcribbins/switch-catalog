const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { spawn } = require("child_process");

const root = __dirname;
const port = Number(process.env.PORT || 5500);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};

let refreshPromise = null;
let catalogPromise = null;

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const resolved = path.normalize(path.join(root, decoded));
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

function isLocalRequest(req) {
  const addr = req.socket.remoteAddress;
  return (
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "::ffff:127.0.0.1"
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 5_000_000) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function runScript(scriptPath, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: root,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function collectMatchKeys(items) {
  const keys = new Set();
  if (!Array.isArray(items)) return keys;
  items.forEach((item) => {
    if (!item) return;
    const title =
      item.title || item.canonical_title || item.name || item.title_master_s;
    const key = normalizeTitle(title);
    if (key) keys.add(key);
  });
  return keys;
}

async function handleRefresh(url, req, res) {
  if (!isLocalRequest(req)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (req.method !== "POST" && req.method !== "GET") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  if (refreshPromise) {
    res.writeHead(409);
    res.end("Refresh already running.");
    return;
  }

  const preset = url.searchParams.get("preset");
  const targets =
    preset === "us"
      ? ["import-nintendo-us.js"]
      : preset === "uk"
        ? ["import-nintendo-uk.js"]
        : preset === "both"
          ? ["import-nintendo-us.js", "import-nintendo-uk.js"]
          : null;

  if (!targets) {
    res.writeHead(400);
    res.end("Unknown preset. Use us, uk, or both.");
    return;
  }

  refreshPromise = (async () => {
    const results = [];
    for (const script of targets) {
      const scriptPath = path.join(root, script);
      const result = await runScript(scriptPath, ["--all"]);
      results.push({ script, ...result });
    }
    return results;
  })();

  try {
    const results = await refreshPromise;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, preset, results }));
  } catch (error) {
    res.writeHead(500);
    res.end(error.message || "Refresh failed.");
  } finally {
    refreshPromise = null;
  }
}

async function handleCatalog(req, res) {
  if (!isLocalRequest(req)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  if (catalogPromise) {
    res.writeHead(409);
    res.end("Catalog refresh already running.");
    return;
  }

  let payload = {};
  try {
    const body = await readBody(req);
    payload = body ? JSON.parse(body) : {};
  } catch (error) {
    res.writeHead(400);
    res.end("Invalid payload.");
    return;
  }

  const existingCatalogPath = path.join(root, "store_catalog.json");
  let previousKeys = new Set();
  if (fs.existsSync(existingCatalogPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(existingCatalogPath, "utf8"));
      previousKeys = collectMatchKeys(existing.items || existing);
    } catch (error) {
      previousKeys = new Set();
    }
  }

  catalogPromise = (async () => {
    const results = [];
    const imports = ["import-nintendo-us.js", "import-nintendo-uk.js"];
    for (const script of imports) {
      const scriptPath = path.join(root, script);
      const result = await runScript(scriptPath, ["--all"]);
      results.push({ script, ...result });
    }

    const buildArgs = [];
    if (Number.isFinite(payload.metascoreMin)) {
      buildArgs.push("--metascore", String(payload.metascoreMin));
    }
    if (Number.isFinite(payload.popularityMin)) {
      buildArgs.push("--popularity", String(payload.popularityMin));
    }
    if (Number.isFinite(payload.recentMonths)) {
      buildArgs.push("--recent-months", String(payload.recentMonths));
    }
    if (payload.requireReleaseDate === false) {
      buildArgs.push("--allow-missing-release");
    } else {
      buildArgs.push("--require-release");
    }

    const buildPath = path.join(root, "build-store-catalog.js");
    const buildResult = await runScript(buildPath, buildArgs);
    results.push({ script: "build-store-catalog.js", ...buildResult });

    return results;
  })();

  try {
    const results = await catalogPromise;
    let added = null;
    let total = null;
    if (fs.existsSync(existingCatalogPath)) {
      try {
        const nextCatalog = JSON.parse(
          fs.readFileSync(existingCatalogPath, "utf8")
        );
        const nextKeys = collectMatchKeys(nextCatalog.items || nextCatalog);
        added = [...nextKeys].filter((key) => !previousKeys.has(key)).length;
        total = nextKeys.size;
      } catch (error) {
        // ignore
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, added, total, results }));
  } catch (error) {
    res.writeHead(500);
    res.end(error.message || "Catalog refresh failed.");
  } finally {
    catalogPromise = null;
  }
}

async function handleWishlist(req, res) {
  if (!isLocalRequest(req)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  try {
    const body = await readBody(req);
    const data = JSON.parse(body || "[]");
    if (!Array.isArray(data)) {
      res.writeHead(400);
      res.end("Wishlist payload must be an array.");
      return;
    }
    const filePath = path.join(root, "wish_list.json");
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, count: data.length }));
  } catch (error) {
    res.writeHead(400);
    res.end(error.message || "Invalid wishlist payload.");
  }
}

async function handleOwned(req, res) {
  if (!isLocalRequest(req)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  try {
    const body = await readBody(req);
    const data = JSON.parse(body || "[]");
    if (!Array.isArray(data)) {
      res.writeHead(400);
      res.end("Owned payload must be an array.");
      return;
    }
    const filePath = path.join(root, "owned.json");
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, count: data.length }));
  } catch (error) {
    res.writeHead(400);
    res.end(error.message || "Invalid owned payload.");
  }
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = mimeTypes[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/refresh") {
    handleRefresh(url, req, res);
    return;
  }
  if (url.pathname === "/api/catalog") {
    handleCatalog(req, res);
    return;
  }
  if (url.pathname === "/api/wishlist") {
    handleWishlist(req, res);
    return;
  }
  if (url.pathname === "/api/owned") {
    handleOwned(req, res);
    return;
  }
  let filePath = url.pathname === "/" ? "/app/index.html" : url.pathname;

  const safe = safePath(filePath);
  if (!safe) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(safe, (err, stats) => {
    if (!err && stats.isDirectory()) {
      const indexPath = path.join(safe, "index.html");
      fs.access(indexPath, fs.constants.R_OK, (indexErr) => {
        if (indexErr) {
          res.writeHead(404);
          res.end("Not found");
        } else {
          sendFile(res, indexPath);
        }
      });
      return;
    }

    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    sendFile(res, safe);
  });
});

server.listen(port, () => {
  console.log(`Switch catalog server running at http://127.0.0.1:${port}/`);
});

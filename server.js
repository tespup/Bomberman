#!/usr/bin/env node
/**
 * Zero-dependency static server for BombMan.
 * The game is a pure static Telegram Mini App; deploy this folder to any HTTPS host.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

function safeResolve(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  const target = resolve(join(root, normalize(decoded)));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

const server = createServer((req, res) => {
  let fullPath = safeResolve(req.url || "/");
  if (!fullPath) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
    fullPath = join(fullPath, "index.html");
  }

  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
    // Single-page application fallback: real 404 for asset requests.
    if (extname(fullPath)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    fullPath = join(root, "index.html");
  }

  const ext = extname(fullPath).toLowerCase();
  res.writeHead(200, {
    "content-type": MIME[ext] || "application/octet-stream",
    "cache-control": "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin"
  });
  createReadStream(fullPath).pipe(res);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log("");
    console.log(`  BombMan уже запущен на http://127.0.0.1:${port}`);
    console.log("  Просто откройте эту ссылку в браузере.");
    console.log("  Это окно можно закрыть.");
    console.log("");
    setTimeout(() => process.exit(0), 1800);
    return;
  }
  console.error("BombMan server error:", error);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`\n  BOMBMAN dev server\n  → http://localhost:${port}\n  → host: ${host}\n`);
});

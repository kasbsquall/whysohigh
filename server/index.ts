// Web server for Why So High: one JSON endpoint that runs Linda's demo through
// the same agent pipeline as the CLI, plus the built page from web/dist.
//   npm run serve            (after npm run web:build)
// Binds to 127.0.0.1 unless HOST says otherwise. Without .env it runs in SAMPLE_MODE.

import { createReadStream, existsSync, mkdtempSync, statSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { demoPayload, runLindaDemo, type DemoPayload } from "../src/demo.ts";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 8787);
const DIST = resolve("web", "dist");

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
};

/** The demo runs once per server process; every request reads the same result. */
let demo: Promise<DemoPayload> | null = null;
const loadDemo = (): Promise<DemoPayload> => {
  demo ??= runLindaDemo(join(mkdtempSync(join(tmpdir(), "wsh-web-")), "memory"))
    .then(demoPayload)
    .catch((error: unknown) => {
      demo = null;
      throw error;
    });
  return demo;
};

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { "content-type": type, "x-content-type-options": "nosniff", "cache-control": "no-store" });
  res.end(body);
}

function serveStatic(path: string, res: ServerResponse): void {
  const file = normalize(join(DIST, path === "/" ? "index.html" : path));
  if (!file.startsWith(DIST + sep) || !existsSync(file) || !statSync(file).isFile()) {
    send(res, 404, "text/plain; charset=utf-8", "Not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "x-content-type-options": "nosniff" });
  createReadStream(file)
    .on("error", (error) => {
      process.stderr.write(`Could not read ${file}: ${error.message}
`);
      res.destroy();
    })
    .pipe(res);
}

/** The request path, or null when the URL cannot be parsed (for example "//" or "http://["). */
function pathOf(url: string | undefined): string | null {
  try {
    return new URL(url ?? "/", "http://localhost").pathname;
  } catch {
    return null;
  }
}

const server = createServer((req, res) => {
  const path = pathOf(req.url);
  if (path === null) {
    send(res, 400, "text/plain; charset=utf-8", "Bad request");
    return;
  }
  if (req.method !== "GET") {
    send(res, 405, "text/plain; charset=utf-8", "Method not allowed");
    return;
  }
  if (path === "/api/demo") {
    loadDemo().then(
      (payload) => send(res, 200, "application/json; charset=utf-8", JSON.stringify(payload)),
      (error: unknown) => {
        process.stderr.write(`Demo failed: ${(error as Error).message}\n`);
        send(res, 500, "application/json; charset=utf-8", JSON.stringify({ error: "The agents could not finish this run. Please try again in a minute." }));
      },
    );
    return;
  }
  serveStatic(path, res);
});

server.listen(PORT, HOST, () => process.stdout.write(`Why So High on http://${HOST}:${PORT}\n`));

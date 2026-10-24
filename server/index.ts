// Web server for Why So High: GET /api/demo runs Linda's demo through the same
// agent pipeline as the CLI, POST /api/run runs one request (input_examples/),
// and the built page is served from web/dist.
//   npm run serve            (after npm run web:build)
// Binds to 127.0.0.1 unless HOST says otherwise. Without .env it runs in SAMPLE_MODE.

import { createReadStream, existsSync, mkdtempSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { demoPayload, runLindaDemo, type DemoPayload } from "../src/demo.ts";
import { InputError, parseRunInput } from "../src/input.ts";
import { runRequest } from "../src/runRequest.ts";
import { createRuntime } from "../src/runtime.ts";

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

const MAX_BODY_BYTES = 256 * 1024;
const JSON_TYPE = "application/json; charset=utf-8";

/**
 * Reads a JSON body up to MAX_BODY_BYTES. Resolves to null when it is too large
 * (the rest is drained, not read, so the 413 still reaches the caller) or when
 * the client goes away before the end.
 */
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = Number(req.headers["content-length"] ?? 0) > MAX_BODY_BYTES;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) tooLarge = true;
      if (!tooLarge) chunks.push(chunk);
    });
    req.on("end", () => resolve(tooLarge ? null : Buffer.concat(chunks).toString("utf8")));
    req.on("close", () => resolve(null));
    req.on("error", () => resolve(null));
  });
}

const failure = (type: string, message: string): string => JSON.stringify({ status: "error", error: { type, message } });

/** POST /api/run: one request (see input_examples/), one structured result, one trace in logs/. */
async function handleRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // JSON only: a browser cannot send this content type cross-site without a preflight.
  if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) {
    req.resume();
    send(res, 415, JSON_TYPE, failure("UnsupportedMediaType", "Send the request with Content-Type: application/json."));
    return;
  }
  const body = await readBody(req);
  if (body === null) {
    send(res, 413, JSON_TYPE, failure("TooLarge", `The request is over ${MAX_BODY_BYTES / 1024} KB.`));
    return;
  }
  let input;
  try {
    const raw: unknown = JSON.parse(body);
    if (raw && typeof raw === "object" && "bill" in raw && (raw as { bill?: { image?: unknown } }).bill?.image !== undefined) {
      throw new InputError("The API takes bill.fields. To read a bill image, run the CLI with --bill and the live stack.");
    }
    input = parseRunInput(raw);
  } catch (error: unknown) {
    const message = error instanceof SyntaxError ? "The body is not valid JSON." : (error as Error).message;
    send(res, 400, JSON_TYPE, failure("InvalidInput", message));
    return;
  }
  const result = await runRequest(createRuntime(), input, null);
  if (result.status === "success") {
    send(res, 200, JSON_TYPE, JSON.stringify(result));
  } else if (result.error.type === "InvalidInput") {
    send(res, 400, JSON_TYPE, JSON.stringify(result));
  } else {
    // The reason stays in the trace; the caller gets where to find it.
    send(res, 500, JSON_TYPE, JSON.stringify({ ...result, error: { type: result.error.type, message: `The agents could not finish this run. The reason is in ${result.log_file}.` } }));
  }
}

const server = createServer((req, res) => {
  const path = pathOf(req.url);
  if (path === null) {
    send(res, 400, "text/plain; charset=utf-8", "Bad request");
    return;
  }
  if (path === "/api/run") {
    if (req.method !== "POST") {
      send(res, 405, JSON_TYPE, JSON.stringify({ status: "error", error: { type: "MethodNotAllowed", message: "Use POST with a JSON body." } }));
      return;
    }
    handleRun(req, res).catch((error: unknown) => {
      process.stderr.write(`Run failed: ${(error as Error).message}\n`);
      send(res, 500, JSON_TYPE, JSON.stringify({ status: "error", error: { type: "Error", message: "The run could not finish." } }));
    });
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

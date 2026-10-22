// Zetaris REST client, ported from the RestChannel in zetaris/getting-started
// (scripts/zetaris_sql.py). Signs in through the UI proxy, then runs one
// Lightning SQL statement per call. Every statement is logged so the SQL
// behind each number is visible.

import { randomUUID } from "node:crypto";
import type { Config } from "../config.ts";
import type { ResponseCache } from "../cache.ts";
import type { RunLogger } from "../log.ts";

export type Row = readonly string[];

export interface SqlClient {
  run(agent: string, sql: string, limit?: number): Promise<readonly Row[]>;
}

const TIMEOUT_MS = 300_000;

export class ZetarisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZetarisError";
  }
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { msg?: string };
    return (parsed.msg ?? text).slice(0, 400);
  } catch {
    return text.slice(0, 400);
  }
}

/** Cells come back as strings today; numbers and nulls are coerced so callers can rely on Row. */
export function normalizeRows(data: unknown): readonly Row[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) =>
    Array.isArray(row) ? row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))) : [],
  );
}

export function createZetarisRest(config: Config["zetaris"], fetchImpl: typeof fetch = fetch) {
  let token: string | undefined;

  async function login(): Promise<string> {
    const response = await fetchImpl(`${config.uiUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": randomUUID() },
      body: JSON.stringify({ username: config.email, password: config.password }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new ZetarisError(`Zetaris login failed: HTTP ${response.status}`);
    const body = (await response.json()) as { idToken?: string; token?: string; accessToken?: string };
    const found = body.idToken ?? body.token ?? body.accessToken;
    if (!found) throw new ZetarisError("Zetaris login did not return an access token.");
    return found;
  }

  const post = (sql: string, limit: number, bearer: string): Promise<Response> =>
    fetchImpl(`${config.apiUrl}/sql-editor/sqls/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "X-Org-ID": config.orgId,
        "X-Request-ID": randomUUID(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ queryId: randomUUID(), sql, source: "SqlEditor", limit }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  async function run(sql: string, limit = 1000): Promise<readonly Row[]> {
    token ??= await login();
    let response = await post(sql, limit, token);
    if (response.status === 401) {
      // The session token expired or Zetaris restarted: sign in again once.
      token = await login();
      response = await post(sql, limit, token);
    }
    if (!response.ok) {
      const raw = await readError(response);
      const detail = config.password ? raw.replaceAll(config.password, "[redacted]") : raw;
      throw new ZetarisError(`Zetaris HTTP ${response.status}: ${detail}`);
    }
    const body = (await response.json()) as { data?: unknown } | null;
    return normalizeRows(body?.data);
  }

  return { run };
}

export interface SqlDeps {
  readonly config: Config;
  readonly cache: ResponseCache;
  readonly logger: RunLogger;
  readonly fetchImpl?: typeof fetch;
}

/** Live, recording or replaying SQL client depending on SAMPLE_MODE and RECORD_SAMPLES. */
export function createSqlClient(deps: SqlDeps): SqlClient {
  const { config, cache, logger } = deps;
  const rest = createZetarisRest(config.zetaris, deps.fetchImpl);
  return {
    async run(agent: string, sql: string, limit = 1000): Promise<readonly Row[]> {
      const started = Date.now();
      const request = { sql, limit };
      const rows = config.sampleMode
        ? cache.read<Row[]>("sql", request)
        : await rest.run(sql, limit);
      if (config.recordSamples) cache.write("sql", request, rows);
      logger.log({
        agent,
        step: "sql",
        source: config.sampleMode ? "sample" : "live",
        sql,
        rowCount: rows.length,
        latencyMs: Date.now() - started,
      });
      return rows;
    },
  };
}

// Wires configuration, logging, the response cache and the two sponsor
// clients for one run.

import { fileCache, type ResponseCache } from "./cache.ts";
import { loadConfig, loadDotEnv, type Config } from "./config.ts";
import { createLlmClient, type LlmClient } from "./llm/nightshift.ts";
import { createRunLogger, type LoggerOptions, type RunLogger } from "./log.ts";
import { createSqlClient, type SqlClient } from "./zetaris/client.ts";

export interface Runtime {
  readonly config: Config;
  readonly logger: RunLogger;
  readonly cache: ResponseCache;
  readonly llm: LlmClient;
  readonly sql: SqlClient;
}

export function createRuntime(logging: LoggerOptions = {}): Runtime {
  loadDotEnv();
  const config = loadConfig();
  const logger = createRunLogger(logging);
  const cache = fileCache();
  return {
    config,
    logger,
    cache,
    llm: createLlmClient({ config, cache, logger }),
    sql: createSqlClient({ config, cache, logger }),
  };
}

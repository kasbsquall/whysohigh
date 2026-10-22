// Runtime configuration. SAMPLE_MODE is on unless explicitly turned off, so a
// clean clone with an empty .env runs on recorded responses.

export interface Config {
  readonly sampleMode: boolean;
  readonly recordSamples: boolean;
  readonly meterless: { readonly baseUrl: string; readonly token: string };
  readonly zetaris: {
    readonly uiUrl: string;
    readonly apiUrl: string;
    readonly email: string;
    readonly password: string;
    readonly orgId: string;
  };
}

type Env = Readonly<Record<string, string | undefined>>;

const LIVE_REQUIRED = ["METERLESS_RUNTIME_TOKEN", "ZETARIS_PASSWORD"] as const;

const TRUE = ["true", "1", "yes", "on"];
const FALSE = ["false", "0", "no", "off"];

// A typo must not silently switch to live mode, so unknown values fail.
function flag(name: string, value: string | undefined, fallback: boolean): boolean {
  const v = value?.trim().toLowerCase() ?? "";
  if (v === "") return fallback;
  if (TRUE.includes(v)) return true;
  if (FALSE.includes(v)) return false;
  throw new Error(`Invalid ${name} "${value}". Use true or false.`);
}

// Empty values in a copied .env fall back to the default instead of "".
const val = (value: string | undefined, fallback: string): string => value?.trim() || fallback;

export function loadConfig(env: Env = process.env): Config {
  const sampleMode = flag("SAMPLE_MODE", env.SAMPLE_MODE, true);
  if (!sampleMode) {
    const missing = LIVE_REQUIRED.filter((name) => !env[name]?.trim());
    if (missing.length > 0) {
      throw new Error(
        `SAMPLE_MODE=false needs ${missing.join(", ")} in .env. Set them or run with SAMPLE_MODE=true.`,
      );
    }
  }
  return {
    sampleMode,
    recordSamples: !sampleMode && flag("RECORD_SAMPLES", env.RECORD_SAMPLES, false),
    meterless: {
      baseUrl: val(env.METERLESS_BASE_URL, "http://127.0.0.1:8088/v1").replace(/\/$/, ""),
      token: val(env.METERLESS_RUNTIME_TOKEN, ""),
    },
    zetaris: {
      uiUrl: val(env.ZETARIS_UI_URL, "http://localhost:3000").replace(/\/$/, ""),
      apiUrl: val(env.ZETARIS_API_URL, "http://localhost:8888/api/v1.0").replace(/\/$/, ""),
      email: val(env.ZETARIS_EMAIL, "admin@zetaris.com"),
      password: val(env.ZETARIS_PASSWORD, ""),
      orgId: val(env.ZETARIS_ORG_ID, "1"),
    },
  };
}

/** Loads .env from the working directory when it exists. Existing variables win. */
export function loadDotEnv(path = ".env"): void {
  try {
    process.loadEnvFile(path);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

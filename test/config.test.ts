import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

describe("loadConfig", () => {
  it("defaults to SAMPLE_MODE with an empty environment", () => {
    const config = loadConfig({});
    expect(config.sampleMode).toBe(true);
    expect(config.recordSamples).toBe(false);
    expect(config.meterless.baseUrl).toBe("http://127.0.0.1:8088/v1");
  });

  it("names every missing secret when SAMPLE_MODE is false", () => {
    expect(() => loadConfig({ SAMPLE_MODE: "false" })).toThrow(
      /METERLESS_RUNTIME_TOKEN, ZETARIS_PASSWORD/,
    );
  });

  it("never records in SAMPLE_MODE even when RECORD_SAMPLES is true", () => {
    expect(loadConfig({ RECORD_SAMPLES: "true" }).recordSamples).toBe(false);
  });

  it("rejects an unknown SAMPLE_MODE value instead of going live", () => {
    expect(() => loadConfig({ SAMPLE_MODE: "ture" })).toThrow(/Invalid SAMPLE_MODE/);
    expect(loadConfig({ SAMPLE_MODE: "1" }).sampleMode).toBe(true);
  });

  it("falls back to defaults for empty values", () => {
    const config = loadConfig({ METERLESS_BASE_URL: "", ZETARIS_ORG_ID: " " });
    expect(config.meterless.baseUrl).toBe("http://127.0.0.1:8088/v1");
    expect(config.zetaris.orgId).toBe("1");
  });

  it("strips a trailing slash from service URLs", () => {
    const config = loadConfig({ METERLESS_BASE_URL: "http://x/v1/", ZETARIS_API_URL: "http://z/api/" });
    expect(config.meterless.baseUrl).toBe("http://x/v1");
    expect(config.zetaris.apiUrl).toBe("http://z/api");
  });
});

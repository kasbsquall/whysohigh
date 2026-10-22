import { describe, expect, it } from "vitest";
import { detection, mainCause, parseBaselineReply, score, splitOf, splitWithRemainder, type Split } from "../eval/metrics.ts";

const truth: Split = { price: 0, days: 5, weather: 20, usage: -3, unexplained: 0 };

describe("eval scoring", () => {
  it("reads a decomposition and leaves missing parts at zero", () => {
    expect(splitOf([{ key: "price", usd: 1.5 }, { key: "weather", usd: 9 }])).toEqual({ price: 1.5, days: 0, weather: 9, usage: 0, unexplained: 0 });
  });

  it("puts what four parts leave of the change in unexplained", () => {
    expect(splitWithRemainder({ price: 0, days: 2, weather: 10, usage: 1 }, 15.5).unexplained).toBe(2.5);
  });

  it("names the cause with the most dollars in either direction, never unexplained", () => {
    expect(mainCause(truth)).toBe("weather");
    expect(mainCause({ price: 1, days: 0, weather: 2, usage: -30, unexplained: 99 })).toBe("usage");
  });

  it("scores answered households and counts the rest apart", () => {
    const s = score([
      { estimate: { price: 0, days: 5, weather: 22, usage: -5, unexplained: 0 }, truth },
      { estimate: null, truth },
    ]);
    expect(s).toMatchObject({ answered: 1, unanswered: 1, meanTotalErrorUsd: 4, mainCauseRight: 1 });
    expect(s.meanAbsErrorUsd).toEqual({ price: 0, days: 0, weather: 2, usage: 2, unexplained: 0 });
  });

  it("works out precision and recall, and says null when nothing was flagged", () => {
    const d = detection([
      { actual: true, flagged: true },
      { actual: true, flagged: false },
      { actual: false, flagged: true },
      { actual: false, flagged: false },
    ]);
    expect(d).toMatchObject({ truePositives: 1, falsePositives: 1, falseNegatives: 1, trueNegatives: 1, precision: 0.5, recall: 0.5 });
    expect(detection([{ actual: true, flagged: false }]).precision).toBeNull();
  });

  it("parses the baseline's JSON inside prose and rejects missing parts", () => {
    const reply = 'Here it is: {"price_usd": 0, "days_usd": "4.10", "weather_usd": 12, "usage_usd": -1, "billing_error_suspected": false, "billing_error_usd": null}';
    expect(parseBaselineReply(reply)).toEqual({ parts: { price: 0, days: 4.1, weather: 12, usage: -1 }, suspected: false, errorUsd: null });
    expect(() => parseBaselineReply('{"price_usd": 1, "billing_error_suspected": true}')).toThrow(/days_usd, weather_usd, usage_usd/);
    expect(() => parseBaselineReply("no json")).toThrow(/No JSON/);
  });
});

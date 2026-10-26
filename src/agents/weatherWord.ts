// How the weather felt compared with the last bill, from NOAA degree days. Shared
// by the Explainer (a fact for Nemotron) and the page (the cause's title), and
// kept free of imports so the page can bundle it.

export type WeatherWord = "cooler" | "warmer" | "hotter" | "colder";

/** In a cooling season a lower bill means cooler weather; in a heating season, warmer. */
export function weatherWord(
  previous: { readonly days: number; readonly cdd: number; readonly hdd: number },
  current: { readonly days: number; readonly cdd: number; readonly hdd: number },
  amountUsd: number,
): WeatherWord {
  const cooling = previous.cdd / previous.days + current.cdd / current.days;
  const heating = previous.hdd / previous.days + current.hdd / current.days;
  if (cooling >= heating) return amountUsd <= 0 ? "cooler" : "hotter";
  return amountUsd <= 0 ? "warmer" : "colder";
}

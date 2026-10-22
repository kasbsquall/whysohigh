// Shape of the synthetic evaluation households (eval/households.json). Each one
// has a true weather response the agents never see, monthly noise, and one cause
// injected in its last bill. Written by eval/generate.ts, read by eval/run.ts.

export type Cause = "price" | "days" | "weather" | "usage" | "billing_error";

/** kWh in a bill = basePerDay x days + perCdd x CDD + perHdd x HDD, before noise. */
export interface TrueModel {
  readonly basePerDay: number;
  readonly perCdd: number;
  readonly perHdd: number;
}

export interface EvalBill {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly days: number;
  readonly kwh: number;
  /** Tariff total; null for bills before the first approved tariff in URDB (only their kWh are used). */
  readonly totalUsd: number | null;
}

export interface EvalHousehold {
  readonly id: string;
  readonly cause: Cause;
  readonly heating: "gas" | "electric";
  readonly model: TrueModel;
  /** Standard deviation of the monthly noise, as a share of the model's kWh. */
  readonly noiseSd: number;
  /** What was injected in the last bill, in plain words. */
  readonly injected: string;
  /** kWh added to the last bill on top of the model and noise (usage households). */
  readonly injectedUsageKwh: number;
  /** Dollars billed above the tariff on the last bill (billing error households). */
  readonly overchargeUsd: number;
  /** Oldest first; the last two are the previous and the current bill. */
  readonly bills: readonly EvalBill[];
  /** What the current bill says: billed total and last period's total as printed. */
  readonly billedUsd: number;
  readonly previousBilledUsd: number;
  /** The current bill's text layer, the only input the bill-only baseline gets. */
  readonly billText: string;
}

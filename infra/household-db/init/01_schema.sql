-- Household facts and bill history. Every row here is synthetic and labelled
-- as such; the app never stores a real customer's data.

CREATE TABLE households (
  household_id    text PRIMARY KEY,
  display_name    text NOT NULL,
  city            text NOT NULL,
  utility_eiaid   integer NOT NULL,
  noaa_station    text NOT NULL,
  household_size  integer NOT NULL CHECK (household_size > 0),
  annual_income_usd numeric(10, 2),
  electric_heat   boolean NOT NULL,
  synthetic       boolean NOT NULL DEFAULT true
);

CREATE TABLE bills (
  household_id  text NOT NULL REFERENCES households (household_id),
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  days          integer NOT NULL CHECK (days > 0),
  kwh           numeric(10, 2) NOT NULL CHECK (kwh >= 0),
  total_usd     numeric(10, 2),
  source        text NOT NULL,
  PRIMARY KEY (household_id, period_start),
  CHECK (period_end > period_start)
);

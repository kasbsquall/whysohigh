-- Decisions the agents accepted, written back through Zetaris after each run,
-- so the household's record holds what was concluded next to the bills.
CREATE TABLE decisions (
  run_key          text NOT NULL,
  household_id     text NOT NULL,
  period_start     date NOT NULL,
  period_end       date NOT NULL,
  change_usd       numeric(10, 2) NOT NULL,
  price_usd        numeric(10, 2) NOT NULL,
  days_usd         numeric(10, 2) NOT NULL,
  weather_usd      numeric(10, 2) NOT NULL,
  usage_usd        numeric(10, 2) NOT NULL,
  unexplained_usd  numeric(10, 2) NOT NULL,
  checks_passed    integer NOT NULL,
  checks_run       integer NOT NULL,
  action           text,
  action_usd       numeric(10, 2),
  explanation      text NOT NULL,
  written_by       text NOT NULL
);
CREATE INDEX decisions_run_key ON decisions (run_key);

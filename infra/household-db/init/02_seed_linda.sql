-- Linda: illustrative household (samples/linda.json). The two bills are the
-- ones printed on samples/linda-2026-09.png, which is a synthetic SAMPLE bill.
-- The longer history comes from the synthetic generator in a later block.

INSERT INTO households VALUES
  ('linda', 'Linda', 'Columbus, OH', 14006, 'USW00014821', 1, 24000, false, true);

INSERT INTO bills VALUES
  ('linda', '2026-07-16', '2026-08-14', 29, 902, 138.60, 'sample bill, previous period line'),
  ('linda', '2026-08-14', '2026-09-16', 33, 1184, 187.42, 'sample bill, current period');

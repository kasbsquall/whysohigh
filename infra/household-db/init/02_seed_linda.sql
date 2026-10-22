-- Linda: illustrative household (samples/linda.json). The three bills are the
-- ones printed on samples/linda-2026-09.png and -10.png, synthetic SAMPLE bills.
-- The longer history comes from the synthetic generator in a later block.

INSERT INTO households VALUES
  ('linda', 'Linda', 'Columbus, OH', 14006, 'USW00014821', 1, 24000, false, true);

INSERT INTO bills VALUES
  ('linda', '2026-07-16', '2026-08-14', 29, 902, 170.12, 'sample bill, previous period line'),
  ('linda', '2026-08-14', '2026-09-16', 33, 1184, 217.42, 'sample bill, current period'),
  ('linda', '2026-09-16', '2026-10-16', 30, 584, 116.77, 'sample bill, month 2');

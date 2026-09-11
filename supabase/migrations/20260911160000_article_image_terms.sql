-- Plain search terms for the picture, beside the scene. "trading terminal
-- screens showing falling stock prices" found nothing; "stock market" finds
-- the trading floor at once. The writer supplies both.
alter table public.articles add column if not exists image_terms text;

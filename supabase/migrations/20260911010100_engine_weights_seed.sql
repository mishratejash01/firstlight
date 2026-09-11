-- Seed the weight posterior from the labelled evaluation.
--
-- Fitted on 639 events labelled from independent front pages: authority and
-- corroboration carry the ranking, surprise helps, burst and magnitude were
-- close to noise, acceleration and freshness slightly inverted. The means
-- move to the fitted values; the variance narrows so a single Thompson draw
-- cannot flip a weight's sign, but stays wide enough to keep learning.

update public.signal_weights set mean = v.mean, variance = 0.15, updated_at = now()
from (values
  ('burst', 0.3), ('surprise', 0.8), ('corroboration', 1.5), ('lead_authority', 2.0),
  ('acceleration', 0.3), ('magnitude', 0.2), ('relevance', 0.8), ('novelty', 0.9), ('freshness', 0.3)
) as v(feature, mean)
where signal_weights.feature = v.feature;

-- Standing briefs for the autonomous writer.
--
-- Chosen for the mode this pipeline actually runs in. Without source material
-- the model has no documents, no interviews and no knowledge of what happened
-- today, so a brief like "cover this week's budget statement" produces
-- confident, entirely invented specifics.
--
-- What it can do well is explain a durable mechanism: how a process works, what
-- a term means, what normally happens next. Those pieces are useful to readers,
-- are the kind of thing people genuinely search for, and do not depend on facts
-- the model cannot have. Every brief below is of that shape.
--
-- Cadence is 30 days. These are explainers, not running stories: regenerating
-- one weekly would fill the site with near-duplicates of itself, which is
-- precisely the pattern that attracts a scaled-content penalty.

insert into public.ai_topics (topic, angle, category_id, cadence_hours, created_by)
select v.topic, v.angle, c.id, 720,
       (select id from auth.users where email = 'mtejash07@gmail.com')
from (values
  (
    'How a bill becomes law, and the stages where most bills quietly die',
    'Follow the actual route rather than the textbook one. Be concrete about where things stall and why.',
    'politics'
  ),
  (
    'What a central bank actually changes when it moves interest rates, and how long it takes to reach households',
    'Explain the transmission mechanism plainly. Emphasise the lag, which is the part most coverage skips.',
    'business'
  ),
  (
    'How undersea cables carry almost all international internet traffic, and what happens when one is cut',
    'Cover the repair process and why redundancy is designed in at the route level.',
    'technology'
  ),
  (
    'How a new medicine is tested before it can be approved, stage by stage',
    'Explain what each trial phase is actually for, and why a drug can pass one and fail the next.',
    'health'
  ),
  (
    'What antibiotic resistance is, how it spreads, and what actually slows it down',
    'Distinguish resistance in the bacterium from resistance in the patient, which is a common confusion.',
    'health'
  ),
  (
    'How flood defences are designed, and what a one-in-a-hundred-year flood really means',
    'The probability language is widely misread. Explain what it does and does not promise.',
    'environment'
  ),
  (
    'How weather forecasts are made, and why accuracy falls off after about a week',
    'Cover ensemble forecasting and why uncertainty is a result rather than a failure.',
    'science'
  ),
  (
    'What happens between an arrest and a trial, and how long each stage usually takes',
    'Be clear about what is decided at each point and by whom.',
    'justice'
  ),
  (
    'How international sanctions are supposed to work, and why they often do not',
    'Cover the mechanics of enforcement and the routes around them.',
    'world'
  ),
  (
    'What the laws of armed conflict require, in plain language',
    'Stick to the settled principles: distinction, proportionality, precaution. Avoid contested applications.',
    'conflict'
  ),
  (
    'How school funding formulas work, and why schools in the same city receive different amounts',
    'Explain the weighting factors and the reasoning behind them.',
    'education'
  ),
  (
    'How a national census is run, and why the count decides where services go',
    'Cover undercounting and why it matters more than the headline total.',
    'society'
  ),
  (
    'How doping tests work, and the ways an athlete can fail one without intending to',
    'Explain contamination, therapeutic use exemptions and the burden of proof.',
    'sport'
  ),
  (
    'How a book gets from finished manuscript to a shelf in a shop',
    'Cover acquisition, the long lead times, and who actually decides what gets published.',
    'culture'
  ),
  (
    'What use-by and best-before dates actually mean, and which one matters',
    'One is about safety and one is about quality. Most people treat them identically.',
    'lifestyle'
  )
) as v(topic, angle, category_slug)
join public.categories c on c.slug = v.category_slug
on conflict do nothing;

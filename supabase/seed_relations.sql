-- Development seed: tags, entities, key facts, FAQs and an event hub.
--
-- This is the part that exercises the deep-event SEO machinery — an event hub
-- with deep-linkable updates, entity markup, sourced figures and an explainer
-- sidebar — so the structured data can be validated against something real.
-- Same removal caveat as seed.sql: invented subjects, realistic structure.

begin;

-- Tags ----------------------------------------------------------------------
insert into public.article_tags (article_id, tag_id)
select a.id, t.id
from public.articles a
join lateral (values
  ('coastal-authority-warns-defences-inadequate', array['coastal-flooding','climate','valmara','local-government']),
  ('marchetti-defends-capital-spending-freeze',   array['public-finance','coastal-flooding','valmara']),
  ('northgate-semiconductor-expands-rhoswen-plant', array['semiconductors','energy','valmara']),
  ('grid-operator-queue-reform-connection-delays', array['energy','public-finance']),
  ('housing-completions-lowest-since-2011',        array['housing','public-finance']),
  ('data-protection-bill-second-reading',          array['data-protection','elections']),
  ('antibiotic-resistance-surveillance-gap',       array['public-health']),
  ('rail-timetable-recast-december',               array['transport']),
  ('open-source-maintainer-funding-study',         array['semiconductors','data-protection']),
  ('undersea-cable-repair-delays',                 array['transport','energy']),
  ('valmara-league-title-decided-final-day',       array['football','valmara']),
  ('national-gallery-restitution-review',          array['publishing']),
  ('independent-bookshops-second-year-growth',     array['publishing']),
  ('teacher-vacancies-concentrated-subjects',      array['local-government']),
  ('river-restoration-scheme-early-results',       array['climate','coastal-flooding']),
  ('city-transport-authority-fare-simplification', array['transport','local-government'])
) as m(article_slug, tag_slugs) on m.article_slug = a.slug
join public.tags t on t.slug = any(m.tag_slugs)
on conflict do nothing;

-- Entities ------------------------------------------------------------------
insert into public.article_entities (article_id, entity_id, relation, role_note)
select a.id, e.id, m.relation, m.role_note
from public.articles a
join lateral (values
  ('coastal-authority-warns-defences-inadequate','coastal-authority','about','Published the assessment'),
  ('coastal-authority-warns-defences-inadequate','rhoswen','about','Site of the reviewed defences'),
  ('coastal-authority-warns-defences-inadequate','elena-marchetti','mentions','Minister responsible for capital funding'),
  ('marchetti-defends-capital-spending-freeze','elena-marchetti','about','Finance minister'),
  ('marchetti-defends-capital-spending-freeze','coastal-authority','mentions','Subject of the funding dispute'),
  ('northgate-semiconductor-expands-rhoswen-plant','northgate-semiconductor','about','Announced the expansion'),
  ('northgate-semiconductor-expands-rhoswen-plant','rhoswen','about','Location of the plant')
) as m(article_slug, entity_slug, relation, role_note) on m.article_slug = a.slug
join public.entities e on e.slug = m.entity_slug
on conflict do nothing;

-- Key numbers ---------------------------------------------------------------
insert into public.article_key_facts (article_id, label, value, attribution, position)
select a.id, m.label, m.value, m.attribution, m.position
from public.articles a
join lateral (values
  ('coastal-authority-warns-defences-inadequate','Structures reviewed','41','Coastal Authority internal assessment',1),
  ('coastal-authority-warns-defences-inadequate','Built to pre-1998 specification','26','Coastal Authority internal assessment',2),
  ('coastal-authority-warns-defences-inadequate','Unsurveyed for over a decade','11','Coastal Authority internal assessment',3),
  ('coastal-authority-warns-defences-inadequate','Coastline covered','180 km','Coastal Authority internal assessment',4),
  ('northgate-semiconductor-expands-rhoswen-plant','Investment','£2.1bn','Company announcement',1),
  ('northgate-semiconductor-expands-rhoswen-plant','Jobs secured','1,400','Company announcement',2),
  ('northgate-semiconductor-expands-rhoswen-plant','New jobs','600','Company announcement',3),
  ('housing-completions-lowest-since-2011','Completions','118,400','National housing statistics',1),
  ('housing-completions-lowest-since-2011','Change year on year','-14%','National housing statistics',2),
  ('housing-completions-lowest-since-2011','Ground-break to completion','27 months','National housing statistics',3),
  ('teacher-vacancies-concentrated-subjects','Physics recruitment','41% of target','Department workforce return',1),
  ('teacher-vacancies-concentrated-subjects','Computing recruitment','52% of target','Department workforce return',2),
  ('teacher-vacancies-concentrated-subjects','Overall recruitment','94% of target','Department workforce return',3)
) as m(article_slug, label, value, attribution, position) on m.article_slug = a.slug
on conflict do nothing;

-- Explainer questions. Attached only to the major story, never templated onto
-- routine copy.
insert into public.article_faqs (article_id, question, answer, position)
select a.id, m.question, m.answer, m.position
from public.articles a
join lateral (values
  ('coastal-authority-warns-defences-inadequate',
   'Which parts of the coast are affected?',
   'The assessment covers 180 kilometres of the western seaboard, including the defences protecting Rhoswen. Twenty-six of the 41 structures reviewed were specified against conditions recorded before 1998.', 1),
  ('coastal-authority-warns-defences-inadequate',
   'Does the report say the defences will fail?',
   'No. It says the margin between what the structures were designed to withstand and the conditions now observed has narrowed to the point where it can no longer meaningfully be called a margin.', 2),
  ('coastal-authority-warns-defences-inadequate',
   'Who decides whether the repairs are funded?',
   'The Coastal Authority depends on the finance ministry for capital allocation. It has requested an emergency allocation that officials say substantially exceeds the sum currently set aside.', 3),
  ('coastal-authority-warns-defences-inadequate',
   'When will a decision be made?',
   'Ministers are expected to respond within the month, and the public accounts committee has scheduled evidence for next week.', 4)
) as m(article_slug, question, answer, position) on m.article_slug = a.slug
on conflict do nothing;

-- Event hub -----------------------------------------------------------------
insert into public.news_events (slug, title, summary, category_id, is_live, coverage_starts_at, status, published_at)
select 'western-coastal-flood-defences',
       'Western coastal flood defences: the assessment and the response',
       'Continuing coverage of the Coastal Authority assessment, the funding dispute it triggered, and what happens to the western seaboard next.',
       (select id from public.categories where slug = 'environment'),
       true, now() - interval '2 days', 'developing', now() - interval '2 days'
on conflict (slug) do nothing;

insert into public.event_updates (event_id, headline, body, published_at, is_key_update, author_id)
select e.id, m.headline, m.body, now() - m.age, m.key_update,
       (select id from public.authors where slug = m.author)
from public.news_events e
join lateral (values
  ('Public accounts committee sets evidence date',
   'The committee will take evidence from the Coastal Authority and the finance ministry next Tuesday, and has asked for the March correspondence in full.',
   interval '2 hours', true, 'anna-whitfield'),
  ('Authority confirms eleven structures unsurveyed',
   'In a written response the Authority confirmed that eleven of the 41 structures reviewed have not had a structural survey in more than ten years.',
   interval '6 hours', false, 'priya-nair'),
  ('Marchetti: capital discipline and safety "not in tension"',
   'The finance minister told parliament that the spending freeze contains explicit carve-outs for safety-critical infrastructure, and that no such request had been refused.',
   interval '1 day 2 hours', true, 'anna-whitfield'),
  ('Member for Rhoswen East produces March correspondence',
   'A Coastal Authority submission dated March was returned marked "defer to next cycle", according to correspondence read into the record.',
   interval '1 day 5 hours', false, 'anna-whitfield'),
  ('Assessment circulated to ministers',
   'An internal Coastal Authority assessment finding that most western defences were built to obsolete specifications was circulated to ministers.',
   interval '2 days', true, 'priya-nair')
) as m(headline, body, age, key_update, author) on true
where e.slug = 'western-coastal-flood-defences'
on conflict do nothing;

insert into public.article_events (article_id, event_id, relation, position)
select a.id, e.id, m.relation, m.position
from public.news_events e
join lateral (values
  ('coastal-authority-warns-defences-inadequate','primary',1),
  ('marchetti-defends-capital-spending-freeze','sub_development',2),
  ('river-restoration-scheme-early-results','background',3)
) as m(article_slug, relation, position) on true
join public.articles a on a.slug = m.article_slug
where e.slug = 'western-coastal-flood-defences'
on conflict do nothing;

-- Editorial front-page pin, expiring so it cannot be forgotten.
insert into public.homepage_placements (zone, position, article_id, expires_at)
select 'hero', 1, a.id, now() + interval '12 hours'
from public.articles a
where a.slug = 'coastal-authority-warns-defences-inadequate'
on conflict do nothing;

commit;

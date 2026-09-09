-- Seed the section taxonomy.
--
-- Fifteen sections appear in navigation; the remaining IPTC top-level topics
-- are seeded but kept out of the header so that every subject code a wire feed
-- can emit still has a section to land in. Nothing here is display copy that
-- lives in a component — editors can rename, reorder or hide any of these from
-- the admin dashboard without a deploy.
--
-- qcodes are taken verbatim from the IPTC Media Topics NewsCodes scheme
-- (http://cv.iptc.org/newscodes/mediatopic/). Two rows have no qcode because
-- they are not media topics: 'Opinion' is a genre and 'World' is a geographic
-- scope. Inventing qcodes for them would break the interoperability this
-- taxonomy exists to provide.
--
-- 'Technology' is promoted from IPTC level 2 (technology and engineering)
-- because it warrants its own desk; every other mapped row is a top-level term.

insert into public.categories
  (slug, name, iptc_qcode, iptc_label, description, sort_order, show_in_nav)
values
  ('politics',      'Politics',       'medtop:11000000', 'politics and government',                  'Government, elections, policy and the exercise of power.',        10, true),
  ('world',         'World',          null,              null,                                        'International reporting and correspondents abroad.',              20, true),
  ('business',      'Business',       'medtop:04000000', 'economy, business and finance',             'Companies, markets, economic policy and the world of work.',      30, true),
  ('technology',    'Technology',     'medtop:20000756', 'technology and engineering',                'Computing, engineering, the internet and the industry behind them.', 40, true),
  ('science',       'Science',        'medtop:13000000', 'science and technology',                    'Research, discovery and the scientific method.',                  50, true),
  ('health',        'Health',         'medtop:07000000', 'health',                                    'Medicine, public health and physical and mental well-being.',     60, true),
  ('environment',   'Environment',    'medtop:06000000', 'environment',                               'Climate, conservation and the condition of the natural world.',   70, true),
  ('sport',         'Sport',          'medtop:15000000', 'sport',                                     'Competition, athletes and the business of sport.',                 80, true),
  ('culture',       'Culture',        'medtop:01000000', 'arts, culture, entertainment and media',    'Arts, entertainment, heritage and the media.',                    90, true),
  ('society',       'Society',        'medtop:14000000', 'society',                                   'Communities, demographics, welfare and social affairs.',         100, true),
  ('justice',       'Justice',        'medtop:02000000', 'crime, law and justice',                    'Courts, policing, crime and the rule of law.',                    110, true),
  ('conflict',      'Conflict',       'medtop:16000000', 'conflict, war and peace',                   'War, protest, diplomacy and geopolitical confrontation.',         120, true),
  ('education',     'Education',      'medtop:05000000', 'education',                                 'Schools, universities and how knowledge is passed on.',           130, true),
  ('lifestyle',     'Lifestyle',      'medtop:10000000', 'lifestyle and leisure',                     'Food, travel, leisure and life outside work.',                    140, true),
  ('opinion',       'Opinion',        null,              null,                                        'Argument and analysis, clearly labelled as such.',                150, true),

  -- Seeded for wire-feed routing, kept out of the header.
  ('disasters',     'Disasters',      'medtop:03000000', 'disaster, accident and emergency incident', 'Accidents, natural disasters and emergency response.',            200, false),
  ('human-interest','Human interest', 'medtop:08000000', 'human interest',                            'Stories told for their human rather than institutional weight.',  210, false),
  ('labour',        'Labour',         'medtop:09000000', 'labour',                                    'Employment, unions, disputes and conditions of work.',            220, false),
  ('religion',      'Religion',       'medtop:12000000', 'religion',                                  'Belief, institutions and religious life.',                        230, false),
  ('weather',       'Weather',        'medtop:17000000', 'weather',                                   'Forecasting, meteorology and severe weather events.',             240, false);

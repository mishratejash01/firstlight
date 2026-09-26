-- The title a section page carries in search results.
--
-- A section's name is written for the navigation ("Sport", "Justice"); the
-- title a searcher sees should use the words they search with ("Sports News
-- Today", "Legal and Crime News"). Editors can change either without the other.
-- Null falls back to "<Name> News Today". The paper's name is appended by the
-- site's title template, so it is not repeated here.

alter table public.categories
  add column if not exists seo_title text;

comment on column public.categories.seo_title is
  'Title for the section page in search results, without the paper''s name. Null uses "<Name> News Today".';

update public.categories set seo_title = case slug
  when 'politics' then 'Politics News Today: Latest Indian Politics News'
  when 'world' then 'World News Today: Latest International News'
  when 'opinion' then 'Opinion and Analysis: Columns and Views'
  when 'business' then 'Business News Today: Latest Economy and Market News'
  when 'startups' then 'Startup News: Indian Startups, Funding and IPOs'
  when 'technology' then 'Technology News Today: Latest Tech News'
  when 'ai' then 'AI News Today: Latest Artificial Intelligence News'
  when 'science' then 'Science News: Latest Space and Science Discoveries'
  when 'health' then 'Health News Today: Latest Health and Medical News'
  when 'environment' then 'Environment News: Climate, Pollution and Monsoon'
  when 'sport' then 'Sports News Today: Cricket, IPL, Football and More'
  when 'culture' then 'Entertainment and Culture News: Bollywood, OTT and Music'
  when 'society' then 'Society News: Social Issues and Communities in India'
  when 'justice' then 'Legal and Crime News: Supreme Court, Courts and Police'
  when 'conflict' then 'War and Conflict News: Latest Updates'
  when 'education' then 'Education News: Exam Results, NEET, JEE, CBSE and UPSC'
  when 'lifestyle' then 'Lifestyle News: Food, Travel, Fashion and Wellbeing'
  when 'disasters' then 'Disaster News: Floods, Earthquakes and Cyclones'
  when 'human-interest' then 'Human Interest Stories'
  when 'labour' then 'Jobs and Labour News: Employment, Wages and Strikes'
  when 'religion' then 'Religion News: Faith, Festivals and Pilgrimages'
  when 'weather' then 'Weather News Today: IMD Forecasts and Monsoon Updates'
  else seo_title
end
where slug in (
  'politics', 'world', 'opinion', 'business', 'startups', 'technology', 'ai',
  'science', 'health', 'environment', 'sport', 'culture', 'society', 'justice',
  'conflict', 'education', 'lifestyle', 'disasters', 'human-interest', 'labour',
  'religion', 'weather'
);

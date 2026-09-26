-- Section descriptions written for readers who arrive from search.
--
-- Each section page shows its description under the heading and uses it as
-- the page's meta description, so it is the sentence a search result quotes.
-- The first versions were abstract ("the exercise of power"); these name the
-- things people actually search for in each area (the Sensex and RBI policy,
-- IPL, NEET and JEE, IMD forecasts) in plain sentences, as an introduction a
-- reader would find useful. They describe what each section covers; they are
-- not keyword lists, which search engines treat as spam.

update public.categories set description = case slug
  when 'politics' then 'Latest Indian politics news: Parliament, elections, the central government, the BJP, Congress and regional parties, state politics and the policies that follow.'
  when 'world' then 'World news today: international politics, diplomacy and conflict, from the US, China and Pakistan to the Middle East and Europe, and what it means for India.'
  when 'opinion' then 'Opinion and analysis: columns, argument and informed views on politics, the economy, technology and society, always labelled as opinion.'
  when 'business' then 'Business news today: the Indian economy, RBI policy, the Sensex and Nifty, markets, companies, banking, earnings and personal finance.'
  when 'startups' then 'Indian startup news: funding rounds, IPOs, unicorns, founders, acquisitions and layoffs across India''s startup and venture capital scene.'
  when 'technology' then 'Technology news: smartphones and gadgets, big tech and internet companies, telecom, cybersecurity, space technology and tech policy.'
  when 'ai' then 'Artificial intelligence news: OpenAI, Google, Anthropic and Indian AI companies, new models, chips, AI regulation and how AI is changing work.'
  when 'science' then 'Science news: space missions from ISRO and NASA, climate research, physics, biology and discoveries from India and around the world.'
  when 'health' then 'Health news: disease outbreaks, medicines and vaccines, hospitals, public health policy, mental health and medical research.'
  when 'environment' then 'Environment news: climate change, air pollution, the monsoon, forests and wildlife, clean energy and environmental policy.'
  when 'sport' then 'Sports news: cricket and the IPL, football, hockey, tennis, badminton, athletics and the Olympics, from India and around the world.'
  when 'culture' then 'Culture news: Bollywood and cinema, OTT streaming, music, television, books, art and heritage in India and beyond.'
  when 'society' then 'Society news: social issues, communities, rights, cities and the changes shaping everyday life in India.'
  when 'justice' then 'Justice news: Supreme Court and High Court rulings, crime and police investigations, and the laws that govern them in India.'
  when 'conflict' then 'Conflict news: wars, military operations, terrorism, border tensions and defence, from West Asia and Ukraine to India''s neighbourhood.'
  when 'education' then 'Education news: exams and results, NEET, JEE, CBSE and UPSC, admissions, schools, universities and education policy in India.'
  when 'lifestyle' then 'Lifestyle news: food, travel, fashion, wellbeing, relationships and the trends shaping how people live.'
  when 'disasters' then 'Disaster news: floods, earthquakes, cyclones, landslides, fires and major accidents, with warnings and rescue efforts.'
  when 'human-interest' then 'Human interest stories: the people and moments behind the news, in India and around the world.'
  when 'labour' then 'Labour news: jobs and employment data, wages, strikes, unions, layoffs and labour laws in India and abroad.'
  when 'religion' then 'Religion news: faiths, festivals, temples and pilgrimages, religious institutions and the debates around them.'
  when 'weather' then 'Weather news: IMD forecasts, monsoon updates, heavy rain and heatwave alerts, cyclones and air quality across India.'
  else description
end
where slug in (
  'politics', 'world', 'opinion', 'business', 'startups', 'technology', 'ai',
  'science', 'health', 'environment', 'sport', 'culture', 'society', 'justice',
  'conflict', 'education', 'lifestyle', 'disasters', 'human-interest', 'labour',
  'religion', 'weather'
);

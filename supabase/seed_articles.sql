-- Development seed: articles.
--
-- See seed.sql for the rationale and the one-line removal command. Subjects are
-- invented; only the structure is realistic.
--
-- published_at is expressed relative to now() so the front page always has a
-- believable spread of recency however long after seeding it is viewed. Hero
-- images point at picsum.photos, seeded per slug so they stay stable between
-- runs — placeholders, to be replaced by real art direction.

begin;

with src as (select id from public.sources where slug = 'sample-development-content'),
     cat as (select slug, id from public.categories),
     aut as (select slug, id from public.authors)
insert into public.articles (
  slug, headline, standfirst, body, summary, status, origin,
  source_id, category_id, author_id, published_at, is_breaking,
  hero_image_url, hero_image_alt, hero_image_credit, created_by
)
select v.slug, v.headline, v.standfirst, v.body, v.summary, 'published', 'original',
       (select id from src),
       (select id from cat where cat.slug = v.category),
       (select id from aut where aut.slug = v.author),
       now() - v.age, v.breaking,
       'https://picsum.photos/seed/' || v.slug || '/1200/675',
       v.image_alt, 'Placeholder image', null
from (values
  (
    'coastal-authority-warns-defences-inadequate',
    'Coastal Authority warns western defences cannot hold another surge',
    'Internal assessment finds barriers at Rhoswen were built for conditions that no longer apply.',
    $md$The Coastal Authority has concluded that flood defences protecting the western seaboard were designed for a sea level and storm frequency that no longer describes the region, according to an internal assessment circulated to ministers this week.

## What happened

The assessment reviewed 41 defensive structures along 180 kilometres of coast. It found that 26 of them were specified against surge heights recorded before 1998, and that eleven have not been structurally surveyed in over a decade.

## Who is involved

The Coastal Authority reports to the finance ministry for capital funding, an arrangement critics have long argued subordinates engineering judgement to budget cycles. Elena Marchetti, the finance minister, has previously defended the structure as a discipline on spending.

## What happens next

Ministers are expected to respond within the month. The Authority has asked for an emergency capital allocation; officials familiar with the discussions say the request substantially exceeds what has been set aside.

The report stops short of predicting failure. It says instead that the margin between design tolerance and observed conditions has "narrowed to a point where it can no longer be described as a margin".$md$,
    'An internal Coastal Authority assessment finds most western flood defences were specified against pre-1998 conditions, with eleven structures unsurveyed for more than ten years.',
    'environment','priya-nair', interval '2 hours', true,
    'Sea wall at Rhoswen photographed at high tide'
  ),
  (
    'marchetti-defends-capital-spending-freeze',
    'Marchetti defends spending freeze as flood warning lands',
    'The finance minister told parliament that capital discipline and public safety were "not in tension".',
    $md$Elena Marchetti defended the government's capital spending freeze in parliament on Tuesday, hours after an internal assessment warned that western flood defences were built to obsolete specifications.

Pressed by opposition members, the finance minister said that the freeze contained explicit carve-outs for safety-critical infrastructure and that no such request had been refused.

## The exchange

The claim was immediately contested. The member for Rhoswen East produced correspondence showing a Coastal Authority submission returned in March marked "defer to next cycle".

Marchetti said she would "look at the specific case" but maintained that the framework was sound.

## What happens next

The public accounts committee has scheduled evidence for next week and has asked for the March correspondence in full.$md$,
    'The finance minister told parliament that capital discipline and public safety were not in tension, hours after the flood defence assessment emerged.',
    'politics','anna-whitfield', interval '5 hours', false,
    'The finance ministry building'
  ),
  (
    'northgate-semiconductor-expands-rhoswen-plant',
    'Northgate to double Rhoswen output in £2.1bn expansion',
    'The contract manufacturer says the investment secures 1,400 jobs and adds 600 more.',
    $md$Northgate Semiconductor will double production capacity at its Rhoswen plant under a £2.1bn expansion announced on Wednesday, in what the company described as its largest single commitment outside its home market.

The investment covers a second fabrication line, an on-site substation and a water recycling facility that the company says will cut freshwater draw by roughly 60 per cent.

## Why here

Rhoswen has an unusual combination for the industry: deep-water port access, a grid connection with spare capacity, and a technical college that has been supplying the plant since it opened.

## The caveat

The announcement is conditional on grid reinforcement that the energy regulator has not yet approved. Northgate's chief executive acknowledged the dependency, saying the company had "no reason to expect a difficulty" but confirming that the timetable assumed approval within nine months.$md$,
    'Northgate Semiconductor will double capacity at Rhoswen in a £2.1bn expansion, conditional on grid reinforcement not yet approved by the regulator.',
    'business','marcus-reed', interval '9 hours', false,
    'Exterior of a semiconductor fabrication plant'
  ),
  (
    'grid-operator-queue-reform-connection-delays',
    'Grid operator to reorder connection queue after five-year waits',
    'Projects that are ready to build will jump ahead of those holding speculative positions.',
    $md$The national grid operator will reorder its connection queue from January, moving projects that can demonstrate readiness ahead of those holding places without land rights or planning consent.

Some developers currently face connection dates in the mid-2030s despite having sites ready to build. The operator said roughly a third of the queue by capacity consists of projects that have not progressed in two years.

## What changes

Applicants will have to evidence land rights and planning status at two checkpoints. Those that cannot will lose their position rather than merely being marked at risk.

## What happens next

The reform requires regulatory sign-off. Industry response has been broadly supportive, though several developers have warned that the readiness tests favour well-capitalised firms able to acquire land before securing a connection date.$md$,
    'The grid operator will reorder its connection queue from January, prioritising projects that can evidence land rights and planning consent.',
    'business','marcus-reed', interval '1 day 3 hours', false,
    'High voltage transmission lines at dusk'
  ),
  (
    'housing-completions-lowest-since-2011',
    'Housing completions fall to lowest level since 2011',
    'Starts have held up, but the gap between breaking ground and finishing has widened to 27 months.',
    $md$Housing completions fell to 118,400 last year, the lowest figure since 2011, according to statistics published on Monday.

The striking feature is not a collapse in starts, which fell only modestly, but the widening interval between them. The average time from ground-break to completion has stretched from 19 months to 27 over five years.

## Key numbers

Completions are down 14 per cent year on year. Starts are down 4 per cent. The completion-to-start ratio is the weakest in the series.

## What is driving it

Analysts point to three overlapping pressures: materials lead times that have not returned to pre-2020 norms, a shortage of specific trades rather than labour generally, and utility connection delays that leave finished shells uninhabitable.

The housing ministry said it would "examine the sequencing question" without committing to a specific intervention.$md$,
    'Housing completions fell to 118,400, the lowest since 2011, driven less by a fall in starts than by a widening gap between breaking ground and finishing.',
    'business','marcus-reed', interval '1 day 8 hours', false,
    'A partly completed housing development'
  ),
  (
    'data-protection-bill-second-reading',
    'Data protection bill clears second reading despite rebellion',
    'Twenty-three government members voted against a clause allowing automated decisions without human review.',
    $md$The data protection bill passed its second reading on Thursday by a margin of 41 votes, after a rebellion by twenty-three government members over a clause permitting fully automated administrative decisions.

The clause would allow certain benefit and licensing determinations to be made without human review, subject to an appeal right that critics argue places the burden on the individual.

## The objection

Rebels argued that an appeal right is not a substitute for a decision made properly in the first instance, and that people least able to navigate an appeals process are the most likely to be affected by an automated refusal.

## What happens next

The bill proceeds to committee, where the government has signalled it will accept amendments narrowing the categories of decision covered.$md$,
    'The data protection bill passed second reading by 41 votes after twenty-three government members rebelled over automated administrative decisions.',
    'politics','anna-whitfield', interval '2 days 2 hours', false,
    'Interior of a parliamentary chamber'
  ),
  (
    'antibiotic-resistance-surveillance-gap',
    'Surveillance gap leaves resistance trends invisible for months',
    'Regional laboratories report to a system that publishes on a quarterly cycle.',
    $md$Resistance patterns in common infections are going unreported for up to four months because regional laboratories feed a surveillance system that publishes quarterly, researchers have warned.

The delay matters because prescribing guidance is revised against published trends. A shift that begins in January may not influence guidance until well into the following quarter.

## What researchers found

The team compared laboratory-level data with published surveillance across three years. In two of eleven regions, a clinically significant shift was visible in raw results more than a full quarter before it appeared in national figures.

## The response

The health agency said the publication cycle balanced timeliness against the risk of acting on noise, and that it was "reviewing whether that balance remains correct".$md$,
    'Resistance patterns are going unreported for up to four months because regional laboratories feed a quarterly surveillance cycle.',
    'health','priya-nair', interval '2 days 9 hours', false,
    'Laboratory samples in a rack'
  ),
  (
    'rail-timetable-recast-december',
    'Rail timetable recast will cut cross-country journeys by 18 minutes',
    'The first full recast in nine years reroutes services away from a bottleneck.',
    $md$A full timetable recast in December will shorten the fastest cross-country journey by 18 minutes, the first substantial change to the pattern in nine years.

The saving comes from rerouting services around a two-track section that has constrained the corridor since electrification. Nine intermediate stations lose a direct service and gain a connection instead.

## Who gains and who loses

Passengers travelling end to end benefit most. Those at the nine intermediate stations face an interchange that adds between six and fourteen minutes depending on the hour.

## What happens next

Consultation closes at the end of the month. The operator has said the pattern is "not final" but has not indicated which elements are open to change.$md$,
    'December''s timetable recast cuts the fastest cross-country journey by 18 minutes, at the cost of direct services at nine intermediate stations.',
    'business','marcus-reed', interval '3 days', false,
    'A train at a station platform'
  ),
  (
    'open-source-maintainer-funding-study',
    'Study finds critical libraries maintained by a single person',
    'Of 500 widely deployed packages, 143 had one contributor responsible for most changes.',
    $md$Nearly a third of widely deployed open source libraries depend on a single active maintainer, according to a study of 500 packages published this week.

The researchers examined contribution patterns over three years. In 143 cases, one person was responsible for more than 80 per cent of substantive changes.

## Why it matters

Concentration is not itself a failure. It becomes one when the maintainer stops: the study identified nineteen packages where the primary maintainer had made no contribution in over a year while the package remained in active use downstream.

## The funding question

Only 34 of the 500 packages had any recurring funding. The authors argue that the mismatch between deployment and support is structural rather than a matter of individual generosity.$md$,
    'A study of 500 widely deployed open source packages found 143 depend on a single active maintainer, and only 34 have any recurring funding.',
    'technology','tomas-lindqvist', interval '3 days 7 hours', false,
    'A laptop screen showing source code'
  ),
  (
    'undersea-cable-repair-delays',
    'Cable repairs are taking longer because the ships are booked',
    'A global fleet of around 60 vessels serves a network that has tripled in length.',
    $md$Repairs to undersea communications cables are taking longer than they did a decade ago, and the reason is straightforward: the network has grown far faster than the fleet that maintains it.

Around 60 vessels worldwide are equipped for cable repair. The length of cable in service has roughly tripled since 2010.

## The consequence

A fault that would once have been attended within days can now wait weeks for a ship, particularly in regions served by a single vessel under a shared maintenance agreement.

## What is changing

Two new repair ships are under construction, with the first expected in service in 2028. Operators have also begun specifying more diverse routing at the design stage, on the reasoning that redundancy is cheaper than urgency.$md$,
    'Undersea cable repairs are slowing because a fleet of roughly 60 vessels now maintains a network that has tripled in length since 2010.',
    'technology','tomas-lindqvist', interval '4 days 2 hours', false,
    'A cable laying ship at sea'
  ),
  (
    'valmara-league-title-decided-final-day',
    'Title goes to the final day after Rhoswen hold champions',
    'A goalless draw leaves two points between the top three with one match remaining.',
    $md$The championship will be decided on the final day after Rhoswen held the reigning champions to a goalless draw on Saturday, a result that leaves two points separating the top three.

Rhoswen defended deep and with discipline for long periods, conceding possession but little else. The champions had nineteen attempts and forced two saves.

## The permutations

The leaders need a point. Second place must win and hope for a draw. Third can only win the title if both matches above them are lost, an outcome that has occurred twice in the competition's history.

All three matches kick off simultaneously.$md$,
    'A goalless draw at Rhoswen leaves two points between the top three with one round remaining, with all deciding matches kicking off simultaneously.',
    'sport','daniel-hart', interval '4 days 9 hours', false,
    'A football stadium under floodlights'
  ),
  (
    'national-gallery-restitution-review',
    'Gallery to review provenance of 900 works',
    'The review covers everything acquired between 1933 and 1955.',
    $md$The national gallery will review the provenance of roughly 900 works acquired between 1933 and 1955, the largest such exercise it has undertaken.

The review follows a claim relating to a single painting that prompted an internal audit. That audit found that acquisition records for the period were "materially incomplete" for around a fifth of the holdings.

## What the review covers

Every acquisition in the window, regardless of whether a claim has been made. The gallery said it would publish findings whether or not they were favourable to its own position.

## The wider context

Comparable institutions have conducted similar reviews over the past decade with varying degrees of transparency. This one commits in advance to publication, which researchers in the field described as the more meaningful undertaking.$md$,
    'The national gallery will review provenance for roughly 900 works acquired between 1933 and 1955, committing in advance to publishing its findings.',
    'culture','grace-obi', interval '5 days 4 hours', false,
    'A gallery interior with framed paintings'
  ),
  (
    'independent-bookshops-second-year-growth',
    'Independent bookshops record a second year of growth',
    'Numbers remain far below their 1995 peak, but the direction has changed.',
    $md$The number of independent bookshops rose for a second consecutive year, according to trade figures published this week, continuing a reversal that began after two decades of decline.

The total remains roughly 40 per cent below its mid-1990s peak. But 61 shops opened against 34 closures.

## What is behind it

Booksellers point to a shift in what the shops do. Events, subscriptions and school supply now account for a meaningful share of turnover at many of the new openings, which changes the economics of a small retail footprint.

## The caution

Trade bodies were careful not to overstate the recovery. Margins remain thin and the openings are unevenly distributed, concentrated in towns with a particular demographic profile.$md$,
    'Independent bookshops grew for a second year, with 61 openings against 34 closures, though numbers remain 40 per cent below the 1990s peak.',
    'culture','grace-obi', interval '6 days', false,
    'Interior of an independent bookshop'
  ),
  (
    'teacher-vacancies-concentrated-subjects',
    'Teacher shortage is concentrated in four subjects',
    'Overall recruitment is close to target; physics, chemistry, computing and modern languages are not.',
    $md$Teacher recruitment met 94 per cent of its overall target this year, a figure that conceals a sharp divergence between subjects.

Physics reached 41 per cent of target, computing 52 per cent, chemistry 63 and modern languages 68. Most other subjects were at or above target.

## Why the aggregate misleads

Because recruitment is reported in aggregate, the shortage reads as mild. Schools experience it as acute, because a physics vacancy cannot be filled by an over-subscribed history applicant.

## What is proposed

The department has extended subject-specific bursaries. Head teachers' representatives argue that retention, not recruitment, is where the losses actually occur, and that bursaries paid on entry do not address it.$md$,
    'Teacher recruitment hit 94 per cent of target overall, but physics reached only 41 per cent and computing 52 per cent.',
    'education','anna-whitfield', interval '6 days 8 hours', false,
    'An empty school classroom'
  ),
  (
    'river-restoration-scheme-early-results',
    'River restoration scheme shows early results after three years',
    'Reintroducing meanders has cut downstream peak flow by a fifth on the monitored stretch.',
    $md$A river restoration scheme has reduced downstream peak flow by around 20 per cent on the monitored stretch, three years after engineers reintroduced meanders to a channel straightened in the 1960s.

The work returned 4.5 kilometres of river to something closer to its historical course and reconnected 60 hectares of floodplain.

## What the monitoring shows

Peak flow downstream is lower and, more importantly, later — the delay gives communities downstream several additional hours of warning.

## The limits

Three years is a short record and the period included no exceptional event. The team was explicit that the results describe ordinary winters and say little about how the scheme performs under the conditions it was ultimately built for.$md$,
    'Three years after meanders were reintroduced, a restored river stretch shows downstream peak flow around 20 per cent lower and several hours later.',
    'environment','priya-nair', interval '7 days 2 hours', false,
    'A meandering river through farmland'
  ),
  (
    'city-transport-authority-fare-simplification',
    'Fare simplification will leave a quarter of passengers paying more',
    'The authority published the distributional analysis alongside the proposal.',
    $md$A proposed fare simplification would leave around a quarter of passengers paying more, according to a distributional analysis the transport authority published alongside the plan.

The reform replaces a zonal structure with a flat fare and a daily cap. Longer cross-city journeys become cheaper; short journeys within a single zone become more expensive.

## Who pays more

Analysis shows the increase falls disproportionately on short journeys in the outer zones, which are made more often by lower-income passengers.

## The authority''s position

Officials argued that the current structure is poorly understood and that simplicity has value in itself. They confirmed the analysis was published deliberately rather than in response to a request.$md$,
    'A proposed flat fare and daily cap would leave around a quarter of passengers paying more, with increases falling on short outer-zone journeys.',
    'society','anna-whitfield', interval '8 days', false,
    'A city bus at a stop'
  )
) as v(slug, headline, standfirst, body, summary, category, author, age, breaking, image_alt)
on conflict (slug) do nothing;

commit;

-- Licence provenance on uploaded media.
--
-- Text and pictures are not the same legal problem. Reading another outlet's
-- article and writing our own summary with attribution is defensible practice.
-- Republishing their photograph is not: the photo is a separate copyrighted
-- work, usually licensed from an agency, and using it is the clearest
-- infringement available on a site like this.
--
-- So illustrations come from openly licensed sources instead, and these columns
-- record which licence, whose work, and where it came from — because a CC BY
-- image used without its credit is an unlicensed image.

alter table public.media_assets add column licence text;
alter table public.media_assets add column licence_url text;
alter table public.media_assets add column creator text;
alter table public.media_assets add column source_url text;
alter table public.media_assets add column provider text;

comment on column public.media_assets.licence is
  'Licence identifier, e.g. "cc0", "by 2.0". Null for our own generated cards.';
comment on column public.media_assets.creator is
  'Required for attribution licences. An image credited to nobody is not licensed.';

create index media_assets_provider_idx on public.media_assets (provider, created_at desc);

-- Illustration settings.
insert into public.site_settings (key, value, description) values
  (
    'illustration_enabled',
    'true'::jsonb,
    'Whether articles are given a lead image automatically.'
  ),
  (
    'illustration_allow_photos',
    'true'::jsonb,
    'Search openly licensed photo libraries. When off, every article gets a generated typographic card instead.'
  )
on conflict (key) do nothing;

-- What picture a story needs, in the writer's words.
--
-- A stock scene chosen from the story itself — "gynaecology consultation
-- room", "undersea cable repair ship" — is relevant in a way a landmark of
-- the city the story mentions is not. The brief is generic by rule: no names,
-- no faces, so a keyword search cannot pick the wrong person.

alter table public.articles add column if not exists image_brief text;

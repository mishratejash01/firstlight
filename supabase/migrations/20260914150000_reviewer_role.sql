-- A reviewer role.
--
-- Reviewers read what went live and answer a fixed set of questions about it.
-- They approve nothing and publish nothing: the role exists so that company
-- members who are neither editors nor authors can reach the review pages and
-- write review rows, and nothing else.
--
-- Alone in its own migration because a new enum value cannot be used in the
-- transaction that adds it.

alter type public.app_role add value if not exists 'reviewer';

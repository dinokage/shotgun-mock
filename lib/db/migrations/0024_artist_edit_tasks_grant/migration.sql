-- PUT /shots/:id (status/notes updates) and POST /publish-logs (the DCC
-- publish record) are both already gated on edit_tasks, under the assumption
-- artists could update their own shot's status and publish their own work --
-- but the capability was never actually granted to the artist role, so both
-- 403'd for every real artist (confirmed live: a real artist account got
-- "Forbidden: Missing capability" on both routes while testing the DCC
-- shot-publish flow). Pure additive insert, idempotent via ON CONFLICT DO
-- NOTHING, same pattern as migration 0018.
INSERT INTO "tenant_role_capabilities" ("role_id", "capability_id")
SELECT tr."id", 'edit_tasks'
FROM "tenant_roles" tr
WHERE tr."name" = 'artist'
ON CONFLICT ("role_id", "capability_id") DO NOTHING;

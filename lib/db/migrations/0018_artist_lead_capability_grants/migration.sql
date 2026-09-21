-- User-confirmed scope (not the broader "both roles get both capabilities"
-- option): artist gets create_tasks so an artist can use "Add Shot" and the
-- Maya/Blender/Nuke DCC plugins (which POST /shots as whoever owns the
-- token); lead gets manage_pipeline so a lead can use "Add Asset". Neither
-- grant touches any other role's existing capabilities -- pure additive
-- inserts, idempotent via ON CONFLICT DO NOTHING.
INSERT INTO "tenant_role_capabilities" ("role_id", "capability_id")
SELECT tr."id", 'create_tasks'
FROM "tenant_roles" tr
WHERE tr."name" = 'artist'
ON CONFLICT ("role_id", "capability_id") DO NOTHING;

INSERT INTO "tenant_role_capabilities" ("role_id", "capability_id")
SELECT tr."id", 'manage_pipeline'
FROM "tenant_roles" tr
WHERE tr."name" = 'lead'
ON CONFLICT ("role_id", "capability_id") DO NOTHING;

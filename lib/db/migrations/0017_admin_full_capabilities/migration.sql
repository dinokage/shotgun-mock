-- Grants every capability to the "admin" role, in every tenant. Admin was
-- deliberately monitor-only up to this point (no create_tasks, approve_reviews,
-- manage_pipeline, etc.) -- the studio has since confirmed there is no
-- separate Main Producer here and admin is meant to be the single
-- all-powerful role, absorbing production management on top of the
-- user/org administration it already had. Idempotent: safe to re-run, and
-- a tenant whose admin role already holds some of these (unlikely, but
-- possible if a prior manual edit granted one) just skips those rows.
INSERT INTO "tenant_role_capabilities" ("role_id", "capability_id")
SELECT tr."id", cap.capability_id
FROM "tenant_roles" tr
CROSS JOIN (
    VALUES
        ('create_tasks'),
        ('edit_tasks'),
        ('delete_tasks'),
        ('assign_tasks'),
        ('submit_reviews'),
        ('approve_reviews'),
        ('manage_members'),
        ('manage_roles'),
        ('view_financials'),
        ('edit_financials'),
        ('manage_pipeline'),
        ('manage_licenses'),
        ('manage_integrations'),
        ('broadcast_updates')
) AS cap(capability_id)
WHERE tr."name" = 'admin'
ON CONFLICT ("role_id", "capability_id") DO NOTHING;

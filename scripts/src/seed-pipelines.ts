// Seeds the studio's three pipeline templates (3D, VFX, 2D) and binds the
// tenant's projects to the 3D shot pipeline as their default.
//
// Stage lists follow the studio's own 3D order, plus the 2D and VFX orders
// as documented by Toon Boom, Autodesk Flow Production Tracking and AYON.
// Stages bind to a real Department by name where one exists; a stage whose
// department this tenant doesn't have is still created (departmentId null)
// so the pipeline reads correctly and the department can be added later.
//
// Idempotent: re-running updates the stage rows in place rather than
// duplicating templates.
import { prisma } from "@workspace/db";
import * as crypto from "crypto";

type StageSeed = {
  name: string;
  shortCode: string;
  department?: string;
  isOptional?: boolean;
  outputFormats: string[];
  keepsLocalCopy?: boolean;
  reviewAudience: string[];
  dccPublishKind?: "shot" | "asset";
};

// Every stage is reviewed by the department lead, then the production head,
// then the main producer. Only the last stage of a pipeline additionally
// goes to the client.
const INTERNAL = ["lead", "production_head", "producer"];
const TO_CLIENT = [...INTERNAL, "client"];

const THREE_D_SHOT: StageSeed[] = [
  { name: "Layout", shortCode: "LAY", department: "Layout", outputFormats: [".mov"], keepsLocalCopy: true, reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Animation", shortCode: "ANM", department: "Animation", outputFormats: [".mov"], keepsLocalCopy: true, reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "FX", shortCode: "FX", department: "FX Simulations", isOptional: true, outputFormats: [".mov"], keepsLocalCopy: true, reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Lighting", shortCode: "LGT", department: "Lighting", outputFormats: [".mov"], keepsLocalCopy: true, reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Rendering", shortCode: "RND", department: "Rendering", outputFormats: [".exr"], keepsLocalCopy: true, reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Composition", shortCode: "CMP", department: "Compositing", outputFormats: [".mov", ".exr"], keepsLocalCopy: true, reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Final", shortCode: "FIN", department: "Production Management", outputFormats: [".mov", ".exr"], reviewAudience: TO_CLIENT },
];

// Modelling produces a .png alongside the work file and publishes as an
// asset, which is why it sits on the asset track rather than the shot track.
const THREE_D_ASSET: StageSeed[] = [
  { name: "Modelling", shortCode: "MOD", department: "Modeling", outputFormats: [".png"], keepsLocalCopy: true, reviewAudience: INTERNAL, dccPublishKind: "asset" },
  { name: "Texturing / LookDev", shortCode: "TEX", department: "Texturing / LookDev", outputFormats: [".exr", ".png"], reviewAudience: INTERNAL, dccPublishKind: "asset" },
  { name: "Rigging", shortCode: "RIG", department: "Rigging", outputFormats: [".ma", ".mb"], reviewAudience: INTERNAL, dccPublishKind: "asset" },
  { name: "Grooming", shortCode: "GRM", department: "Grooming", isOptional: true, outputFormats: [".abc"], reviewAudience: INTERNAL, dccPublishKind: "asset" },
];

const VFX_SHOT: StageSeed[] = [
  { name: "Ingest / Plate Prep", shortCode: "ING", department: "Production Management", outputFormats: [".exr", ".dpx"], reviewAudience: INTERNAL },
  { name: "Matchmove", shortCode: "MM", department: "Matchmove / Camera Tracking", outputFormats: [".abc", ".fbx"], reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Rotoscoping", shortCode: "ROTO", department: "Rotoscoping (Roto)", isOptional: true, outputFormats: [".exr", ".nk"], reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Paint / Prep", shortCode: "PREP", department: "Paint / Prep", isOptional: true, outputFormats: [".exr", ".nk"], reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Layout", shortCode: "LAY", department: "Layout", outputFormats: [".mov", ".abc"], keepsLocalCopy: true, reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Animation", shortCode: "ANM", department: "Animation", outputFormats: [".mov", ".abc"], keepsLocalCopy: true, reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Creature FX", shortCode: "CFX", department: "Creature Effects (CFX)", isOptional: true, outputFormats: [".abc"], reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "FX", shortCode: "FX", department: "FX Simulations", isOptional: true, outputFormats: [".vdb", ".exr"], reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Matte Painting", shortCode: "DMP", department: "Digital Matte Painting (DMP)", isOptional: true, outputFormats: [".exr", ".psd"], reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Lighting", shortCode: "LGT", department: "Lighting", outputFormats: [".exr", ".mov"], keepsLocalCopy: true, reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Rendering", shortCode: "RND", department: "Rendering", outputFormats: [".exr"], keepsLocalCopy: true, reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Compositing", shortCode: "CMP", department: "Compositing", outputFormats: [".exr", ".mov", ".nk"], keepsLocalCopy: true, reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Final QC / Delivery", shortCode: "QC", department: "Production Management", outputFormats: [".exr", ".mov"], reviewAudience: TO_CLIENT },
];

const TWO_D_SHOT: StageSeed[] = [
  { name: "Storyboard", shortCode: "SB", outputFormats: [".sboard", ".pdf"], reviewAudience: INTERNAL },
  { name: "Animatic", shortCode: "ANI", outputFormats: [".mov"], reviewAudience: TO_CLIENT },
  { name: "Background Layout", shortCode: "BGL", department: "Layout", outputFormats: [".psd", ".tpl"], reviewAudience: INTERNAL },
  { name: "Background Paint", shortCode: "BGP", outputFormats: [".psd", ".png"], reviewAudience: INTERNAL },
  { name: "Scene Setup", shortCode: "SET", outputFormats: [".xstage"], reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Animation", shortCode: "ANM", department: "2D Animation / Motion Graphics", outputFormats: [".tvpp", ".xstage"], keepsLocalCopy: true, reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Clean-up", shortCode: "CU", isOptional: true, outputFormats: [".tvpp", ".xstage"], reviewAudience: INTERNAL },
  { name: "Ink & Paint", shortCode: "IP", isOptional: true, outputFormats: [".xstage"], reviewAudience: INTERNAL },
  { name: "2D FX", shortCode: "2DFX", isOptional: true, outputFormats: [".png", ".tpl"], reviewAudience: INTERNAL },
  { name: "Compositing", shortCode: "CMP", department: "Compositing", outputFormats: [".mov", ".png"], keepsLocalCopy: true, reviewAudience: INTERNAL, dccPublishKind: "shot" },
  { name: "Final", shortCode: "FIN", department: "Production Management", outputFormats: [".mov"], reviewAudience: TO_CLIENT },
];

// 2D's asset track: designs, colour styling and rig builds are reused across
// many scenes, so they publish as assets rather than per-scene.
const TWO_D_ASSET: StageSeed[] = [
  { name: "Design (B&W)", shortCode: "DSN", outputFormats: [".psd", ".ai"], reviewAudience: INTERNAL, dccPublishKind: "asset" },
  { name: "Colour Design", shortCode: "CLR", outputFormats: [".psd"], reviewAudience: INTERNAL, dccPublishKind: "asset" },
  { name: "Puppet Build", shortCode: "RIG", department: "Rigging", isOptional: true, outputFormats: [".tpl"], reviewAudience: INTERNAL, dccPublishKind: "asset" },
];

const TEMPLATES = [
  { name: "3D Shot Pipeline", discipline: "3d", entityKind: "shot", isDefault: true, stages: THREE_D_SHOT, description: "Layout through Final, as run by this studio." },
  { name: "3D Asset Pipeline", discipline: "3d", entityKind: "asset", isDefault: true, stages: THREE_D_ASSET, description: "Modelling through Grooming; assets are built once and referenced into many shots." },
  { name: "VFX Shot Pipeline", discipline: "vfx", entityKind: "shot", isDefault: false, stages: VFX_SHOT, description: "Live-action VFX: plate ingest through final QC." },
  { name: "2D Shot Pipeline", discipline: "2d", entityKind: "shot", isDefault: false, stages: TWO_D_SHOT, description: "Storyboard through Final for 2D/cut-out series work." },
  { name: "2D Asset Pipeline", discipline: "2d", entityKind: "asset", isDefault: false, stages: TWO_D_ASSET, description: "Character and prop design, colour styling and puppet builds." },
];

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  if (tenants.length === 0) throw new Error("No tenants found");

  for (const tenant of tenants) {
    const departments = await prisma.department.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true },
    });
    const deptByName = new Map(departments.map((d) => [d.name, d.id]));

    for (const t of TEMPLATES) {
      let template = await prisma.pipelineTemplate.findFirst({
        where: { tenantId: tenant.id, name: t.name },
      });
      if (!template) {
        template = await prisma.pipelineTemplate.create({
          data: {
            id: crypto.randomUUID(),
            tenantId: tenant.id,
            name: t.name,
            discipline: t.discipline,
            entityKind: t.entityKind,
            description: t.description,
            isDefault: t.isDefault,
          },
        });
      }

      await prisma.pipelineStage.deleteMany({ where: { templateId: template.id } });
      await prisma.pipelineStage.createMany({
        data: t.stages.map((s, i) => ({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          templateId: template!.id,
          name: s.name,
          shortCode: s.shortCode,
          sortOrder: i,
          departmentId: s.department ? (deptByName.get(s.department) ?? null) : null,
          isOptional: s.isOptional ?? false,
          outputFormats: s.outputFormats,
          keepsLocalCopy: s.keepsLocalCopy ?? false,
          reviewAudience: s.reviewAudience,
          dccPublishKind: s.dccPublishKind ?? null,
        })),
      });

      const unmatched = t.stages.filter(
        (s) => s.department && !deptByName.has(s.department),
      );
      console.log(
        `${tenant.name}: ${t.name} — ${t.stages.length} stages` +
          (unmatched.length
            ? ` (no department row for: ${unmatched.map((s) => s.department).join(", ")})`
            : ""),
      );
    }

    // Bind every project to this tenant's default templates, so a project
    // has a working pipeline without anyone configuring one first.
    const defaults = await prisma.pipelineTemplate.findMany({
      where: { tenantId: tenant.id, isDefault: true },
      select: { id: true, name: true },
    });
    const projects = await prisma.project.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      select: { id: true, name: true },
    });
    for (const project of projects) {
      for (const template of defaults) {
        const existing = await prisma.projectPipeline.findFirst({
          where: { projectId: project.id, templateId: template.id },
        });
        if (existing) continue;
        await prisma.projectPipeline.create({
          data: {
            id: crypto.randomUUID(),
            tenantId: tenant.id,
            projectId: project.id,
            templateId: template.id,
          },
        });
        console.log(`  bound ${project.name} -> ${template.name}`);
      }
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

export const USERS = [
  { id: 'u1', name: 'Maya Chen', role: 'Art Director', avatar: 'https://i.pravatar.cc/150?u=u1', email: 'maya@nebula.co' },
  { id: 'u2', name: 'Luca Moretti', role: 'Lead Animator', avatar: 'https://i.pravatar.cc/150?u=u2', email: 'luca@nebula.co' },
  { id: 'u3', name: 'Priya Nair', role: 'FX Artist', avatar: 'https://i.pravatar.cc/150?u=u3', email: 'priya@nebula.co' },
  { id: 'u4', name: 'Tomasz Kowalski', role: 'Compositor', avatar: 'https://i.pravatar.cc/150?u=u4', email: 'tomasz@nebula.co' },
  { id: 'u5', name: 'Aisha Diallo', role: 'Producer', avatar: 'https://i.pravatar.cc/150?u=u5', email: 'aisha@nebula.co' },
  { id: 'u6', name: 'Rafi Solomonov', role: 'Pipeline TD', avatar: 'https://i.pravatar.cc/150?u=u6', email: 'rafi@nebula.co' },
  { id: 'u7', name: 'Yuki Tanaka', role: 'Environment Artist', avatar: 'https://i.pravatar.cc/150?u=u7', email: 'yuki@nebula.co' },
  { id: 'u8', name: 'Diego Vargas', role: 'Character Animator', avatar: 'https://i.pravatar.cc/150?u=u8', email: 'diego@nebula.co' },
];

export const PROJECTS = [
  { id: 'p1', name: 'Starfall', type: 'Animated Feature', progress: 68, status: 'ON_TRACK', shotsCount: 247, assetsCount: 84, dueDate: '2024-11-30', thumbnail: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', lastActivity: '2 hours ago' },
  { id: 'p2', name: 'Iron Veil', type: 'Game Cinematic', progress: 41, status: 'AT_RISK', shotsCount: 62, assetsCount: 31, dueDate: '2024-10-15', thumbnail: 'linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%)', lastActivity: '1 day ago' },
  { id: 'p3', name: 'Nova Burst', type: 'Ad Campaign', progress: 89, status: 'BLOCKED', shotsCount: 18, assetsCount: 12, dueDate: '2024-10-03', thumbnail: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)', lastActivity: '5 hours ago' }
];

export const SHOTS = [
  { id: 'SEQ_010_SH_010', name: 'Opening Scene', projectId: 'p1', sequence: 'SEQ_010', status: 'complete', assigneeId: 'u2', updatedAt: '2024-09-15' },
  { id: 'SEQ_020_SH_040', name: 'Descent Action', projectId: 'p1', sequence: 'SEQ_020', status: 'blocked', assigneeId: 'u4', updatedAt: '2024-09-20' },
  { id: 'SEQ_030_SH_015', name: 'Climax Build', projectId: 'p1', sequence: 'SEQ_030', status: 'in-progress', assigneeId: 'u8', updatedAt: '2024-09-22' },
];

export const ASSETS = [
  { id: 'CHAR_Hero_Lyra', name: 'Lyra', projectId: 'p1', type: 'Character', status: 'complete', assigneeId: 'u2', updatedAt: '2024-09-10' },
  { id: 'CHAR_Villain_Moros', name: 'Moros', projectId: 'p1', type: 'Character', status: 'at-risk', assigneeId: 'u8', updatedAt: '2024-09-18' },
  { id: 'ENV_DesertCanyons', name: 'Desert Canyons', projectId: 'p1', type: 'Environment', status: 'complete', assigneeId: 'u7', updatedAt: '2024-08-25' },
  { id: 'PROP_AncientArtifact', name: 'Ancient Artifact', projectId: 'p1', type: 'Prop', status: 'in-progress', assigneeId: 'u1', updatedAt: '2024-09-21' },
  { id: 'RIG_Lyra_v3', name: 'Lyra Rig v3', projectId: 'p1', type: 'Rig', status: 'complete', assigneeId: 'u6', updatedAt: '2024-09-12' },
  { id: 'SFX_WindDust', name: 'Wind & Dust', projectId: 'p1', type: 'Effects', status: 'at-risk', assigneeId: 'u3', updatedAt: '2024-09-23' },
  { id: 'FX_MagicBlast', name: 'Magic Blast', projectId: 'p1', type: 'Effects', status: 'blocked', assigneeId: 'u3', updatedAt: '2024-09-24' },
  { id: 'ENV_SpaceStation', name: 'Space Station', projectId: 'p1', type: 'Environment', status: 'in-progress', assigneeId: 'u7', updatedAt: '2024-09-25' },
];

export const TASKS = [
  { id: 't1', title: 'Rig facial controls for Lyra', projectId: 'p1', assetId: 'RIG_Lyra_v3', assigneeId: 'u2', status: 'in-progress', priority: 'high', dueDate: '2024-10-05', estimatedHours: 40, actualHours: 12, tags: ['rigging', 'facial'], dependencies: [] },
  { id: 't2', title: 'Light SEQ_020_SH_040', projectId: 'p1', shotId: 'SEQ_020_SH_040', assigneeId: 'u4', status: 'blocked', priority: 'critical', dueDate: '2024-10-10', estimatedHours: 24, actualHours: 0, tags: ['lighting'], dependencies: ['t8'] },
  { id: 't3', title: 'FX sim for MagicBlast', projectId: 'p1', assetId: 'FX_MagicBlast', assigneeId: 'u3', status: 'in-progress', priority: 'high', dueDate: '2024-09-28', estimatedHours: 30, actualHours: 20, tags: ['fx', 'simulation'], dependencies: [] },
  { id: 't4', title: 'Camera animation pass', projectId: 'p2', shotId: 'SEQ_010_SH_010', assigneeId: 'u8', status: 'review', priority: 'medium', dueDate: '2024-09-26', estimatedHours: 16, actualHours: 16, tags: ['layout', 'camera'], dependencies: [] },
  { id: 't5', title: 'Final color grade', projectId: 'p1', shotId: 'SEQ_030_SH_015', assigneeId: 'u4', status: 'review', priority: 'high', dueDate: '2024-09-27', estimatedHours: 8, actualHours: 8, tags: ['comp', 'color'], dependencies: [] },
  { id: 't8', title: 'Model Space Station exterior', projectId: 'p1', assetId: 'ENV_SpaceStation', assigneeId: 'u7', status: 'in-progress', priority: 'high', dueDate: '2024-10-01', estimatedHours: 80, actualHours: 45, tags: ['modeling', 'environment'], dependencies: [] },
  { id: 't6', title: 'Review Moros walk cycle', projectId: 'p1', assetId: 'CHAR_Villain_Moros', assigneeId: 'u1', status: 'todo', priority: 'medium', dueDate: '2024-09-30', estimatedHours: 2, actualHours: 0, tags: ['review'], dependencies: [] },
  { id: 't7', title: 'Approve Desert Canyons layout', projectId: 'p1', assetId: 'ENV_DesertCanyons', assigneeId: 'u1', status: 'todo', priority: 'medium', dueDate: '2024-09-28', estimatedHours: 1, actualHours: 0, tags: ['approval'], dependencies: [] },
];

export const VERSIONS = [
  { id: 'v1', entityId: 'SEQ_020_SH_040', entityType: 'shot', versionNumber: 'v003', status: 'pending', createdById: 'u4', createdAt: '2024-09-24T10:00:00Z', thumbnailUrl: 'https://picsum.photos/seed/v1/320/180', notes: 'Updated lighting per review notes.', derivedFromId: 'v0' },
  { id: 'v2', entityId: 'CHAR_Hero_Lyra', entityType: 'asset', versionNumber: 'v012', status: 'approved', createdById: 'u2', createdAt: '2024-09-10T14:30:00Z', thumbnailUrl: 'https://picsum.photos/seed/v2/320/180', notes: 'Final rig with facial controls.', derivedFromId: 'v2_prev' },
];

export const AUDIT_EVENTS = [
  { id: 'e1', entityId: 'CHAR_Hero_Lyra', timestamp: '2024-08-01 09:00:00', userId: 'u1', eventType: 'created', description: 'Created asset CHAR_Hero_Lyra', changedFields: { name: 'null → Lyra' } },
  { id: 'e2', entityId: 'CHAR_Hero_Lyra', timestamp: '2024-08-02 10:15:00', userId: 'u5', eventType: 'status_changed', description: 'Status changed to in-progress', changedFields: { status: 'todo → in-progress' } },
  { id: 'e3', entityId: 'CHAR_Hero_Lyra', timestamp: '2024-08-02 10:16:00', userId: 'u5', eventType: 'assignee_set', description: 'Assigned to Luca Moretti', changedFields: { assigneeId: 'null → u2' } },
  { id: 'e4', entityId: 'CHAR_Hero_Lyra', timestamp: '2024-08-15 14:00:00', userId: 'u2', eventType: 'version_submitted', description: 'Submitted v001', changedFields: {} },
  { id: 'e5', entityId: 'CHAR_Hero_Lyra', timestamp: '2024-08-16 11:30:00', userId: 'u1', eventType: 'version_rejected', description: 'Rejected v001', changedFields: { notes: 'needs more facial detail' } },
  { id: 'e6', entityId: 'CHAR_Hero_Lyra', timestamp: '2024-08-25 16:45:00', userId: 'u2', eventType: 'version_submitted', description: 'Submitted v002', changedFields: {} },
  { id: 'e7', entityId: 'CHAR_Hero_Lyra', timestamp: '2024-08-26 09:20:00', userId: 'u1', eventType: 'version_approved', description: 'Approved v002', changedFields: {} },
  { id: 'e8', entityId: 'CHAR_Hero_Lyra', timestamp: '2024-08-26 10:00:00', userId: 'u6', eventType: 'linked_to_shot', description: 'Linked to SEQ_010_SH_010', changedFields: {} },
  { id: 'e9', entityId: 'CHAR_Hero_Lyra', timestamp: '2024-09-10 14:30:00', userId: 'u2', eventType: 'status_changed', description: 'Status changed to complete', changedFields: { status: 'in-progress → complete' } },
  { id: 'e10', entityId: 'CHAR_Hero_Lyra', timestamp: '2024-09-10 14:35:00', userId: 'u6', eventType: 'published', description: 'Published RIG_Lyra_v3', changedFields: {} },
  { id: 'e11', entityId: 'CHAR_Hero_Lyra', timestamp: '2024-09-10 14:36:00', userId: 'u6', eventType: 'downstream_notified', description: 'Notified 4 artists', changedFields: {} },
];

export const NOTIFICATIONS = [
  { id: 'n1', title: 'Task Assigned', description: 'You were assigned to "Review Moros walk cycle"', timestamp: '10 mins ago', read: false },
  { id: 'n2', title: 'Version Approved', description: 'Maya Chen approved v003 of SEQ_030_SH_015', timestamp: '1 hour ago', read: false },
  { id: 'n3', title: 'Dependency Blocked', description: 'FX_MagicBlast is blocked, affecting your task', timestamp: '3 hours ago', read: true },
];

export const AI_RECOMMENDATIONS = [
  { id: 'r1', severity: 'CRITICAL', title: 'ENV_SpaceStation is a dependency for 7 shots in SEQ_030. Yuki is at 112% capacity. If this slips 3+ days, critical path extends by 11 days.', entity: 'ENV_SpaceStation', assignee: 'Yuki Tanaka' },
  { id: 'r2', severity: 'HIGH', title: 'SEQ_020_SH_040 blocks 3 downstream tasks. Current velocity 40% below required pace based on 6 weeks of event history. P95 completion risk: Oct 22.', entity: 'SEQ_020_SH_040', assignee: 'Tomasz Kowalski' },
  { id: 'r3', severity: 'MEDIUM', title: 'Iron Veil camera animation review cycle averaging 2.8 rounds/shot vs studio avg 1.4. P50=Nov 3, P80=Nov 9, P95=Nov 14.', entity: 'Iron Veil', assignee: 'Diego Vargas' },
];

export const SCHEDULING_CAPACITY = [
  { userId: 'u1', weeks: [85, 90, 80, 85, 75] },
  { userId: 'u2', weeks: [95, 90, 85, 90, 80] },
  { userId: 'u3', weeks: [80, 85, 90, 95, 80] },
  { userId: 'u4', weeks: [70, 85, 90, 112, 95] },
  { userId: 'u5', weeks: [80, 80, 80, 85, 85] },
  { userId: 'u6', weeks: [90, 90, 85, 80, 75] },
  { userId: 'u7', weeks: [90, 85, 108, 119, 85] },
  { userId: 'u8', weeks: [75, 85, 90, 95, 80] },
];

export const PLUGINS = [
  { id: 'pl1', name: 'AI Auto-Layout', category: 'Pipeline', rating: 4.8, installs: '2.3k', verified: true, icon: 'Zap' },
  { id: 'pl2', name: 'BulkRender Submit', category: 'Render', rating: 4.5, installs: '8.1k', verified: true, icon: 'Package' },
  { id: 'pl3', name: 'ShotGrid Sync', category: 'Integration', rating: 4.2, installs: '5.9k', verified: true, icon: 'Link' },
  { id: 'pl4', name: 'Deadline Monitor', category: 'Monitoring', rating: 4.7, installs: '3.4k', verified: true, icon: 'Activity' },
  { id: 'pl5', name: 'QuickNote Overlay', category: 'Annotation', rating: 4.0, installs: '1.2k', verified: true, icon: 'PenTool' },
  { id: 'pl6', name: 'BetaColorProfile', category: 'Color', rating: 3.1, installs: '421', verified: false, icon: 'Palette' },
  { id: 'pl7', name: 'KitsuBridge', category: 'Integration', rating: 4.6, installs: '6.7k', verified: true, icon: 'Link2' },
  { id: 'pl8', name: 'TimelapseCapture', category: 'Tools', rating: 3.8, installs: '987', verified: false, icon: 'Camera' },
];

export const WORKFLOWS = [
  { id: 'wf1', name: 'Review → Approve → Publish', description: 'Standard review loop with auto-publish on approval', nodes: 4, lastEdited: '2 days ago', trigger: 'New Version' },
  { id: 'wf2', name: 'Shot Delivery Pipeline', description: 'Export, transcode, and upload to client', nodes: 6, lastEdited: '1 week ago', trigger: 'Status Change' },
  { id: 'wf3', name: 'Asset QC Check', description: 'Automated geometry and texture validation', nodes: 3, lastEdited: '3 weeks ago', trigger: 'Publish' },
  { id: 'wf4', name: 'Client Preview Loop', description: 'Watermark and send to client portal', nodes: 5, lastEdited: '1 month ago', trigger: 'Manual' },
  { id: 'wf5', name: 'Emergency Hotfix', description: 'Bypass standard gates for critical fixes', nodes: 2, lastEdited: '2 months ago', trigger: 'Manual' },
  { id: 'wf6', name: 'New Project Onboarding', description: 'Create folders, set permissions, invite team', nodes: 8, lastEdited: '3 months ago', trigger: 'New Project' },
];

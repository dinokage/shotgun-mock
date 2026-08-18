import fs from 'fs';
import path from 'path';

// Let's generate a new mockData.ts string
const content = `
// ============================================================================
// FORGE — Mock Data v3.0 (Production Head Spec)
// Hierarchy: Project -> Episode -> Sequence -> Shot -> Asset
// Departments: 2D, 3D, VFX
// ============================================================================

export type Role =
  | 'vfx_producer'
  | 'production_manager'
  | 'coordinator'
  | 'supervisor'
  | 'lead'
  | 'senior_artist'
  | 'artist'
  | 'junior_artist';

export const ROLE_HIERARCHY: Record<Role, number> = {
  vfx_producer: 8,
  production_manager: 7,
  coordinator: 6,
  supervisor: 5,
  lead: 4,
  senior_artist: 3,
  artist: 2,
  junior_artist: 1,
};

export const ROLE_LABELS: Record<Role, string> = {
  vfx_producer: 'VFX Producer',
  production_manager: 'Production Manager',
  coordinator: 'Production Coordinator',
  supervisor: 'Supervisor',
  lead: 'Lead',
  senior_artist: 'Senior Artist',
  artist: 'Artist',
  junior_artist: 'Junior Artist',
};

export function canAssignTo(assignerRole: Role, assigneeRole: Role): boolean {
  return ROLE_HIERARCHY[assignerRole] > ROLE_HIERARCHY[assigneeRole];
}

export interface Department {
  id: string;
  name: string;
  abbreviation: string;
  color: string;
  supervisorId: string;
  leadId: string;
  description: string;
  pipelineStages: string[];
}

export interface User {
  id: string;
  empId: string;
  name: string;
  role: Role;
  title: string;
  departmentId: string;
  avatar: string;
  email: string;
  capacity: number;
  status: 'active' | 'away' | 'on-leave';
  skills: string[];
}

export interface Project {
  id: string;
  name: string;
  type: string;
  progress: number;
  status: 'ON_TRACK' | 'AT_RISK' | 'BOTTLENECK' | 'COMPLETE';
  dueDate: string;
  startDate: string;
  thumbnail: string;
  description: string;
  client: string;
  budget: number;
}

export interface Episode {
  id: string;
  name: string;
  projectId: string;
  status: 'complete' | 'in-progress' | 'bottleneck' | 'not-started';
  progress: number;
  dueDate: string;
}

export interface Sequence {
  id: string;
  name: string;
  projectId: string;
  episodeId: string;
  status: 'complete' | 'in-progress' | 'bottleneck' | 'not-started';
  progress: number;
}

export interface Shot {
  id: string;
  name: string;
  projectId: string;
  episodeId: string;
  sequenceId: string;
  status: 'complete' | 'in-progress' | 'bottleneck' | 'review' | 'not-started' | 'at-risk';
  assigneeId: string; // The lead or artist responsible
  frameRange: string;
  complexity: 'low' | 'medium' | 'high';
  internalReviewStatus: 'pending' | 'approved' | 'rejected' | 'changes-requested' | 'not-submitted';
  clientReviewStatus: 'pending' | 'approved' | 'rejected' | 'changes-requested' | 'not-submitted';
}

export interface Asset {
  id: string;
  name: string;
  projectId: string;
  type: 'Character' | 'Environment' | 'Prop' | 'Rig' | 'Effects' | 'Vehicle';
  status: 'complete' | 'in-progress' | 'bottleneck' | 'at-risk' | 'not-started' | 'review';
  assigneeId: string;
  version: string;
  dependencies: string[];
}

export type TaskStatus = 'todo' | 'in-progress' | 'bottleneck' | 'lead-review' | 'manager-review' | 'approved' | 'cancelled';

export interface Task {
  id: string;
  title: string;
  projectId: string;
  episodeId?: string;
  sequenceId?: string;
  shotId?: string;
  assetId?: string;
  assigneeId: string;
  assignedById: string;
  departmentId: string;
  pipelineStage: string;
  status: TaskStatus;
  priority: 'critical' | 'high' | 'medium' | 'low';
  dueDate: string;
  estimatedHours: number;
  actualHours: number;
  dependencies: string[]; // Task IDs this task depends on
}

export interface TimeLog {
  id: string;
  userId: string;
  taskId: string;
  date: string;
  hours: number;
  note: string;
}

// --- DATA ---
export const DEPARTMENTS: Department[] = [
  {
    id: 'dept-2d',
    name: '2D Animation',
    abbreviation: '2D',
    color: '#3b82f6', // blue
    supervisorId: 'u-2d-sup',
    leadId: 'u-2d-lead',
    description: '2D Animation and Compositing',
    pipelineStages: ['Storyboard', 'Animatic', 'Layout', 'Animation', 'Cleanup', 'Comp']
  },
  {
    id: 'dept-3d',
    name: '3D Animation',
    abbreviation: '3D',
    color: '#a855f7', // purple
    supervisorId: 'u-3d-sup',
    leadId: 'u-3d-lead',
    description: '3D Modeling, Rigging, and Animation',
    pipelineStages: ['Model', 'Texture', 'Rig', 'Layout', 'Animation', 'LookDev', 'Lighting']
  },
  {
    id: 'dept-vfx',
    name: 'VFX',
    abbreviation: 'VFX',
    color: '#ef4444', // red
    supervisorId: 'u-vfx-sup',
    leadId: 'u-vfx-lead',
    description: 'Visual Effects and Simulation',
    pipelineStages: ['R&D', 'Simulation', 'FX', 'Comp']
  }
];

export const USERS: User[] = [
  { id: 'u-prod', empId: 'E001', name: 'Maya Chen', role: 'vfx_producer', title: 'Main Production Head', departmentId: 'all', avatar: 'https://i.pravatar.cc/150?u=prod', email: 'maya@nebula.com', capacity: 100, status: 'active', skills: ['Management'] },
  { id: 'u-3d-sup', empId: 'E002', name: 'Aisha Diallo', role: 'supervisor', title: '3D Supervisor', departmentId: 'dept-3d', avatar: 'https://i.pravatar.cc/150?u=3dsup', email: 'aisha@nebula.com', capacity: 100, status: 'active', skills: ['Maya', 'Houdini'] },
  { id: 'u-3d-lead', empId: 'E003', name: 'Jada Williams', role: 'lead', title: '3D Lead', departmentId: 'dept-3d', avatar: 'https://i.pravatar.cc/150?u=3dlead', email: 'jada@nebula.com', capacity: 80, status: 'active', skills: ['Maya', 'ZBrush'] },
  { id: 'u-3d-art1', empId: 'E004', name: 'Yuki Tanaka', role: 'senior_artist', title: 'Senior TD', departmentId: 'dept-3d', avatar: 'https://i.pravatar.cc/150?u=yuki', email: 'yuki@nebula.com', capacity: 30, status: 'active', skills: ['Rigging', 'Python'] },
  { id: 'u-3d-art2', empId: 'E005', name: 'Sam Carter', role: 'artist', title: '3D Artist', departmentId: 'dept-3d', avatar: 'https://i.pravatar.cc/150?u=sam', email: 'sam@nebula.com', capacity: 100, status: 'active', skills: ['Modeling', 'Texturing'] },
  { id: 'u-2d-sup', empId: 'E006', name: 'Kenji Sato', role: 'supervisor', title: '2D Supervisor', departmentId: 'dept-2d', avatar: 'https://i.pravatar.cc/150?u=2dsup', email: 'kenji@nebula.com', capacity: 100, status: 'active', skills: ['ToonBoom', 'Nuke'] },
  { id: 'u-vfx-sup', empId: 'E007', name: 'Elena Rodriguez', role: 'supervisor', title: 'VFX Supervisor', departmentId: 'dept-vfx', avatar: 'https://i.pravatar.cc/150?u=vfxsup', email: 'elena@nebula.com', capacity: 100, status: 'active', skills: ['Houdini', 'Nuke'] },
];

export const PROJECTS: Project[] = [
  { id: 'p1', name: 'Leo & Loona', type: 'Animated Series', progress: 45, status: 'AT_RISK', dueDate: '2026-12-15', startDate: '2026-01-10', thumbnail: 'https://picsum.photos/seed/p1/400/225', description: '3D Animated Kids Show', client: 'Netflix', budget: 1500000 },
  { id: 'p2', name: 'PES (Poland)', type: 'VFX Feature', progress: 10, status: 'ON_TRACK', dueDate: '2027-05-20', startDate: '2026-06-01', thumbnail: 'https://picsum.photos/seed/p2/400/225', description: 'Sci-fi short film VFX', client: 'Warner Bros', budget: 3500000 }
];

export const EPISODES: Episode[] = [
  { id: 'ep1', name: 'Pilot 1 Min', projectId: 'p1', status: 'in-progress', progress: 60, dueDate: '2026-08-30' },
  { id: 'ep2', name: 'EPC3', projectId: 'p2', status: 'not-started', progress: 0, dueDate: '2026-10-15' }
];

export const SEQUENCES: Sequence[] = [
  { id: 'seq1', name: 'SEQ_010', projectId: 'p1', episodeId: 'ep1', status: 'in-progress', progress: 80 },
  { id: 'seq2', name: 'SEQ_020', projectId: 'p1', episodeId: 'ep1', status: 'not-started', progress: 0 }
];

export const SHOTS: Shot[] = [
  { id: 'sh1', name: 'SH_010_010', projectId: 'p1', episodeId: 'ep1', sequenceId: 'seq1', status: 'in-progress', assigneeId: 'u-3d-lead', frameRange: '1001-1240', complexity: 'high', internalReviewStatus: 'pending', clientReviewStatus: 'not-submitted' },
  { id: 'sh2', name: 'SH_010_020', projectId: 'p1', episodeId: 'ep1', sequenceId: 'seq1', status: 'bottleneck', assigneeId: 'u-3d-art1', frameRange: '1001-1150', complexity: 'medium', internalReviewStatus: 'not-submitted', clientReviewStatus: 'not-submitted' },
  { id: 'sh3', name: 'SH_020_010', projectId: 'p1', episodeId: 'ep1', sequenceId: 'seq2', status: 'not-started', assigneeId: 'u-3d-art2', frameRange: '1001-1080', complexity: 'low', internalReviewStatus: 'not-submitted', clientReviewStatus: 'not-submitted' }
];

export const ASSETS: Asset[] = [
  { id: 'a1', name: 'Leo', projectId: 'p1', type: 'Character', status: 'in-progress', assigneeId: 'u-3d-art1', version: 'v014', dependencies: [] },
  { id: 'a2', name: 'Loona', projectId: 'p1', type: 'Character', status: 'complete', assigneeId: 'u-3d-art2', version: 'v010', dependencies: [] },
  { id: 'a3', name: 'Leo House', projectId: 'p1', type: 'Environment', status: 'bottleneck', assigneeId: 'u-3d-art2', version: 'v005', dependencies: ['a1'] },
  { id: 'a4', name: 'Skateboard', projectId: 'p1', type: 'Prop', status: 'complete', assigneeId: 'u-3d-art2', version: 'v002', dependencies: [] }
];

export const TASKS: Task[] = [
  { id: 't1', title: 'Hero Character Rig v14', projectId: 'p1', assetId: 'a1', assigneeId: 'u-3d-art1', assignedById: 'u-3d-lead', departmentId: 'dept-3d', pipelineStage: 'Rig', status: 'bottleneck', priority: 'critical', dueDate: '2026-08-10', estimatedHours: 40, actualHours: 32, dependencies: [] },
  { id: 't2', title: 'Leo House Texturing', projectId: 'p1', assetId: 'a3', assigneeId: 'u-3d-art2', assignedById: 'u-3d-lead', departmentId: 'dept-3d', pipelineStage: 'Texture', status: 'in-progress', priority: 'high', dueDate: '2026-08-15', estimatedHours: 60, actualHours: 20, dependencies: ['t1'] },
  { id: 't3', title: 'SH_010_010 Animation', projectId: 'p1', shotId: 'sh1', assigneeId: 'u-3d-lead', assignedById: 'u-3d-sup', departmentId: 'dept-3d', pipelineStage: 'Animation', status: 'in-progress', priority: 'high', dueDate: '2026-08-20', estimatedHours: 80, actualHours: 40, dependencies: ['t1'] }
];

export const TIME_LOGS: TimeLog[] = [
  { id: 'l1', userId: 'u-3d-art1', taskId: 't1', date: '2026-08-07', hours: 8, note: 'Worked on rigging deformations' }
];

// Helper to get global state for mocked user punch-ins
export const USER_STATUS = USERS.reduce((acc, u) => {
  acc[u.id] = { isPunchedIn: Math.random() > 0.3, lastActive: new Date().toISOString() };
  return acc;
}, {} as Record<string, { isPunchedIn: boolean, lastActive: string }>);

`;

const targetPath = path.resolve(process.cwd(), 'src/data/mockData.ts');
fs.writeFileSync(targetPath, content);
console.log(`Done writing to ${targetPath}`);

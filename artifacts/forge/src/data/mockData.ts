// ============================================================================
// FORGE — Mock Data
// 3 Studios · 10 Projects · 50+ Artists · 150 Assets · 100 Shots · 300 Tasks
// ============================================================================

// --- Types -------------------------------------------------------------------

export type Role = 'manager' | 'animator' | 'reviewer';

export interface Studio {
  id: string;
  name: string;
  logo: string;
  region: string;
  artistCount: number;
  projectCount: number;
}

export interface User {
  id: string;
  name: string;
  role: string;
  department: string;
  avatar: string;
  email: string;
  studioId: string;
  capacity: number; // percentage
  licenses: string[];
}

export interface Department {
  id: string;
  name: string;
  color: string;
  headId: string;
  studioId: string;
}

export interface Project {
  id: string;
  name: string;
  type: string;
  progress: number;
  status: 'ON_TRACK' | 'AT_RISK' | 'BLOCKED' | 'COMPLETE';
  shotsCount: number;
  assetsCount: number;
  dueDate: string;
  startDate: string;
  thumbnail: string;
  lastActivity: string;
  studioId: string;
  description: string;
  client: string;
  budget: number;
  riskScore: number;
}

export interface Sequence {
  id: string;
  name: string;
  projectId: string;
  shotCount: number;
  status: 'complete' | 'in-progress' | 'blocked' | 'not-started';
  progress: number;
}

export interface Shot {
  id: string;
  name: string;
  projectId: string;
  sequenceId: string;
  sequence: string;
  status: 'complete' | 'in-progress' | 'blocked' | 'review' | 'not-started' | 'at-risk';
  assigneeId: string;
  updatedAt: string;
  frameRange: string;
  duration: number; // frames
  complexity: 'low' | 'medium' | 'high';
  currentVersion: string;
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'changes-requested' | 'not-submitted';
  thumbnailSeed: number;
  notes: string;
}

export interface Asset {
  id: string;
  name: string;
  projectId: string;
  type: 'Character' | 'Environment' | 'Prop' | 'Rig' | 'Effects' | 'Vehicle' | 'Texture' | 'Material' | 'Audio';
  status: 'complete' | 'in-progress' | 'blocked' | 'at-risk' | 'not-started' | 'review';
  assigneeId: string;
  updatedAt: string;
  version: string;
  tags: string[];
  thumbnailSeed: number;
  fileSize: string;
  polyCount?: string;
  dependencies: string[];
  publishStatus: 'published' | 'draft' | 'queued' | 'validating' | 'failed';
  description: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  assetId?: string;
  shotId?: string;
  assigneeId: string;
  status: 'todo' | 'in-progress' | 'blocked' | 'review' | 'complete' | 'cancelled';
  priority: 'critical' | 'high' | 'medium' | 'low';
  dueDate: string;
  estimatedHours: number;
  actualHours: number;
  tags: string[];
  dependencies: string[];
  checklist: { text: string; done: boolean }[];
  comments: { userId: string; text: string; timestamp: string }[];
  attachments: string[];
  department: string;
  createdAt: string;
}

export interface Version {
  id: string;
  entityId: string;
  entityType: 'shot' | 'asset';
  versionNumber: string;
  status: 'pending' | 'approved' | 'rejected' | 'changes-requested';
  createdById: string;
  createdAt: string;
  thumbnailSeed: number;
  notes: string;
  derivedFromId: string;
  fileSize: string;
}

export interface Review {
  id: string;
  entityId: string;
  entityType: 'shot' | 'asset';
  versionId: string;
  reviewerId: string;
  status: 'pending' | 'approved' | 'rejected' | 'changes-requested';
  comments: string;
  frame?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublishLog {
  id: string;
  assetId: string;
  version: string;
  publishedById: string;
  publishedAt: string;
  status: 'success' | 'failed' | 'validating' | 'queued';
  target: string;
  duration: string;
  fileSize: string;
  checks: { name: string; passed: boolean }[];
  log: string[];
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  triggeredBy: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  currentNode: string;
  entityId: string;
  logs: { timestamp: string; node: string; message: string; status: 'success' | 'info' | 'error' | 'warning' }[];
}

export interface Notification {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  category: 'review' | 'publishing' | 'assignment' | 'approval' | 'workflow' | 'mention' | 'system';
  priority: 'high' | 'medium' | 'low';
  entityId?: string;
  entityType?: string;
  actionUrl?: string;
}

export interface AISuggestion {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  entity: string;
  entityType: string;
  assignee: string;
  suggestedAction: string;
  impact: string;
  page: string; // which page should show this
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  dueDate: string;
  status: 'complete' | 'on-track' | 'at-risk' | 'overdue';
  progress: number;
}

export interface AuditEvent {
  id: string;
  entityId: string;
  entityType: string;
  timestamp: string;
  userId: string;
  eventType: string;
  description: string;
  changedFields: Record<string, string>;
}

export interface Plugin {
  id: string;
  name: string;
  category: string;
  rating: number;
  installs: string;
  verified: boolean;
  icon: string;
  description: string;
  author: string;
  version: string;
  compatibility: string;
  lastUpdated: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: number;
  lastEdited: string;
  trigger: string;
  runs: number;
  successRate: number;
  status: 'active' | 'draft' | 'paused';
}

// --- Data Generation Helpers -----------------------------------------------

const names = [
  'Maya Chen', 'Luca Moretti', 'Priya Nair', 'Tomasz Kowalski', 'Aisha Diallo',
  'Rafi Solomonov', 'Yuki Tanaka', 'Diego Vargas', 'Zara Ahmed', 'Ethan Brooks',
  'Mia Rodriguez', 'Kai Nakamura', 'Lena Petrov', 'Dante Costa', 'Isla MacLeod',
  'Akira Suzuki', 'Nia Okafor', 'Felix Braun', 'Sofia Reyes', 'Jin Park',
  'Amara Kone', 'Leo Fischer', 'Fatima Al-Rashid', 'Hugo Laurent', 'Chiara Rossi',
  'Ryo Watanabe', 'Elena Volkov', 'Marcus Singh', 'Hana Kim', 'Rafael Almeida',
  'Freya Johansson', 'Arjun Mehta', 'Clara Werner', 'Omar Hassan', 'Suki Yamamoto',
  'Mikhail Petrov', 'Zoe Chapman', 'Tariq Patel', 'Ingrid Olsen', 'Kofi Mensah',
  'Ava Sterling', 'Mateo Rivero', 'Nadia Ivanova', 'Soren Lindqvist', 'Ada Okonkwo',
  'Lucas Mendes', 'Sakura Ito', 'Bastian Müller', 'Leila Karimi', 'Theo Beaumont',
];

const roles = [
  'Art Director', 'Lead Animator', 'FX Artist', 'Compositor', 'Producer',
  'Pipeline TD', 'Environment Artist', 'Character Animator', 'Lighting TD',
  'Texture Artist', 'Rigger', 'Layout Artist', 'Modeler', 'Render Wrangler',
  'Concept Artist', 'Matte Painter', 'Motion Capture TD', 'Surfacing Artist',
  'Look Dev Artist', 'Crowd TD',
];

const departments = [
  'Modeling', 'Animation', 'Lighting', 'FX', 'Compositing',
  'Rigging', 'Layout', 'Look Development', 'Pipeline', 'Production',
];

// --- Studios ---------------------------------------------------------------

export const STUDIOS: Studio[] = [
  { id: 'studio1', name: 'Nebula Animation Co.', logo: '🌌', region: 'US West (Portland)', artistCount: 28, projectCount: 5 },
  { id: 'studio2', name: 'Ironforge VFX', logo: '⚒️', region: 'EU West (London)', artistCount: 15, projectCount: 3 },
  { id: 'studio3', name: 'Aurora Digital', logo: '🌅', region: 'APAC (Tokyo)', artistCount: 12, projectCount: 2 },
];

// --- Departments -----------------------------------------------------------

export const DEPARTMENTS: Department[] = departments.map((d, i) => ({
  id: `dept${i + 1}`,
  name: d,
  color: [
    '#4facfe', '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3',
    '#54a0ff', '#5f27cd', '#01a3a4', '#f368e0', '#10ac84',
  ][i],
  headId: `u${i + 1}`,
  studioId: i < 5 ? 'studio1' : i < 8 ? 'studio2' : 'studio3',
}));

// --- Users (50 Artists + 20 Reviewers overlap) ----------------------------

export const USERS: User[] = names.map((name, i) => {
  const possibleLicenses = ['Autodesk Maya', 'The Foundry Nuke', 'SideFX Houdini', 'Arnold Render', 'Substance Painter', 'ZBrush', 'Unreal Engine'];
  const userLicenses = possibleLicenses.filter(() => Math.random() > 0.5);
  if (userLicenses.length === 0) userLicenses.push(possibleLicenses[i % possibleLicenses.length]); // Ensure at least one

  return {
    id: `u${i + 1}`,
    name,
    role: roles[i % roles.length],
    department: departments[i % departments.length],
    avatar: `https://i.pravatar.cc/150?u=u${i + 1}`,
    email: `${name.split(' ')[0].toLowerCase()}@${i < 28 ? 'nebula' : i < 43 ? 'ironforge' : 'aurora'}.co`,
    studioId: i < 28 ? 'studio1' : i < 43 ? 'studio2' : 'studio3',
    capacity: 60 + Math.floor((i * 7 + 13) % 60),
    licenses: userLicenses,
  };
});

// --- Projects (10) --------------------------------------------------------

const projectData = [
  { name: 'Starfall', type: 'Animated Feature', client: 'StreamMax Studios', desc: 'Epic space opera following a young pilot discovering ancient cosmic powers.' },
  { name: 'Iron Veil', type: 'Game Cinematic', client: 'BattleForge Games', desc: 'Dark fantasy game trailer featuring massive battle sequences and dragon combat.' },
  { name: 'Nova Burst', type: 'Ad Campaign', client: 'Stellar Motors', desc: 'Luxury EV launch campaign with abstract particle effects and futuristic cityscapes.' },
  { name: 'Crimson Tide', type: 'Animated Series', client: 'NeonFlix', desc: 'Underwater thriller series set in a dystopian deep-sea colony.' },
  { name: 'Echoes', type: 'VR Experience', client: 'MindscapeVR', desc: 'Immersive narrative VR experience exploring memories through surreal environments.' },
  { name: 'Titan Rising', type: 'Feature VFX', client: 'Paramount+', desc: 'Live-action sci-fi film requiring extensive creature and environment VFX work.' },
  { name: 'Pixel Dreams', type: 'Animated Short', client: 'Internal', desc: 'Award-submission short film about an AI learning to paint in a retro pixel world.' },
  { name: 'Sandstorm', type: 'Game Cinematic', client: 'DuneCraft Interactive', desc: 'Real-time strategy game intro with massive desert battle choreography.' },
  { name: 'Crystal Realm', type: 'Theme Park', client: 'WonderWorld Parks', desc: 'Dome projection content for an immersive crystal cave theme park ride.' },
  { name: 'Midnight Sun', type: 'Animated Feature', client: 'Aurora Pictures', desc: 'Nordic folklore-inspired animated film about the eternal twilight.' },
];

export const PROJECTS: Project[] = projectData.map((p, i) => ({
  id: `p${i + 1}`,
  name: p.name,
  type: p.type,
  progress: [68, 41, 89, 55, 23, 76, 94, 33, 61, 12][i],
  status: (['ON_TRACK', 'AT_RISK', 'BLOCKED', 'ON_TRACK', 'ON_TRACK', 'AT_RISK', 'COMPLETE', 'ON_TRACK', 'AT_RISK', 'ON_TRACK'] as const)[i],
  shotsCount: [247, 62, 18, 130, 45, 189, 8, 55, 78, 310][i],
  assetsCount: [84, 31, 12, 56, 22, 67, 6, 28, 34, 92][i],
  dueDate: ['2025-03-30', '2025-02-15', '2025-01-03', '2025-06-20', '2025-08-01', '2025-04-15', '2025-01-10', '2025-05-30', '2025-07-15', '2025-12-01'][i],
  startDate: ['2024-01-15', '2024-03-01', '2024-06-15', '2024-02-01', '2024-07-01', '2024-04-01', '2024-08-01', '2024-05-15', '2024-06-01', '2024-09-01'][i],
  thumbnail: [
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
    'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)',
    'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
    'linear-gradient(135deg, #cfd9df 0%, #e2ebf0 100%)',
  ][i],
  lastActivity: ['2 hours ago', '1 day ago', '5 hours ago', '30 mins ago', '3 days ago', '1 hour ago', '1 week ago', '4 hours ago', '2 days ago', '6 hours ago'][i],
  studioId: i < 5 ? 'studio1' : i < 8 ? 'studio2' : 'studio3',
  description: p.desc,
  client: p.client,
  budget: [4200000, 1800000, 850000, 3100000, 1200000, 5500000, 180000, 1400000, 2300000, 6800000][i],
  riskScore: [32, 67, 45, 28, 15, 58, 5, 41, 52, 18][i],
}));

// --- Sequences ---------------------------------------------------------------

const seqNames = ['Opening', 'Inciting', 'Build Up', 'Confrontation', 'Climax', 'Resolution', 'Epilogue', 'Action Set Piece', 'Montage', 'Chase'];

export const SEQUENCES: Sequence[] = [];
let seqCounter = 0;
PROJECTS.forEach(proj => {
  const count = Math.min(Math.ceil(proj.shotsCount / 15), 7);
  for (let s = 0; s < count; s++) {
    seqCounter++;
    SEQUENCES.push({
      id: `seq${seqCounter}`,
      name: `SEQ_${String((s + 1) * 10).padStart(3, '0')} ${seqNames[s % seqNames.length]}`,
      projectId: proj.id,
      shotCount: Math.ceil(proj.shotsCount / count),
      status: (['complete', 'in-progress', 'blocked', 'not-started'] as const)[s % 4],
      progress: Math.max(0, proj.progress - s * 10 + (s % 3) * 15),
    });
  }
});

// --- Shots (100) -----------------------------------------------------------

const shotStatuses: Shot['status'][] = ['complete', 'in-progress', 'blocked', 'review', 'not-started', 'at-risk'];
const shotComplexities: Shot['complexity'][] = ['low', 'medium', 'high'];
const reviewStatuses: Shot['reviewStatus'][] = ['pending', 'approved', 'rejected', 'changes-requested', 'not-submitted'];

export const SHOTS: Shot[] = [];
for (let i = 0; i < 100; i++) {
  const projIdx = i < 25 ? 0 : i < 35 ? 1 : i < 40 ? 2 : i < 53 ? 3 : i < 58 ? 4 : i < 75 ? 5 : i < 78 ? 6 : i < 85 ? 7 : i < 92 ? 8 : 9;
  const proj = PROJECTS[projIdx];
  const projSeqs = SEQUENCES.filter(s => s.projectId === proj.id);
  const seq = projSeqs[i % projSeqs.length];
  const shotNum = (i % 20 + 1) * 10;

  SHOTS.push({
    id: `sh${i + 1}`,
    name: `${seq?.name.split(' ')[0] || 'SEQ_010'}_SH_${String(shotNum).padStart(3, '0')}`,
    projectId: proj.id,
    sequenceId: seq?.id || `seq1`,
    sequence: seq?.name.split(' ')[0] || 'SEQ_010',
    status: shotStatuses[i % shotStatuses.length],
    assigneeId: `u${(i % 50) + 1}`,
    updatedAt: `2024-${String(9 + (i % 3)).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    frameRange: `${1001 + i * 48}-${1001 + i * 48 + 47 + (i % 80)}`,
    duration: 48 + (i % 80),
    complexity: shotComplexities[i % 3],
    currentVersion: `v${String((i % 5) + 1).padStart(3, '0')}`,
    reviewStatus: reviewStatuses[i % 5],
    thumbnailSeed: 1000 + i,
    notes: i % 3 === 0 ? 'Waiting on upstream asset updates.' : i % 3 === 1 ? 'Looking good, minor tweaks needed.' : '',
  });
}

// --- Assets (150) ----------------------------------------------------------

const assetTypes: Asset['type'][] = ['Character', 'Environment', 'Prop', 'Rig', 'Effects', 'Vehicle', 'Texture', 'Material', 'Audio'];
const assetStatuses: Asset['status'][] = ['complete', 'in-progress', 'blocked', 'at-risk', 'not-started', 'review'];
const publishStatuses: Asset['publishStatus'][] = ['published', 'draft', 'queued', 'validating', 'failed'];

const assetNames = [
  'Hero Lyra', 'Villain Moros', 'Desert Canyons', 'Ancient Artifact', 'Lyra Rig v3',
  'Wind & Dust FX', 'Magic Blast', 'Space Station', 'Crystal Cave', 'Dragon Scale',
  'Neon City', 'Ocean Floor', 'Plasma Sword', 'Star Map', 'Void Portal',
  'Storm Clouds', 'Lava Flow', 'Ice Castle', 'Mech Suit', 'Forest Canopy',
  'Asteroid Belt', 'Moon Base', 'Alien Flora', 'Energy Shield', 'Holo Display',
  'Underwater Kelp', 'Coral Reef', 'Deep Trench', 'Sub Vehicle', 'Pressure Suit',
  'Data Stream', 'Neural Link', 'Memory Fragment', 'Dream Sequence', 'Reality Tear',
  'Battle Mech', 'War Banner', 'Siege Engine', 'Castle Walls', 'Dragon Mount',
  'Sand Dunes', 'Oasis Town', 'Caravan Wagon', 'Desert Beast', 'Sun Temple',
  'Crystal Golem', 'Light Bridge', 'Dome Ceiling', 'Water Feature', 'Ride Vehicle',
];

export const ASSETS: Asset[] = [];
for (let i = 0; i < 150; i++) {
  const projIdx = i < 40 ? 0 : i < 55 ? 1 : i < 63 ? 2 : i < 85 ? 3 : i < 95 ? 4 : i < 115 ? 5 : i < 120 ? 6 : i < 132 ? 7 : i < 142 ? 8 : 9;
  const type = assetTypes[i % assetTypes.length];
  const prefix = type === 'Character' ? 'CHAR' : type === 'Environment' ? 'ENV' : type === 'Prop' ? 'PROP' : type === 'Rig' ? 'RIG' : type === 'Effects' ? 'FX' : type === 'Vehicle' ? 'VEH' : type === 'Texture' ? 'TEX' : type === 'Material' ? 'MAT' : 'AUD';
  const baseName = assetNames[i % assetNames.length];

  ASSETS.push({
    id: `asset${i + 1}`,
    name: baseName,
    projectId: `p${projIdx + 1}`,
    type,
    status: assetStatuses[i % assetStatuses.length],
    assigneeId: `u${(i % 50) + 1}`,
    updatedAt: `2024-${String(8 + (i % 4)).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    version: `v${String((i % 12) + 1).padStart(3, '0')}`,
    tags: [
      ['hero', 'character'][i % 2],
      ['modeling', 'rigging', 'texturing', 'animation', 'fx'][i % 5],
      i % 3 === 0 ? 'priority' : i % 3 === 1 ? 'reviewed' : 'wip',
    ],
    thumbnailSeed: 2000 + i,
    fileSize: `${((i * 37 + 15) % 900 + 50).toFixed(0)} MB`,
    polyCount: type === 'Character' || type === 'Environment' || type === 'Prop' || type === 'Vehicle' ? `${((i * 13 + 5) % 500 + 10).toFixed(0)}K` : undefined,
    dependencies: i > 3 ? [`asset${(i % 4) + 1}`] : [],
    publishStatus: publishStatuses[i % publishStatuses.length],
    description: `${prefix}_${baseName.replace(/\s+/g, '_')} — ${type} asset for ${PROJECTS[projIdx].name}.`,
  });
}

// --- Tasks (300) -----------------------------------------------------------

const taskTitles = [
  'Model {entity}', 'Rig {entity}', 'Animate {entity}', 'Light {entity}', 'Composite {entity}',
  'Texture {entity}', 'FX sim for {entity}', 'Layout pass for {entity}', 'Look dev {entity}',
  'Final polish {entity}', 'Review {entity}', 'Fix feedback on {entity}', 'Optimize {entity}',
  'QC check {entity}', 'Color grade {entity}', 'Render {entity}', 'Prep delivery for {entity}',
  'Retopology {entity}', 'UV unwrap {entity}', 'Hair groom {entity}',
];

const taskStatuses: Task['status'][] = ['todo', 'in-progress', 'blocked', 'review', 'complete', 'cancelled'];
const taskPriorities: Task['priority'][] = ['critical', 'high', 'medium', 'low'];

export const TASKS: Task[] = [];
for (let i = 0; i < 300; i++) {
  const projIdx = i < 80 ? 0 : i < 120 ? 1 : i < 140 ? 2 : i < 190 ? 3 : i < 210 ? 4 : i < 250 ? 5 : i < 260 ? 6 : i < 275 ? 7 : i < 288 ? 8 : 9;
  const hasAsset = i % 3 !== 2;
  const hasShot = i % 3 !== 0;
  const assetIdx = i % ASSETS.length;
  const shotIdx = i % SHOTS.length;
  const entity = hasAsset ? ASSETS[assetIdx].name : SHOTS[shotIdx].name;
  const titleTemplate = taskTitles[i % taskTitles.length];

  TASKS.push({
    id: `t${i + 1}`,
    title: titleTemplate.replace('{entity}', entity),
    description: `Task for ${PROJECTS[projIdx].name}: ${titleTemplate.replace('{entity}', entity)}. Follow pipeline guidelines and submit for review when complete.`,
    projectId: `p${projIdx + 1}`,
    assetId: hasAsset ? ASSETS[assetIdx].id : undefined,
    shotId: hasShot ? SHOTS[shotIdx].id : undefined,
    assigneeId: `u${(i % 50) + 1}`,
    status: taskStatuses[i % taskStatuses.length],
    priority: taskPriorities[i % taskPriorities.length],
    dueDate: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    estimatedHours: [4, 8, 16, 24, 40, 80][i % 6],
    actualHours: Math.floor([4, 8, 16, 24, 40, 80][i % 6] * (i % 5) / 5),
    tags: [
      departments[i % departments.length].toLowerCase(),
      i % 4 === 0 ? 'urgent' : i % 4 === 1 ? 'blocked' : i % 4 === 2 ? 'ready' : 'waiting',
    ],
    dependencies: i > 5 && i % 3 === 0 ? [`t${i - 1}`] : [],
    checklist: [
      { text: 'Setup scene', done: i % 3 !== 2 },
      { text: 'First pass', done: i % 4 < 2 },
      { text: 'Internal review', done: i % 5 === 0 },
      { text: 'Final polish', done: i % 6 === 0 },
    ],
    comments: i % 2 === 0 ? [
      { userId: `u${(i % 10) + 1}`, text: 'Looking good, keep it up!', timestamp: '2024-09-20T10:30:00Z' },
      { userId: `u${(i % 8) + 1}`, text: 'Can we adjust the timing slightly?', timestamp: '2024-09-21T14:15:00Z' },
    ] : [],
    attachments: i % 5 === 0 ? ['reference_v1.jpg', 'notes.pdf'] : [],
    department: departments[i % departments.length],
    createdAt: `2024-${String(6 + (i % 6)).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
  });
}

// --- Versions (200) --------------------------------------------------------

export const VERSIONS: Version[] = [];
for (let i = 0; i < 200; i++) {
  const isShot = i % 2 === 0;
  const entityIdx = i % (isShot ? SHOTS.length : ASSETS.length);
  const entity = isShot ? SHOTS[entityIdx] : ASSETS[entityIdx];
  VERSIONS.push({
    id: `v${i + 1}`,
    entityId: entity.id,
    entityType: isShot ? 'shot' : 'asset',
    versionNumber: `v${String((i % 12) + 1).padStart(3, '0')}`,
    status: (['pending', 'approved', 'rejected', 'changes-requested'] as const)[i % 4],
    createdById: `u${(i % 50) + 1}`,
    createdAt: `2024-${String(7 + (i % 5)).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}T${String(8 + (i % 12)).padStart(2, '0')}:00:00Z`,
    thumbnailSeed: 3000 + i,
    notes: i % 3 === 0 ? 'Updated per review notes.' : i % 3 === 1 ? 'Initial submission.' : 'Reworked based on feedback.',
    derivedFromId: i > 0 ? `v${i}` : '',
    fileSize: `${((i * 23 + 10) % 500 + 20).toFixed(0)} MB`,
  });
}

// --- Reviews (80) ----------------------------------------------------------

export const REVIEWS: Review[] = [];
for (let i = 0; i < 80; i++) {
  const version = VERSIONS[i % VERSIONS.length];
  REVIEWS.push({
    id: `rev${i + 1}`,
    entityId: version.entityId,
    entityType: version.entityType,
    versionId: version.id,
    reviewerId: `u${(i % 20) + 1}`,
    status: (['pending', 'approved', 'rejected', 'changes-requested'] as const)[i % 4],
    comments: [
      'Looks great, approved!',
      'The rim lighting needs adjustment on frame 45-60.',
      'Overall good but the timing feels off in the second half.',
      'Perfect execution. Ship it!',
      'Please fix the intersection artifact at the edge.',
    ][i % 5],
    frame: i % 3 === 0 ? 45 + i : undefined,
    createdAt: `2024-09-${String((i % 28) + 1).padStart(2, '0')}T${String(9 + (i % 10)).padStart(2, '0')}:00:00Z`,
    updatedAt: `2024-09-${String((i % 28) + 1).padStart(2, '0')}T${String(10 + (i % 10)).padStart(2, '0')}:00:00Z`,
  });
}

// --- Publish Logs (40) -----------------------------------------------------

export const PUBLISH_LOGS: PublishLog[] = [];
for (let i = 0; i < 40; i++) {
  const asset = ASSETS[i % ASSETS.length];
  PUBLISH_LOGS.push({
    id: `pub${i + 1}`,
    assetId: asset.id,
    version: asset.version,
    publishedById: `u${(i % 20) + 1}`,
    publishedAt: `2024-09-${String((i % 28) + 1).padStart(2, '0')}T${String(8 + (i % 14)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
    status: (['success', 'failed', 'validating', 'queued'] as const)[i % 4],
    target: ['production', 'staging', 'archive', 'client-delivery'][i % 4],
    duration: `${(i % 5) + 1}m ${(i * 7) % 60}s`,
    fileSize: asset.fileSize,
    checks: [
      { name: 'Geometry Validation', passed: i % 5 !== 3 },
      { name: 'Texture Resolution', passed: i % 7 !== 4 },
      { name: 'Naming Convention', passed: true },
      { name: 'Dependencies Resolved', passed: i % 3 !== 2 },
      { name: 'File Size Limit', passed: i % 8 !== 5 },
    ],
    log: [
      `[${String(8 + (i % 14)).padStart(2, '0')}:00] Starting publish pipeline...`,
      `[${String(8 + (i % 14)).padStart(2, '0')}:01] Running validation checks...`,
      `[${String(8 + (i % 14)).padStart(2, '0')}:02] ${i % 4 === 1 ? 'ERROR: Geometry validation failed' : 'All checks passed'}`,
      `[${String(8 + (i % 14)).padStart(2, '0')}:03] ${i % 4 === 1 ? 'Publish aborted' : 'Publishing to ' + ['production', 'staging', 'archive', 'client-delivery'][i % 4]}...`,
      `[${String(8 + (i % 14)).padStart(2, '0')}:04] ${i % 4 === 1 ? '' : 'Publish complete. Notifying downstream.'}`,
    ].filter(Boolean),
  });
}

// --- Workflow Runs (25) ----------------------------------------------------

export const WORKFLOWS: Workflow[] = [
  { id: 'wf1', name: 'Review → Approve → Publish', description: 'Standard review loop with auto-publish on approval', nodes: 4, lastEdited: '2 days ago', trigger: 'New Version', runs: 342, successRate: 94, status: 'active' },
  { id: 'wf2', name: 'Shot Delivery Pipeline', description: 'Export, transcode, and upload to client', nodes: 6, lastEdited: '1 week ago', trigger: 'Status Change', runs: 128, successRate: 89, status: 'active' },
  { id: 'wf3', name: 'Asset QC Check', description: 'Automated geometry and texture validation', nodes: 3, lastEdited: '3 weeks ago', trigger: 'Publish', runs: 567, successRate: 97, status: 'active' },
  { id: 'wf4', name: 'Client Preview Loop', description: 'Watermark and send to client portal', nodes: 5, lastEdited: '1 month ago', trigger: 'Manual', runs: 45, successRate: 100, status: 'active' },
  { id: 'wf5', name: 'Emergency Hotfix', description: 'Bypass standard gates for critical fixes', nodes: 2, lastEdited: '2 months ago', trigger: 'Manual', runs: 12, successRate: 83, status: 'draft' },
  { id: 'wf6', name: 'New Project Onboarding', description: 'Create folders, set permissions, invite team', nodes: 8, lastEdited: '3 months ago', trigger: 'New Project', runs: 10, successRate: 100, status: 'active' },
  { id: 'wf7', name: 'Nightly Render Farm Submit', description: 'Batch submit all pending renders at midnight', nodes: 5, lastEdited: '5 days ago', trigger: 'Schedule', runs: 89, successRate: 91, status: 'active' },
  { id: 'wf8', name: 'Cross-Department Handoff', description: 'Notify next department when work completes', nodes: 4, lastEdited: '2 weeks ago', trigger: 'Status Change', runs: 234, successRate: 96, status: 'active' },
];

export const WORKFLOW_RUNS: WorkflowRun[] = [];
for (let i = 0; i < 25; i++) {
  const wf = WORKFLOWS[i % WORKFLOWS.length];
  WORKFLOW_RUNS.push({
    id: `wr${i + 1}`,
    workflowId: wf.id,
    triggeredBy: `u${(i % 20) + 1}`,
    startedAt: `2024-09-${String((i % 28) + 1).padStart(2, '0')}T${String(8 + (i % 14)).padStart(2, '0')}:00:00Z`,
    completedAt: i % 3 !== 0 ? `2024-09-${String((i % 28) + 1).padStart(2, '0')}T${String(9 + (i % 14)).padStart(2, '0')}:00:00Z` : undefined,
    status: (['running', 'completed', 'failed', 'completed', 'completed'] as const)[i % 5],
    currentNode: i % 3 === 0 ? 'Review Gate' : 'Done',
    entityId: `asset${(i % 40) + 1}`,
    logs: [
      { timestamp: '09:00:00', node: 'Trigger', message: `Workflow started by ${USERS[(i % 20)].name}`, status: 'info' as const },
      { timestamp: '09:00:05', node: 'Action', message: 'Notified reviewers', status: 'success' as const },
      { timestamp: '09:02:30', node: 'Review Gate', message: i % 5 === 2 ? 'Review rejected by reviewer' : 'Review approved', status: i % 5 === 2 ? 'error' as const : 'success' as const },
      ...(i % 5 !== 2 ? [{ timestamp: '09:03:00', node: 'Publish', message: 'Asset published to production', status: 'success' as const }] : []),
    ],
  });
}

// --- Audit Events -----------------------------------------------------------

export const AUDIT_EVENTS: AuditEvent[] = [];
const eventTypes = ['created', 'status_changed', 'assignee_set', 'version_submitted', 'version_approved', 'version_rejected', 'published', 'linked_to_shot', 'downstream_notified', 'comment_added', 'priority_changed', 'dependency_added'];

for (let i = 0; i < 100; i++) {
  const isAsset = i % 2 === 0;
  const num = (i % 40) + 1;
  const entityId = isAsset ? `ast_${String(num).padStart(3, '0')}` : `sh_${String(num).padStart(3, '0')}`;

  AUDIT_EVENTS.push({
    id: `e${i + 1}`,
    entityId,
    entityType: isAsset ? 'asset' : 'shot',
    timestamp: `2024-${String(7 + (i % 5)).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')} ${String(8 + (i % 14)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`,
    userId: `u${(i % 50) + 1}`,
    eventType: eventTypes[i % eventTypes.length],
    description: [
      `Created ${i % 2 === 0 ? 'asset' : 'shot'} entity`,
      `Status changed to ${['in-progress', 'review', 'complete', 'blocked'][i % 4]}`,
      `Assigned to ${USERS[(i + 3) % USERS.length].name}`,
      `Submitted version v${String((i % 12) + 1).padStart(3, '0')}`,
      `Approved version v${String((i % 12) + 1).padStart(3, '0')}`,
      `Rejected version — needs revisions`,
      `Published to production`,
      `Linked to shot SEQ_${String(((i % 5) + 1) * 10).padStart(3, '0')}`,
      `Notified ${(i % 5) + 2} downstream artists`,
      `Comment added by ${USERS[i % USERS.length].name}`,
      `Priority changed to ${['critical', 'high', 'medium', 'low'][i % 4]}`,
      `Dependency added: ${i % 2 === 0 ? `asset${(i % 20) + 1}` : `sh${(i % 30) + 1}`}`,
    ][i % eventTypes.length],
    changedFields: {},
  });
}

// --- Notifications (50) ---------------------------------------------------

export const NOTIFICATIONS: Notification[] = [];
const notifTemplates: { title: string; desc: string; cat: Notification['category']; pri: Notification['priority'] }[] = [
  { title: 'Task Assigned', desc: 'You were assigned to "{task}"', cat: 'assignment', pri: 'medium' },
  { title: 'Version Approved', desc: '{user} approved {version}', cat: 'approval', pri: 'low' },
  { title: 'Dependency Blocked', desc: '{asset} is blocked, affecting your task', cat: 'workflow', pri: 'high' },
  { title: 'Review Requested', desc: '{user} requested your review on {entity}', cat: 'review', pri: 'high' },
  { title: 'Publish Complete', desc: '{asset} published to production', cat: 'publishing', pri: 'low' },
  { title: 'Mentioned in Comment', desc: '{user} mentioned you in {entity}', cat: 'mention', pri: 'medium' },
  { title: 'Workflow Failed', desc: 'Workflow "{workflow}" failed at step 3', cat: 'workflow', pri: 'high' },
  { title: 'Deadline Approaching', desc: '{task} is due in 2 days', cat: 'system', pri: 'medium' },
  { title: 'Changes Requested', desc: '{user} requested changes on {version}', cat: 'review', pri: 'high' },
  { title: 'New Team Member', desc: '{user} joined the project', cat: 'system', pri: 'low' },
];

for (let i = 0; i < 50; i++) {
  const tmpl = notifTemplates[i % notifTemplates.length];
  const user = USERS[(i * 3) % USERS.length];
  const task = TASKS[(i * 7) % TASKS.length];
  const asset = ASSETS[(i * 5) % ASSETS.length];

  NOTIFICATIONS.push({
    id: `n${i + 1}`,
    title: tmpl.title,
    description: tmpl.desc
      .replace('{user}', user.name)
      .replace('{task}', task.title)
      .replace('{asset}', asset.name)
      .replace('{entity}', asset.name)
      .replace('{version}', `v${String((i % 12) + 1).padStart(3, '0')}`)
      .replace('{workflow}', WORKFLOWS[i % WORKFLOWS.length].name),
    timestamp: [
      '2 mins ago', '10 mins ago', '30 mins ago', '1 hour ago', '2 hours ago',
      '3 hours ago', '5 hours ago', '1 day ago', '2 days ago', '3 days ago',
    ][i % 10],
    read: i > 15,
    category: tmpl.cat,
    priority: tmpl.pri,
    entityId: i % 2 === 0 ? asset.id : task.id,
    entityType: i % 2 === 0 ? 'asset' : 'task',
  });
}

// --- AI Suggestions (30) ---------------------------------------------------

export const AI_SUGGESTIONS: AISuggestion[] = [
  { id: 'ai1', severity: 'CRITICAL', title: 'Capacity Overload: Yuki Tanaka at 119%', description: 'ENV_SpaceStation is a dependency for 7 shots in SEQ_030. If this slips 3+ days, critical path extends by 11 days.', entity: 'ENV_SpaceStation', entityType: 'asset', assignee: 'Yuki Tanaka', suggestedAction: 'Reassign 2 tasks to available environment artists', impact: '7 shots, 3 sequences affected', page: 'dashboard' },
  { id: 'ai2', severity: 'CRITICAL', title: 'Review Bottleneck: 12 reviews pending > 48h', description: 'Review queue has 12 items pending more than 48 hours. Average review time has increased 3x this sprint.', entity: 'Review Queue', entityType: 'review', assignee: 'Maya Chen', suggestedAction: 'Schedule dedicated review sessions', impact: 'Pipeline throughput reduced by 40%', page: 'dashboard' },
  { id: 'ai3', severity: 'HIGH', title: 'Velocity Drop: Iron Veil camera animation', description: 'Review cycle averaging 2.8 rounds/shot vs studio avg 1.4. P50=Nov 3, P80=Nov 9, P95=Nov 14.', entity: 'Iron Veil', entityType: 'project', assignee: 'Diego Vargas', suggestedAction: 'Add reviewer checkpoint at 50% completion', impact: 'Project delivery may slip 2 weeks', page: 'scheduling' },
  { id: 'ai4', severity: 'HIGH', title: 'Missing Dependencies: FX_MagicBlast', description: '3 downstream tasks blocked. Current velocity 40% below required pace.', entity: 'FX_MagicBlast', entityType: 'asset', assignee: 'Priya Nair', suggestedAction: 'Escalate to department lead', impact: '3 tasks, 5 shots affected', page: 'dashboard' },
  { id: 'ai5', severity: 'MEDIUM', title: 'Storage Warning: 85% capacity', description: 'Studio storage at 85%. At current rate, will reach 95% in 12 days.', entity: 'Storage', entityType: 'system', assignee: 'Rafi Solomonov', suggestedAction: 'Archive completed project renders', impact: 'Pipeline may halt if storage full', page: 'dashboard' },
  { id: 'ai6', severity: 'MEDIUM', title: 'Publish Conflict: Lyra Rig versions', description: 'Two versions of Lyra Rig submitted for publishing within 1 hour. Potential overwrite risk.', entity: 'Lyra Rig v3', entityType: 'asset', assignee: 'Luca Moretti', suggestedAction: 'Review and resolve version conflict', impact: '4 dependent animations may use wrong rig', page: 'publishing' },
  { id: 'ai7', severity: 'LOW', title: 'Optimization: Unused assets detected', description: '8 assets in Starfall have no shot references and no active tasks.', entity: 'Starfall', entityType: 'project', assignee: 'Aisha Diallo', suggestedAction: 'Review and archive unused assets', impact: 'Storage savings ~2.3 GB', page: 'assets' },
  { id: 'ai8', severity: 'HIGH', title: 'Critical Path Risk: SEQ_030 Climax', description: 'Sequence has 5 blocked shots with cascading dependencies. Estimated delay: 8 business days.', entity: 'SEQ_030', entityType: 'sequence', assignee: 'Production Team', suggestedAction: 'Reassign blocked tasks and add overtime budget', impact: 'Project milestone at risk', page: 'scheduling' },
  { id: 'ai9', severity: 'MEDIUM', title: 'Review Overdue: Moros walk cycle', description: 'Task has been in review status for 5 days without action.', entity: 'Moros Walk Cycle', entityType: 'task', assignee: 'Maya Chen', suggestedAction: 'Send review reminder', impact: 'Blocks 2 downstream animation tasks', page: 'tasks' },
  { id: 'ai10', severity: 'CRITICAL', title: 'Render Farm Queue Overflow', description: '340 render jobs queued, average wait time 6.2 hours (normal: 1.5h). 3 nodes offline.', entity: 'Render Farm', entityType: 'system', assignee: 'Rafi Solomonov', suggestedAction: 'Restart offline nodes, prioritize critical path renders', impact: 'All departments affected', page: 'dashboard' },
];

// Add more AI suggestions for specific pages
for (let i = 0; i < 20; i++) {
  AI_SUGGESTIONS.push({
    id: `ai${11 + i}`,
    severity: (['HIGH', 'MEDIUM', 'LOW', 'MEDIUM'] as const)[i % 4],
    title: [
      'Task dependency chain detected',
      'Potential scheduling conflict',
      'Asset version mismatch',
      'Workflow optimization available',
      'Resource rebalancing opportunity',
    ][i % 5],
    description: `Automated analysis detected an optimization opportunity in ${PROJECTS[i % PROJECTS.length].name}.`,
    entity: PROJECTS[i % PROJECTS.length].name,
    entityType: 'project',
    assignee: USERS[i % USERS.length].name,
    suggestedAction: 'Review suggested changes',
    impact: 'Minor efficiency improvement',
    page: ['dashboard', 'scheduling', 'assets', 'tasks', 'publishing'][i % 5],
  });
}

// --- AI Recommendations (legacy compat) ------------------------------------

export const AI_RECOMMENDATIONS = AI_SUGGESTIONS.filter(s => s.page === 'dashboard' || s.page === 'scheduling').slice(0, 5).map(s => ({
  id: s.id,
  severity: s.severity,
  title: s.description,
  entity: s.entity,
  assignee: s.assignee,
}));

// --- Scheduling Capacity ---------------------------------------------------

export const SCHEDULING_CAPACITY = USERS.slice(0, 20).map((user, i) => ({
  userId: user.id,
  weeks: [
    60 + (i * 7 + 13) % 60,
    65 + (i * 11 + 7) % 55,
    70 + (i * 5 + 19) % 50,
    55 + (i * 13 + 3) % 65,
    60 + (i * 9 + 11) % 55,
    70 + (i * 3 + 17) % 50,
    65 + (i * 8 + 23) % 55,
    75 + (i * 6 + 9) % 45,
  ],
}));

// --- Milestones -----------------------------------------------------------

export const MILESTONES: Milestone[] = [];
const msNames = ['Concept Lock', 'Asset Complete', 'Animation Lock', 'Lighting Complete', 'Final Comp', 'Client Delivery', 'Internal Review', 'Sound Design Lock'];
PROJECTS.forEach((proj, pi) => {
  for (let m = 0; m < 4; m++) {
    MILESTONES.push({
      id: `ms${pi * 4 + m + 1}`,
      projectId: proj.id,
      name: msNames[m % msNames.length],
      dueDate: `2025-${String((m * 2 + pi % 6) + 1).padStart(2, '0')}-${String((m * 5 + 10) % 28 + 1).padStart(2, '0')}`,
      status: (['complete', 'on-track', 'at-risk', 'overdue'] as const)[m % 4],
      progress: [100, 75, 45, 20][m % 4],
    });
  }
});

// --- Plugins ---------------------------------------------------------------

export const PLUGINS: Plugin[] = [
  { id: 'pl1', name: 'AI Auto-Layout', category: 'Pipeline', rating: 4.8, installs: '2.3k', verified: true, icon: 'Zap', description: 'Automatically arranges shots in optimal sequence based on camera flow analysis.', author: 'Forge Labs', version: '2.1.0', compatibility: 'Forge 3.0+', lastUpdated: '2 weeks ago' },
  { id: 'pl2', name: 'BulkRender Submit', category: 'Render', rating: 4.5, installs: '8.1k', verified: true, icon: 'Package', description: 'Batch submit render jobs across multiple farm providers.', author: 'RenderStack', version: '5.3.1', compatibility: 'Forge 2.5+', lastUpdated: '1 month ago' },
  { id: 'pl3', name: 'ShotGrid Sync', category: 'Integration', rating: 4.2, installs: '5.9k', verified: true, icon: 'Link', description: 'Bidirectional sync with Autodesk ShotGrid for hybrid pipelines.', author: 'PipelineBridge', version: '3.0.0', compatibility: 'Forge 3.0+', lastUpdated: '3 weeks ago' },
  { id: 'pl4', name: 'Deadline Monitor', category: 'Monitoring', rating: 4.7, installs: '3.4k', verified: true, icon: 'Activity', description: 'Real-time monitoring dashboard for Thinkbox Deadline render farm.', author: 'FarmWatch', version: '1.8.2', compatibility: 'Forge 2.0+', lastUpdated: '1 week ago' },
  { id: 'pl5', name: 'QuickNote Overlay', category: 'Annotation', rating: 4.0, installs: '1.2k', verified: true, icon: 'PenTool', description: 'Quick annotation overlay for review sessions with Apple Pencil support.', author: 'SketchTools', version: '2.0.0', compatibility: 'Forge 3.0+', lastUpdated: '2 months ago' },
  { id: 'pl6', name: 'BetaColorProfile', category: 'Color', rating: 3.1, installs: '421', verified: false, icon: 'Palette', description: 'ACES and OCIO color profile management. Beta — use at own risk.', author: 'ColorLab', version: '0.9.3', compatibility: 'Forge 2.5+', lastUpdated: '3 months ago' },
  { id: 'pl7', name: 'KitsuBridge', category: 'Integration', rating: 4.6, installs: '6.7k', verified: true, icon: 'Link2', description: 'Sync with Kitsu production tracking for teams using both tools.', author: 'CGWire', version: '4.1.0', compatibility: 'Forge 2.0+', lastUpdated: '2 weeks ago' },
  { id: 'pl8', name: 'TimelapseCapture', category: 'Tools', rating: 3.8, installs: '987', verified: false, icon: 'Camera', description: 'Capture work-in-progress timelapses for social media and presentations.', author: 'ArtDoc', version: '1.2.0', compatibility: 'Forge 2.5+', lastUpdated: '6 weeks ago' },
  { id: 'pl9', name: 'Smart Dependencies', category: 'Pipeline', rating: 4.9, installs: '4.2k', verified: true, icon: 'GitFork', description: 'AI-powered dependency detection and management across your pipeline.', author: 'Forge Labs', version: '1.5.0', compatibility: 'Forge 3.0+', lastUpdated: '1 week ago' },
  { id: 'pl10', name: 'Client Portal', category: 'Integration', rating: 4.4, installs: '3.1k', verified: true, icon: 'Globe', description: 'White-label client review portal with watermarking and approval workflows.', author: 'ClientView', version: '3.2.0', compatibility: 'Forge 2.5+', lastUpdated: '3 weeks ago' },
  { id: 'pl11', name: 'Nuke Connector', category: 'Integration', rating: 4.7, installs: '7.8k', verified: true, icon: 'Plug', description: 'Direct integration with Foundry Nuke for comp workflows.', author: 'NukeTools', version: '6.0.1', compatibility: 'Forge 2.0+', lastUpdated: '2 weeks ago' },
  { id: 'pl12', name: 'Budget Tracker', category: 'Production', rating: 4.3, installs: '1.8k', verified: true, icon: 'DollarSign', description: 'Track project budgets, burn rates, and financial forecasts.', author: 'ProdFinance', version: '2.4.0', compatibility: 'Forge 3.0+', lastUpdated: '1 month ago' },
];

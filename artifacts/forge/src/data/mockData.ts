// ============================================================================
// FORGE — Mock Data v2.0
// 18 Departments · 81 Artists · 10 Projects · 150 Assets · 100 Shots · 300 Tasks
// Real VFX Studio Hierarchy: Producer → PM → Supervisor → Lead → Artist
// ============================================================================

// --- Types -------------------------------------------------------------------

export type Role =
  | "admin"
  | "production_head"
  | "producer"
  | "lead"
  | "artist"
  | "client";

export const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 5,
  production_head: 4,
  producer: 3,
  lead: 2,
  artist: 1,
  client: 0,
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "System Admin",
  production_head: "Production Head",
  producer: "Producer",
  lead: "Lead",
  artist: "Artist",
  client: "Client",
};

export function canAssignTo(assignerRole: Role, assigneeRole: Role): boolean {
  return ROLE_HIERARCHY[assignerRole] > ROLE_HIERARCHY[assigneeRole];
}

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
  empId: string;
  name: string;
  role: Role;
  title: string;
  departmentId: string;
  avatar: string;
  email: string;
  studioId: string;
  capacity: number;
  licenses: string[];
  supervisorId?: string;
  startDate: string;
  status: "active" | "away" | "on-leave";
  skills: string[];
  password: string; // For login simulation
  capabilities?: string[]; // Array of RBAC capability IDs
  punchedInAt?: string | null; // Real backend punch-clock state (users.punched_in_at); undefined for generated mock rows
}

export interface Department {
  id: string;
  name: string;
  abbreviation: string;
  color: string;
  supervisorId: string;
  leadId: string;
  studioId: string;
  description: string;
  icon: string;
  pipelineOrder: number;
  pipeline?: "PROD" | "3D" | "VFX" | "2D";
}

export interface Project {
  id: string;
  name: string;
  type: string;
  progress: number;
  status: "ON_TRACK" | "AT_RISK" | "BOTTLENECK" | "COMPLETE";
  shotsCount: number;
  assetsCount: number;
  dueDate: string;
  startDate: string;
  /** Real API field name for the project end date (unlike dueDate above, which the real backend never populates). */
  endDate?: string;
  thumbnail: string;
  lastActivity: string;
  studioId: string;
  description: string;
  client: string;
  budget: number;
  riskScore: number;
}

export interface Episode {
  id: string;
  name: string;
  projectId: string;
  status: "complete" | "in-progress" | "bottleneck" | "not-started";
  progress: number;
  dueDate: string;
}

export interface Sequence {
  id: string;
  name: string;
  projectId: string;
  episodeId?: string;
  shotCount: number;
  status: "complete" | "in-progress" | "bottleneck" | "not-started";
  progress: number;
}

export interface Shot {
  id: string;
  name: string;
  projectId: string;
  episodeId: string;
  sequenceId: string;
  sequence: string;
  status:
    | "complete"
    | "in-progress"
    | "bottleneck"
    | "review"
    | "not-started"
    | "at-risk"
    | "client-review"
    | "approved"
    | "published";
  assigneeId: string;
  updatedAt: string;
  frameRange: string;
  duration: number;
  complexity: "low" | "medium" | "high";
  currentVersion: string;
  usdVersion?: string; // Universal Scene Description tracking
  internalReviewStatus:
    "pending" | "approved" | "rejected" | "changes-requested" | "not-submitted";
  reviewStatus?: string;
  clientReviewStatus:
    "pending" | "approved" | "rejected" | "changes-requested" | "not-submitted";
  thumbnailSeed: number;
  thumbnail?: string;
  notes: string;
}

export interface Asset {
  id: string;
  name: string;
  projectId: string;
  episodeId?: string;
  sequenceId?: string;
  type:
    | "Character"
    | "Environment"
    | "Prop"
    | "Rig"
    | "Effects"
    | "Vehicle"
    | "Texture"
    | "Material"
    | "Audio";
  status:
    | "complete"
    | "in-progress"
    | "bottleneck"
    | "at-risk"
    | "not-started"
    | "review";
  assigneeId: string;
  updatedAt: string;
  version: string;
  usdVersion?: string; // Universal Scene Description tracking
  tags: string[];
  thumbnailSeed: number;
  fileSize: string;
  polyCount?: string;
  dependencies: string[];
  publishStatus: "published" | "draft" | "queued" | "validating" | "failed";
  description: string;
  /** Freeform notes a team member has attached to this asset, editable from the Assets tab. */
  notes?: string;
}

export interface DailyLog {
  date: string;
  hours: number;
  note: string;
  userId: string;
}

/**
 * One step in a task's approval chain (Artist -> Lead/Supervisor). Unlike a
 * single `status` field, this is a real, growing
 * audit trail: every submit/approve/reject/changes-requested action along the
 * chain is appended here and persisted with the task, so the full history of
 * who moved a version through review — and when — survives reload/navigation.
 */
export interface ApprovalEvent {
  id: string;
  action:
    | "submitted-for-lead-review"
    | "submitted-for-manager-review"
    | "approved"
    | "changes-requested"
    | "rejected"
    | "published";
  byUserId: string;
  byUserName: string;
  byRole: Role;
  timestamp: string;
}

export type TaskStatus =
  | "todo"
  | "not-started"
  | "in-progress"
  | "bottleneck"
  | "review"
  | "lead-review"
  | "pm-review"
  | "approved"
  | "complete"
  | "cancelled"
  // Catch-all for a status string this app doesn't otherwise recognize --
  // real tracksheet imports carry a studio's own pipeline-stage vocabulary
  // (e.g. "TK_01_APP", "WFF", "Client_App") that doesn't map onto any of
  // the stages above. Never written by this app itself except when a user
  // explicitly drags a card into the Kanban's "Other" column.
  | "other";

// Shared status classification so every page's "active"/"done" task rollups agree with each
// other. Previously each page (departments overview, department detail, tracking grid) rolled
// its own ad-hoc status check — e.g. one page counted only 'in-progress' as active and only
// 'approved' as done, another added lead/manager review to active, and the tracking grid
// correctly treated 'complete' and 'approved' both as done — so the same department showed
// different active/done counts on different pages even with identical underlying task data.
export function isTaskDone(status: TaskStatus): boolean {
  return status === "approved" || status === "complete";
}
export function isTaskActive(status: TaskStatus): boolean {
  return !isTaskDone(status) && status !== "cancelled";
}

// Dependency link type, ftrack-style: how this task's schedule relates to the task it depends on.
//  - FS (Finish-to-Start): dependency must finish before this task can start (default, most common)
//  - SS (Start-to-Start): dependency must start before this task can start
//  - FF (Finish-to-Finish): dependency must finish before this task can finish
//  - SF (Start-to-Finish): dependency must start before this task can finish (rare)
export type DependencyType = "FS" | "SS" | "FF" | "SF";

export const DEPENDENCY_TYPE_LABELS: Record<DependencyType, string> = {
  FS: "Finish → Start",
  SS: "Start → Start",
  FF: "Finish → Finish",
  SF: "Start → Finish",
};

export interface TaskDependency {
  taskId: string;
  type: DependencyType;
  /** Optional lag/lead time in days applied after the relationship is satisfied. */
  lagDays?: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  assetId?: string;
  shotId?: string;
  assigneeId: string;
  assignedById: string;
  status: TaskStatus;
  priority: "critical" | "high" | "medium" | "low";
  dueDate: string;
  estimatedHours: number;
  actualHours: number;
  tags: string[];
  dependencies: TaskDependency[];
  checklist: { text: string; done: boolean }[];
  comments: { userId: string; text: string; timestamp: string }[];
  attachments: string[];
  department: string;
  createdAt: string;
  lastStatusUpdate: string;
  dailyLogs: DailyLog[];
  weeklyRating?: "on-track" | "at-risk" | "behind";
  pipelinePhase: string;
  /** Full history of Lead/Supervisor -> Producer approval-chain actions on this task. */
  approvalHistory: ApprovalEvent[];
}

export interface Version {
  id: string;
  entityId: string;
  entityType: "shot" | "asset";
  versionNumber: string;
  status: "pending" | "approved" | "rejected" | "changes-requested";
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
  entityType: "shot" | "asset";
  versionId: string;
  reviewerId: string;
  status: "pending" | "approved" | "rejected" | "changes-requested";
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
  status: "success" | "failed" | "validating" | "queued";
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
  status: "running" | "completed" | "failed" | "paused";
  currentNode: string;
  entityId: string;
  logs: {
    timestamp: string;
    node: string;
    message: string;
    status: "success" | "info" | "error" | "warning";
  }[];
}

export interface Notification {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  category:
    | "review"
    | "publishing"
    | "assignment"
    | "approval"
    | "workflow"
    | "mention"
    | "system"
    | "handoff";
  priority: "high" | "medium" | "low";
  entityId?: string;
  entityType?: string;
  actionUrl?: string;
}

export interface AISuggestion {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  entity: string;
  entityType: string;
  assignee: string;
  suggestedAction: string;
  impact: string;
  page: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  dueDate: string;
  status: "complete" | "on-track" | "at-risk" | "overdue";
  progress: number;
}

export interface AuditEvent {
  id: string;
  entityId: string;
  entityType: "asset" | "shot";
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
  pipeline?: string;
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
  status: "active" | "draft" | "paused";
}

export interface ChatMessage {
  id: string;
  departmentId: string;
  userId: string;
  text: string;
  attachments: {
    id: string;
    type: "image" | "video" | "file";
    url: string;
    name: string;
  }[];
  timestamp: string;
}

// --- Studios ---------------------------------------------------------------

export const STUDIOS: Studio[] = [
  {
    id: "studio1",
    name: "Nebula Animation Co.",
    logo: "🌌",
    region: "US West (Portland)",
    artistCount: 45,
    projectCount: 5,
  },
  {
    id: "studio2",
    name: "Ironforge VFX",
    logo: "⚒️",
    region: "EU West (London)",
    artistCount: 15,
    projectCount: 3,
  },
  {
    id: "studio3",
    name: "Aurora Digital",
    logo: "🌅",
    region: "APAC (Tokyo)",
    artistCount: 12,
    projectCount: 2,
  },
];

// --- Departments (14: 13 VFX + Production Management) ----------------------

const DEPT_DEFINITIONS = [
  {
    name: "Production Management",
    abbr: "PROD",
    color: "#636e72",
    icon: "Briefcase",
    desc: "Handles scheduling, budgets, and client communication.",
    order: 0,
    pipeline: "PROD",
  },
  // 3D Pipeline
  {
    name: "Modeling",
    abbr: "MDL",
    color: "#4facfe",
    icon: "Box",
    desc: "Building 3D digital shapes and models.",
    order: 1,
    pipeline: "3D",
  },
  {
    name: "Texturing / LookDev",
    abbr: "TEX",
    color: "#a55eea",
    icon: "Paintbrush",
    desc: "Painting surfaces and creating materials.",
    order: 2,
    pipeline: "3D",
  },
  {
    name: "Rigging",
    abbr: "RIG",
    color: "#4ecdc4",
    icon: "Bone",
    desc: "Building digital skeletons for 3D models.",
    order: 3,
    pipeline: "3D",
  },
  {
    name: "Layout",
    abbr: "LAY",
    color: "#fdcb6e",
    icon: "Layout",
    desc: "Scene composition and camera placement.",
    order: 4,
    pipeline: "3D",
  },
  {
    name: "Animation",
    abbr: "ANIM",
    color: "#fd79a8",
    icon: "Clapperboard",
    desc: "Moving characters and objects.",
    order: 5,
    pipeline: "3D",
  },
  {
    name: "Lighting",
    abbr: "LIT",
    color: "#0984e3",
    icon: "Sun",
    desc: "Setting virtual lights.",
    order: 6,
    pipeline: "3D",
  },
  {
    name: "Rendering",
    abbr: "RND",
    color: "#dfe6e9",
    icon: "MonitorPlay",
    desc: "Generating final 3D frames.",
    order: 7,
    pipeline: "3D",
  },
  // VFX Pipeline
  {
    name: "Matchmove / Camera Tracking",
    abbr: "TRK",
    color: "#00cec9",
    icon: "Crosshair",
    desc: "Camera and object tracking.",
    order: 8,
    pipeline: "VFX",
  },
  {
    name: "Rotomation",
    abbr: "RTM",
    color: "#81ecec",
    icon: "Activity",
    desc: "Animating digital doubles to match live action.",
    order: 9,
    pipeline: "VFX",
  },
  {
    name: "Creature Effects (CFX)",
    abbr: "CFX",
    color: "#ff6b6b",
    icon: "Bug",
    desc: "Hair, cloth, muscle simulations.",
    order: 10,
    pipeline: "VFX",
  },
  {
    name: "FX Simulations",
    abbr: "FX",
    color: "#ff9f43",
    icon: "Flame",
    desc: "Particles, Destruction, Fluid, Fire/Smoke.",
    order: 11,
    pipeline: "VFX",
  },
  {
    name: "Grooming",
    abbr: "GRM",
    color: "#fab1a0",
    icon: "Scissors",
    desc: "Hair and Fur generation.",
    order: 12,
    pipeline: "VFX",
  },
  // 2D Pipeline
  {
    name: "Rotoscoping (Roto)",
    abbr: "ROTO",
    color: "#e17055",
    icon: "PenTool",
    desc: "Rotoscoping for clean plates.",
    order: 13,
    pipeline: "2D",
  },
  {
    name: "Paint / Prep",
    abbr: "PNT",
    color: "#ffeaa7",
    icon: "Brush",
    desc: "Wire Removal & Clean-up.",
    order: 14,
    pipeline: "2D",
  },
  {
    name: "Digital Matte Painting (DMP)",
    abbr: "DMP",
    color: "#00b894",
    icon: "Mountain",
    desc: "Creating photorealistic backgrounds.",
    order: 15,
    pipeline: "2D",
  },
  {
    name: "2D Animation / Motion Graphics",
    abbr: "MGFX",
    color: "#55efc4",
    icon: "Film",
    desc: "Motion graphics and 2D elements.",
    order: 16,
    pipeline: "2D",
  },
  {
    name: "Compositing",
    abbr: "COMP",
    color: "#6c5ce7",
    icon: "Layers",
    desc: "Blending all layers into the final shot.",
    order: 17,
    pipeline: "2D",
  },
];

// Dynamically generate users for each department

const firstNames = [
  "Luca",
  "Isla",
  "Jin",
  "Clara",
  "Rafi",
  "Nadia",
  "Soren",
  "Leila",
  "Yuki",
  "Hugo",
  "Ada",
  "Theo",
  "Priya",
  "Tomasz",
  "Mia",
  "Kai",
  "Dante",
  "Aisha",
  "Lena",
  "Zara",
  "Freya",
  "Lucas",
  "Diego",
  "Arjun",
  "Hana",
  "Omar",
  "Akira",
  "Nia",
  "Felix",
  "Chiara",
  "Rafael",
  "Sakura",
  "Ryo",
  "Elena",
  "Marcus",
  "Mateo",
  "Amara",
  "Leo",
  "Fatima",
  "Bastian",
  "Tariq",
  "Mikhail",
  "Zoe",
  "Ingrid",
  "Wei",
  "Chloe",
  "Arthur",
  "Saanvi",
  "Rina",
  "Jamal",
];
const lastNames = [
  "Moretti",
  "MacLeod",
  "Park",
  "Werner",
  "Solomonov",
  "Ivanova",
  "Lindqvist",
  "Karimi",
  "Tanaka",
  "Laurent",
  "Okonkwo",
  "Beaumont",
  "Nair",
  "Kowalski",
  "Rodriguez",
  "Nakamura",
  "Costa",
  "Diallo",
  "Petrov",
  "Ahmed",
  "Johansson",
  "Mendes",
  "Vargas",
  "Mehta",
  "Kim",
  "Hassan",
  "Suzuki",
  "Okafor",
  "Braun",
  "Rossi",
  "Almeida",
  "Ito",
  "Watanabe",
  "Volkov",
  "Singh",
  "Rivero",
  "Kone",
  "Fischer",
  "Al-Rashid",
  "Müller",
  "Patel",
  "Chapman",
  "Olsen",
  "Zhang",
  "Dubois",
  "Silva",
  "Gomez",
];

let nameCounter = 0;
const getName = () =>
  `${firstNames[nameCounter++ % firstNames.length]} ${lastNames[nameCounter % lastNames.length]}`;

// --- Users (81: 65 hand-authored + 16 auto-filled for the departments with no
// hand-authored team, each getting a supervisor/lead/artist/junior_artist) ---

const USER_DEFS: {
  name: string;
  role: Role;
  deptIdx: number;
  title: string;
  skills: string[];
}[] = [
  // === Clients ===
  // This was previously seeded as role: 'coordinator' — meaning the app's
  // ENTIRE "client experience" was actually running with full internal
  // coordinator/leadership permissions, and separately, no user anywhere in
  // this dataset had role: 'client' at all, so login.tsx's Client Portal
  // quick-login (USERS.find(u => u.role === 'client')) silently matched
  // nothing and did nothing when clicked. Both bugs trace back to this one
  // line — role must actually be 'client' for either to work correctly.
  {
    name: "External Client",
    role: "client",
    deptIdx: 0,
    title: "Client Reviewer",
    skills: ["Feedback", "Review"],
  },

  // === Production Management (dept 0) ===
  {
    name: "Maya Chen",
    role: "production_head",
    deptIdx: 0,
    title: "VFX Producer",
    skills: ["Budgeting", "Client Relations", "Scheduling"],
  },
  {
    name: "Ethan Brooks",
    role: "producer",
    deptIdx: 0,
    title: "VFX Production Manager",
    skills: ["Show Management", "Resource Planning", "Shotgun"],
  },
  {
    name: "Sofia Reyes",
    role: "producer",
    deptIdx: 0,
    title: "VFX Production Manager",
    skills: ["Bidding", "Scheduling", "ftrack"],
  },
  {
    name: "Kofi Mensah",
    role: "lead",
    deptIdx: 0,
    title: "Production Coordinator",
    skills: ["Dailies", "Tracking", "Communication"],
  },
  {
    name: "Ava Sterling",
    role: "lead",
    deptIdx: 0,
    title: "Production Coordinator",
    skills: ["Vendor Management", "Data Wrangling"],
  },

  // === Concept & Previs -> dept 17 '2D Animation / Motion Graphics' (closest current dept for concept/storyboard/2D previs work; there's no standalone Previs dept in the current DEPT_DEFINITIONS) ===
  {
    name: "Luca Moretti",
    role: "producer",
    deptIdx: 16,
    title: "Concept/Previs Supervisor",
    skills: ["Storyboarding", "Maya", "Unreal Engine"],
  },
  {
    name: "Isla MacLeod",
    role: "lead",
    deptIdx: 16,
    title: "Previs Lead",
    skills: ["Previs", "Layout", "Cinematography"],
  },
  {
    name: "Jin Park",
    role: "artist",
    deptIdx: 16,
    title: "Concept Artist",
    skills: ["Photoshop", "ZBrush", "Illustration"],
  },
  {
    name: "Clara Werner",
    role: "artist",
    deptIdx: 16,
    title: "Jr. Previs Artist",
    skills: ["Maya", "Storyboarding"],
  },

  // === Tracking -> dept 9 'Matchmove / Camera Tracking' ===
  {
    name: "Rafi Solomonov",
    role: "producer",
    deptIdx: 8,
    title: "Tracking Supervisor",
    skills: ["3DEqualizer", "PFTrack", "SynthEyes"],
  },
  {
    name: "Nadia Ivanova",
    role: "lead",
    deptIdx: 8,
    title: "Tracking Lead",
    skills: ["Camera Tracking", "Object Tracking", "Lidar"],
  },
  {
    name: "Soren Lindqvist",
    role: "artist",
    deptIdx: 8,
    title: "Match Move Artist",
    skills: ["3DEqualizer", "Nuke"],
  },
  {
    name: "Leila Karimi",
    role: "artist",
    deptIdx: 8,
    title: "Jr. Tracking Artist",
    skills: ["PFTrack", "Maya"],
  },

  // === Layout -> dept 5 'Layout' ===
  {
    name: "Yuki Tanaka",
    role: "producer",
    deptIdx: 4,
    title: "Layout Supervisor",
    skills: ["Maya", "Cinematography", "Previz"],
  },
  {
    name: "Hugo Laurent",
    role: "lead",
    deptIdx: 4,
    title: "Layout Lead",
    skills: ["Virtual Camera", "Maya", "Shotgun"],
  },
  {
    name: "Ada Okonkwo",
    role: "artist",
    deptIdx: 4,
    title: "Layout Artist",
    skills: ["Maya", "Camera Work"],
  },
  {
    name: "Theo Beaumont",
    role: "artist",
    deptIdx: 4,
    title: "Jr. Layout Artist",
    skills: ["Maya", "Previs"],
  },

  // === Modelling -> dept 2 'Modeling' ===
  {
    name: "Priya Nair",
    role: "producer",
    deptIdx: 1,
    title: "Modelling Supervisor",
    skills: ["ZBrush", "Maya", "Hard Surface"],
  },
  {
    name: "Tomasz Kowalski",
    role: "lead",
    deptIdx: 1,
    title: "Modelling Lead",
    skills: ["Maya", "ZBrush", "Retopology"],
  },
  {
    name: "Mia Rodriguez",
    role: "artist",
    deptIdx: 1,
    title: "Senior Modeller",
    skills: ["ZBrush", "Maya", "Substance"],
  },
  {
    name: "Kai Nakamura",
    role: "artist",
    deptIdx: 1,
    title: "Modeller",
    skills: ["Maya", "ZBrush"],
  },
  {
    name: "Dante Costa",
    role: "artist",
    deptIdx: 1,
    title: "Jr. Modeller",
    skills: ["Maya", "Blender"],
  },

  // === Texture / Surfacing -> dept 3 'Texturing / LookDev' ===
  {
    name: "Aisha Diallo",
    role: "producer",
    deptIdx: 2,
    title: "Surfacing Supervisor",
    skills: ["Substance Painter", "Mari", "Look Dev"],
  },
  {
    name: "Lena Petrov",
    role: "lead",
    deptIdx: 2,
    title: "Surfacing Lead",
    skills: ["Mari", "Substance Painter", "Arnold"],
  },
  {
    name: "Zara Ahmed",
    role: "artist",
    deptIdx: 2,
    title: "Senior Surfacing Artist",
    skills: ["Mari", "Substance", "Katana"],
  },
  {
    name: "Freya Johansson",
    role: "artist",
    deptIdx: 2,
    title: "Texture Artist",
    skills: ["Substance Painter", "Photoshop"],
  },
  {
    name: "Lucas Mendes",
    role: "artist",
    deptIdx: 2,
    title: "Jr. Texture Artist",
    skills: ["Substance Painter"],
  },

  // === Rigging -> dept 4 'Rigging' ===
  {
    name: "Diego Vargas",
    role: "producer",
    deptIdx: 3,
    title: "Rigging Supervisor",
    skills: ["Maya", "Python", "mGear"],
  },
  {
    name: "Arjun Mehta",
    role: "lead",
    deptIdx: 3,
    title: "Rigging Lead",
    skills: ["Maya", "Python", "Facial Rigs"],
  },
  {
    name: "Hana Kim",
    role: "artist",
    deptIdx: 3,
    title: "Senior Rigger",
    skills: ["Maya", "Python", "Muscle Systems"],
  },
  {
    name: "Omar Hassan",
    role: "artist",
    deptIdx: 3,
    title: "Rigger",
    skills: ["Maya", "Python"],
  },

  // === Animation -> dept 6 'Animation' ===
  {
    name: "Akira Suzuki",
    role: "producer",
    deptIdx: 5,
    title: "Animation Supervisor",
    skills: ["Maya", "Acting", "Motion Capture"],
  },
  {
    name: "Nia Okafor",
    role: "lead",
    deptIdx: 5,
    title: "Animation Lead",
    skills: ["Maya", "Character Animation", "Blocking"],
  },
  {
    name: "Felix Braun",
    role: "artist",
    deptIdx: 5,
    title: "Senior Animator",
    skills: ["Maya", "Body Mechanics", "Facial Anim"],
  },
  {
    name: "Chiara Rossi",
    role: "artist",
    deptIdx: 5,
    title: "Character Animator",
    skills: ["Maya", "Animation"],
  },
  {
    name: "Rafael Almeida",
    role: "artist",
    deptIdx: 5,
    title: "Character Animator",
    skills: ["Maya", "Creature Animation"],
  },
  {
    name: "Sakura Ito",
    role: "artist",
    deptIdx: 5,
    title: "Jr. Animator",
    skills: ["Maya"],
  },

  // === Creature FX / Tech Anim -> dept 11 'Creature Effects (CFX)' ===
  {
    name: "Ryo Watanabe",
    role: "producer",
    deptIdx: 10,
    title: "Creature FX Supervisor",
    skills: ["Houdini", "Maya", "Cloth Sim"],
  },
  {
    name: "Elena Volkov",
    role: "lead",
    deptIdx: 10,
    title: "CFX Lead",
    skills: ["Houdini", "Maya", "Hair Groom"],
  },
  {
    name: "Marcus Singh",
    role: "artist",
    deptIdx: 10,
    title: "Senior CFX Artist",
    skills: ["Houdini", "Maya", "Muscle Sim"],
  },
  {
    name: "Mateo Rivero",
    role: "artist",
    deptIdx: 10,
    title: "CFX Artist",
    skills: ["Houdini", "XGen"],
  },

  // === FX (Effects) -> dept 12 'FX Simulations' ===
  {
    name: "Amara Kone",
    role: "producer",
    deptIdx: 11,
    title: "FX Supervisor",
    skills: ["Houdini", "Maya", "Pyro"],
  },
  {
    name: "Leo Fischer",
    role: "lead",
    deptIdx: 11,
    title: "FX Lead TD",
    skills: ["Houdini", "FLIP", "Pyro"],
  },
  {
    name: "Fatima Al-Rashid",
    role: "artist",
    deptIdx: 11,
    title: "Senior FX Artist",
    skills: ["Houdini", "Destruction", "RBD"],
  },
  {
    name: "Bastian Müller",
    role: "artist",
    deptIdx: 11,
    title: "FX Artist",
    skills: ["Houdini", "Particles"],
  },
  {
    name: "Tariq Patel",
    role: "artist",
    deptIdx: 11,
    title: "Jr. FX Artist",
    skills: ["Houdini"],
  },

  // === Lighting -> dept 7 'Lighting' ===
  {
    name: "Mikhail Petrov",
    role: "producer",
    deptIdx: 6,
    title: "Lighting/CG Supervisor",
    skills: ["Katana", "Arnold", "RenderMan"],
  },
  {
    name: "Zoe Chapman",
    role: "lead",
    deptIdx: 6,
    title: "Lighting Lead",
    skills: ["Katana", "Arnold", "Color Theory"],
  },
  {
    name: "Ingrid Olsen",
    role: "artist",
    deptIdx: 6,
    title: "Senior Lighting TD",
    skills: ["Katana", "Arnold", "V-Ray"],
  },
  {
    name: "Suki Yamamoto",
    role: "artist",
    deptIdx: 6,
    title: "Lighting TD",
    skills: ["Arnold", "Maya"],
  },

  // === Compositing -> dept 18 'Compositing' ===
  {
    name: "Dante Rivera",
    role: "producer",
    deptIdx: 17,
    title: "Compositing Supervisor",
    skills: ["Nuke", "Flame", "Color Science"],
  },
  {
    name: "Lila Johannsen",
    role: "lead",
    deptIdx: 17,
    title: "Compositing Lead",
    skills: ["Nuke", "Deep Compositing", "Stereo"],
  },
  {
    name: "Chen Wei",
    role: "artist",
    deptIdx: 17,
    title: "Senior Compositor",
    skills: ["Nuke", "Flame", "CG Integration"],
  },
  {
    name: "Ananya Sharma",
    role: "artist",
    deptIdx: 17,
    title: "Compositor",
    skills: ["Nuke", "Roto"],
  },
  {
    name: "Tomoko Hayashi",
    role: "artist",
    deptIdx: 17,
    title: "Compositor",
    skills: ["Nuke", "Keying"],
  },
  {
    name: "Dylan O'Brien",
    role: "artist",
    deptIdx: 17,
    title: "Jr. Compositor",
    skills: ["Nuke"],
  },

  // === Rotopaint -> dept 14 'Rotoscoping (Roto)' ===
  {
    name: "Priscilla Mendes",
    role: "producer",
    deptIdx: 13,
    title: "Rotopaint Supervisor",
    skills: ["Nuke", "Silhouette", "Mocha"],
  },
  {
    name: "Kwame Asante",
    role: "lead",
    deptIdx: 13,
    title: "Rotopaint Lead",
    skills: ["Nuke", "Silhouette", "Paint Fixes"],
  },
  {
    name: "Mei Lin",
    role: "artist",
    deptIdx: 13,
    title: "Roto Artist",
    skills: ["Nuke", "Silhouette"],
  },
  {
    name: "Viktor Novak",
    role: "artist",
    deptIdx: 13,
    title: "Jr. Roto Artist",
    skills: ["Nuke"],
  },

  // === DMP -> dept 16 'Digital Matte Painting (DMP)' ===
  {
    name: "Gabriela Santos",
    role: "producer",
    deptIdx: 15,
    title: "DMP Supervisor",
    skills: ["Photoshop", "Nuke", "Maya"],
  },
  {
    name: "Olaf Eriksen",
    role: "lead",
    deptIdx: 15,
    title: "DMP Lead",
    skills: ["Photoshop", "Nuke 3D", "Projections"],
  },
  {
    name: "Rina Tanaka",
    role: "artist",
    deptIdx: 15,
    title: "Matte Painter",
    skills: ["Photoshop", "Nuke"],
  },
  {
    name: "Jamal Williams",
    role: "artist",
    deptIdx: 15,
    title: "Jr. Matte Painter",
    skills: ["Photoshop"],
  },
];

const possibleLicenses = [
  "Autodesk Maya",
  "The Foundry Nuke",
  "SideFX Houdini",
  "Arnold Render",
  "Substance Painter",
  "ZBrush",
  "Unreal Engine",
  "Katana",
  "Flame",
  "Silhouette",
  "PFTrack",
  "3DEqualizer",
];

// Departments that already have a hand-authored supervisor/lead/artist team above must NOT
// get a second auto-generated set here — that used to double up leadership headcount per dept.
// Only fill in the departments the hand-authored USER_DEFS block doesn't already cover.
const handAuthoredDeptIdxs = new Set(USER_DEFS.map((u) => u.deptIdx));
for (let i = 1; i < DEPT_DEFINITIONS.length; i++) {
  if (handAuthoredDeptIdxs.has(i)) continue;
  const deptName = DEPT_DEFINITIONS[i].name;
  USER_DEFS.push({
    name: getName(),
    role: "producer",
    deptIdx: i,
    title: `${deptName} Manager`,
    skills: [deptName],
  });
  USER_DEFS.push({
    name: getName(),
    role: "lead",
    deptIdx: i,
    title: `${deptName} Lead`,
    skills: [deptName],
  });
  USER_DEFS.push({
    name: getName(),
    role: "artist",
    deptIdx: i,
    title: `${deptName} Artist`,
    skills: [deptName],
  });
  USER_DEFS.push({
    name: getName(),
    role: "artist",
    deptIdx: i,
    title: `Jr. ${deptName} Artist`,
    skills: [deptName],
  });
}

// The Production Head is the top of the reporting chain (department
// producers report directly to them). Derive their id from wherever they
// actually land in USER_DEFS rather than hardcoding 'u1' / index 0 — that
// literal was the 'External Client' placeholder at index 0, not the real
// Production Head (Maya Chen), and would silently break again if USER_DEFS
// is ever reordered.
const productionHeadIdx = USER_DEFS.findIndex(
  (u) => u.role === "production_head",
);
const productionHeadId =
  productionHeadIdx >= 0 ? `u${productionHeadIdx + 1}` : "u1";

export const USERS: User[] = USER_DEFS.map((def, i) => {
  const deptId = `dept${def.deptIdx + 1}`;
  const userLicenses = possibleLicenses.filter(() => Math.random() > 0.6);
  if (userLicenses.length === 0)
    userLicenses.push(possibleLicenses[i % possibleLicenses.length]);

  // Determine reporting chain: artists report to their dept's lead, leads
  // report to their dept's producer, and producers report to the studio's
  // Production Head. Dept 0 (Production Management) has its own
  // producer/lead pair too (ex Production Manager / Coordinator) and its
  // producer(s) also report up to the Production Head.
  let supervisorId: string | undefined;
  if (def.role === "artist") {
    const lead = USER_DEFS.findIndex(
      (u) => u.deptIdx === def.deptIdx && u.role === "lead",
    );
    supervisorId = lead >= 0 ? `u${lead + 1}` : undefined;
  } else if (def.role === "lead") {
    const prod = USER_DEFS.findIndex(
      (u) => u.deptIdx === def.deptIdx && u.role === "producer",
    );
    supervisorId = prod >= 0 ? `u${prod + 1}` : productionHeadId;
  } else if (def.role === "producer") {
    supervisorId = productionHeadId; // Reports to Production Head
  }

  return {
    id: `u${i + 1}`,
    empId: `EMP${String(1000 + i).padStart(4, "0")}`,
    name: def.name,
    role: def.role,
    title: def.title,
    departmentId: deptId,
    avatar: `https://i.pravatar.cc/150?u=u${i + 1}`,
    email: `${def.name.split(" ")[0].toLowerCase()}@nebula.co`,
    studioId: "studio1",
    capacity: 60 + Math.floor((i * 7 + 13) % 40),
    licenses: userLicenses,
    supervisorId,
    startDate: `20${20 + (i % 5)}-${String((i % 12) + 1).padStart(2, "0")}-01`,
    status: i % 15 === 0 ? "away" : i % 20 === 0 ? "on-leave" : "active",
    skills: def.skills,
    password: "forge123", // All users share a demo password
  };
});

// --- Departments -----------------------------------------------------------

export const DEPARTMENTS: Department[] = DEPT_DEFINITIONS.map((d, i) => {
  const deptId = `dept${i + 1}`;
  const producer = USERS.find(
    (u) => u.departmentId === deptId && u.role === "producer",
  );
  const lead = USERS.find(
    (u) => u.departmentId === deptId && u.role === "lead",
  );

  // Every department (including dept 0, Production Management, whose
  // producer/lead are the ex Production Manager / Coordinator) should have
  // its own producer/lead, so both lookups above should always hit. Fall
  // back to the Production Head — the real top of the reporting chain —
  // instead of a hardcoded index, same as the USERS reporting-chain build
  // above, in case a department somehow has neither.
  return {
    id: deptId,
    name: d.name,
    abbreviation: d.abbr,
    color: d.color,
    supervisorId: producer?.id || productionHeadId,
    leadId: lead?.id || producer?.id || productionHeadId,
    studioId: "studio1",
    description: d.desc,
    icon: d.icon,
    pipeline: (d as any).pipeline || "PROD",
    pipelineOrder: d.order,
  };
});

// Pipeline order for department handoff
export const PIPELINE_ORDER = DEPARTMENTS.filter(
  (d) => d.pipelineOrder > 0,
).sort((a, b) => a.pipelineOrder - b.pipelineOrder);

export function getNextDepartment(currentDeptId: string): Department | null {
  const current = DEPARTMENTS.find((d) => d.id === currentDeptId);
  if (!current) return null;
  const next = DEPARTMENTS.find(
    (d) => d.pipelineOrder === current.pipelineOrder + 1,
  );
  return next || null;
}

// --- Projects (10) --------------------------------------------------------

const projectData = [
  {
    name: "Starfall",
    type: "Animated Feature",
    client: "StreamMax Studios",
    desc: "Epic space opera following a young pilot discovering ancient cosmic powers.",
  },
  {
    name: "Iron Veil",
    type: "Game Cinematic",
    client: "BattleForge Games",
    desc: "Dark fantasy game trailer featuring massive battle sequences and dragon combat.",
  },
  {
    name: "Nova Burst",
    type: "Ad Campaign",
    client: "Stellar Motors",
    desc: "Luxury EV launch campaign with abstract particle effects and futuristic cityscapes.",
  },
  {
    name: "Crimson Tide",
    type: "Animated Series",
    client: "NeonFlix",
    desc: "Underwater thriller series set in a dystopian deep-sea colony.",
  },
  {
    name: "Echoes",
    type: "VR Experience",
    client: "MindscapeVR",
    desc: "Immersive narrative VR experience exploring memories through surreal environments.",
  },
  {
    name: "Titan Rising",
    type: "Feature VFX",
    client: "Paramount+",
    desc: "Live-action sci-fi film requiring extensive creature and environment VFX work.",
  },
  {
    name: "Pixel Dreams",
    type: "Animated Short",
    client: "Internal",
    desc: "Award-submission short film about an AI learning to paint in a retro pixel world.",
  },
  {
    name: "Sandstorm",
    type: "Game Cinematic",
    client: "DuneCraft Interactive",
    desc: "Real-time strategy game intro with massive desert battle choreography.",
  },
  {
    name: "Crystal Realm",
    type: "Theme Park",
    client: "WonderWorld Parks",
    desc: "Dome projection content for an immersive crystal cave theme park ride.",
  },
  {
    name: "Midnight Sun",
    type: "Animated Feature",
    client: "Aurora Pictures",
    desc: "Nordic folklore-inspired animated film about the eternal twilight.",
  },
];

export const PROJECTS: Project[] = projectData.map((p, i) => ({
  id: `p${i + 1}`,
  name: p.name,
  type: p.type,
  progress: [68, 41, 89, 55, 23, 76, 94, 33, 61, 12][i],
  status: (
    [
      "ON_TRACK",
      "AT_RISK",
      "BOTTLENECK",
      "ON_TRACK",
      "ON_TRACK",
      "AT_RISK",
      "COMPLETE",
      "ON_TRACK",
      "AT_RISK",
      "ON_TRACK",
    ] as const
  )[i],
  shotsCount: [247, 62, 18, 130, 45, 189, 8, 55, 78, 310][i],
  assetsCount: [84, 31, 12, 56, 22, 67, 6, 28, 34, 92][i],
  dueDate: [
    "2025-03-30",
    "2025-02-15",
    "2025-01-03",
    "2025-06-20",
    "2025-08-01",
    "2025-04-15",
    "2025-01-10",
    "2025-05-30",
    "2025-07-15",
    "2025-12-01",
  ][i],
  startDate: [
    "2024-01-15",
    "2024-03-01",
    "2024-06-15",
    "2024-02-01",
    "2024-07-01",
    "2024-04-01",
    "2024-08-01",
    "2024-05-15",
    "2024-06-01",
    "2024-09-01",
  ][i],
  thumbnail: [
    "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
    "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
    "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
    "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
    "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)",
    "linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)",
    "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
    "linear-gradient(135deg, #cfd9df 0%, #e2ebf0 100%)",
  ][i],
  lastActivity: [
    "2 hours ago",
    "1 day ago",
    "5 hours ago",
    "30 mins ago",
    "3 days ago",
    "1 hour ago",
    "1 week ago",
    "4 hours ago",
    "2 days ago",
    "6 hours ago",
  ][i],
  studioId: i < 5 ? "studio1" : i < 8 ? "studio2" : "studio3",
  description: p.desc,
  client: p.client,
  budget: [
    4200000, 1800000, 850000, 3100000, 1200000, 5500000, 180000, 1400000,
    2300000, 6800000,
  ][i],
  riskScore: [32, 67, 45, 28, 15, 58, 5, 41, 52, 18][i],
}));

// --- Episodes ----------------------------------------------------------------
export const EPISODES: Episode[] = [];
let epCounter = 0;
PROJECTS.forEach((proj) => {
  const count = Math.max(1, Math.floor(Math.random() * 3)); // 1-2 episodes per project
  for (let e = 0; e < count; e++) {
    epCounter++;
    EPISODES.push({
      id: `ep${epCounter}`,
      name: `EP_${String(e + 1).padStart(2, "0")}`,
      projectId: proj.id,
      status: (
        ["complete", "in-progress", "bottleneck", "not-started"] as const
      )[e % 4],
      progress: Math.floor(Math.random() * 100),
      dueDate: proj.dueDate,
    });
  }
});

// --- Sequences ---------------------------------------------------------------

const seqNames = [
  "Opening",
  "Inciting",
  "Build Up",
  "Confrontation",
  "Climax",
  "Resolution",
  "Epilogue",
  "Action Set Piece",
  "Montage",
  "Chase",
];

export const SEQUENCES: Sequence[] = [];
let seqCounter = 0;
PROJECTS.forEach((proj) => {
  const count = Math.min(Math.ceil(proj.shotsCount / 15), 7);
  const projEpisodes = EPISODES.filter((ep) => ep.projectId === proj.id);

  for (let s = 0; s < count; s++) {
    seqCounter++;
    SEQUENCES.push({
      id: `seq${seqCounter}`,
      name: `SEQ_${String((s + 1) * 10).padStart(3, "0")} ${seqNames[s % seqNames.length]}`,
      projectId: proj.id,
      episodeId:
        projEpisodes.length > 0
          ? projEpisodes[s % projEpisodes.length].id
          : undefined,
      shotCount: Math.ceil(proj.shotsCount / count),
      status: (
        ["complete", "in-progress", "bottleneck", "not-started"] as const
      )[s % 4],
      progress: Math.max(0, proj.progress - s * 10 + (s % 3) * 15),
    });
  }
});

// --- Shots (100) -----------------------------------------------------------

const shotStatuses: Shot["status"][] = [
  "complete",
  "in-progress",
  "client-review",
  "bottleneck",
  "review",
  "not-started",
  "at-risk",
];
const shotComplexities: Shot["complexity"][] = ["low", "medium", "high"];
const reviewStatuses: Shot["internalReviewStatus"][] = [
  "pending",
  "approved",
  "rejected",
  "changes-requested",
  "not-submitted",
];

export const SHOTS: Shot[] = [];
for (let i = 0; i < 100; i++) {
  const projIdx =
    i < 25
      ? 0
      : i < 35
        ? 1
        : i < 40
          ? 2
          : i < 53
            ? 3
            : i < 58
              ? 4
              : i < 75
                ? 5
                : i < 78
                  ? 6
                  : i < 85
                    ? 7
                    : i < 92
                      ? 8
                      : 9;
  const proj = PROJECTS[projIdx];
  const projSeqs = SEQUENCES.filter((s) => s.projectId === proj.id);
  const seq = projSeqs[i % projSeqs.length];
  const shotNum = ((i % 20) + 1) * 10;

  SHOTS.push({
    id: `sh${i + 1}`,
    name: `${seq?.name.split(" ")[0] || "SEQ_010"}_SH_${String(shotNum).padStart(3, "0")}`,
    projectId: proj.id,
    episodeId: seq?.episodeId || `ep1`,
    sequenceId: seq?.id || `seq1`,
    sequence: seq?.name.split(" ")[0] || "SEQ_010",
    status: shotStatuses[i % shotStatuses.length],
    assigneeId: `u${(i % USERS.length) + 1}`,
    updatedAt: `2024-${String(9 + (i % 3)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    frameRange: `${1001 + i * 48}-${1001 + i * 48 + 47 + (i % 80)}`,
    duration: 48 + (i % 80),
    complexity: shotComplexities[i % 3],
    currentVersion: `v${String((i % 5) + 1).padStart(3, "0")}`,
    usdVersion: `v${String((i % 5) + 1).padStart(3, "0")}.usd`,
    internalReviewStatus: reviewStatuses[i % 5],
    clientReviewStatus: reviewStatuses[(i + 1) % 5],
    thumbnailSeed: 1000 + i,
    notes:
      i % 3 === 0
        ? "Waiting on upstream asset updates."
        : i % 3 === 1
          ? "Looking good, minor tweaks needed."
          : "",
  });
}

// --- Assets (150) ----------------------------------------------------------

const assetTypes: Asset["type"][] = [
  "Character",
  "Environment",
  "Prop",
  "Rig",
  "Effects",
  "Vehicle",
  "Texture",
  "Material",
  "Audio",
];
const assetStatuses: Asset["status"][] = [
  "complete",
  "in-progress",
  "bottleneck",
  "at-risk",
  "not-started",
  "review",
];
const publishStatuses: Asset["publishStatus"][] = [
  "published",
  "draft",
  "queued",
  "validating",
  "failed",
];

const assetNames = [
  "Hero Lyra",
  "Villain Moros",
  "Desert Canyons",
  "Ancient Artifact",
  "Lyra Rig v3",
  "Wind & Dust FX",
  "Magic Blast",
  "Space Station",
  "Crystal Cave",
  "Dragon Scale",
  "Neon City",
  "Ocean Floor",
  "Plasma Sword",
  "Star Map",
  "Void Portal",
  "Storm Clouds",
  "Lava Flow",
  "Ice Castle",
  "Mech Suit",
  "Forest Canopy",
  "Asteroid Belt",
  "Moon Base",
  "Alien Flora",
  "Energy Shield",
  "Holo Display",
  "Underwater Kelp",
  "Coral Reef",
  "Deep Trench",
  "Sub Vehicle",
  "Pressure Suit",
  "Data Stream",
  "Neural Link",
  "Memory Fragment",
  "Dream Sequence",
  "Reality Tear",
  "Battle Mech",
  "War Banner",
  "Siege Engine",
  "Castle Walls",
  "Dragon Mount",
  "Sand Dunes",
  "Oasis Town",
  "Caravan Wagon",
  "Desert Beast",
  "Sun Temple",
  "Crystal Golem",
  "Light Bridge",
  "Dome Ceiling",
  "Water Feature",
  "Ride Vehicle",
];

export const ASSETS: Asset[] = [];
for (let i = 0; i < 150; i++) {
  const projIdx =
    i < 40
      ? 0
      : i < 55
        ? 1
        : i < 63
          ? 2
          : i < 85
            ? 3
            : i < 95
              ? 4
              : i < 115
                ? 5
                : i < 120
                  ? 6
                  : i < 132
                    ? 7
                    : i < 142
                      ? 8
                      : 9;
  const type = assetTypes[i % assetTypes.length];
  const prefix =
    type === "Character"
      ? "CHAR"
      : type === "Environment"
        ? "ENV"
        : type === "Prop"
          ? "PROP"
          : type === "Rig"
            ? "RIG"
            : type === "Effects"
              ? "FX"
              : type === "Vehicle"
                ? "VEH"
                : type === "Texture"
                  ? "TEX"
                  : type === "Material"
                    ? "MAT"
                    : "AUD";
  const baseName = assetNames[i % assetNames.length];

  const proj = PROJECTS[projIdx];
  const projSeqs = SEQUENCES.filter((s) => s.projectId === proj.id);
  const seq = projSeqs[i % projSeqs.length];

  ASSETS.push({
    id: `asset${i + 1}`,
    name: baseName,
    projectId: `p${projIdx + 1}`,
    episodeId: seq?.episodeId || undefined,
    sequenceId: seq?.id || undefined,
    type,
    status: assetStatuses[i % assetStatuses.length],
    assigneeId: `u${(i % USERS.length) + 1}`,
    updatedAt: `2024-${String(8 + (i % 4)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    version: `v${String((i % 12) + 1).padStart(3, "0")}`,
    usdVersion: `v${String((i % 12) + 1).padStart(3, "0")}.usd`,
    tags: [
      ["hero", "character"][i % 2],
      ["modeling", "rigging", "texturing", "animation", "fx"][i % 5],
      i % 3 === 0 ? "priority" : i % 3 === 1 ? "reviewed" : "wip",
    ],
    thumbnailSeed: 2000 + i,
    fileSize: `${(((i * 37 + 15) % 900) + 50).toFixed(0)} MB`,
    polyCount:
      type === "Character" ||
      type === "Environment" ||
      type === "Prop" ||
      type === "Vehicle"
        ? `${(((i * 13 + 5) % 500) + 10).toFixed(0)}K`
        : undefined,
    dependencies: i > 3 ? [`asset${(i % 4) + 1}`] : [],
    publishStatus: publishStatuses[i % publishStatuses.length],
    description: `${prefix}_${baseName.replace(/\s+/g, "_")} — ${type} asset for ${PROJECTS[projIdx].name}.`,
  });
}

// --- Tasks (300) -----------------------------------------------------------

const taskTitles = [
  "Model {entity}",
  "Rig {entity}",
  "Animate {entity}",
  "Light {entity}",
  "Composite {entity}",
  "Texture {entity}",
  "FX sim for {entity}",
  "Layout pass for {entity}",
  "Look dev {entity}",
  "Final polish {entity}",
  "Review {entity}",
  "Fix feedback on {entity}",
  "Optimize {entity}",
  "QC check {entity}",
  "Color grade {entity}",
  "Render {entity}",
  "Prep delivery for {entity}",
  "Retopology {entity}",
  "UV unwrap {entity}",
  "Hair groom {entity}",
  // Task titles for the 7 departments (Matchmove/Camera Tracking, Rotomation, Creature
  // Effects/CFX, Rotoscoping, Paint/Prep, Digital Matte Painting, 2D Animation/Motion
  // Graphics) that taskDeptMap previously had no entries for at all, so they never
  // received any generated tasks.
  "Camera track {entity}",
  "Digital double match {entity}",
  "Creature sim {entity}",
  "Roto pass for {entity}",
  "Paint fix {entity}",
  "Matte paint {entity}",
  "Motion graphics {entity}",
];

const taskStatuses: Task["status"][] = [
  "todo",
  "not-started",
  "in-progress",
  "bottleneck",
  "review",
  "lead-review",
  "pm-review",
  "approved",
  "complete",
];
const taskPriorities: Task["priority"][] = [
  "critical",
  "high",
  "medium",
  "low",
];
// Weighted toward Finish-to-Start since that's the overwhelmingly common real-world case.
const DEPENDENCY_TYPES: DependencyType[] = ["FS", "FS", "FS", "SS", "FF", "SF"];

// Map task titles to departments for realistic pipeline assignment.
// Indices reference DEPT_DEFINITIONS' current order (0=Production Management,
// 1=Modeling, 2=Texturing/LookDev, 3=Rigging, 4=Layout, 5=Animation, 6=Lighting,
// 7=Rendering, 8=Matchmove/Tracking, 9=Rotomation, 10=CFX, 11=FX Simulations,
// 12=Grooming, 13=Roto, 14=Paint/Prep, 15=DMP, 16=2D Animation/MotionGraphics, 17=Compositing).
const taskDeptMap: Record<string, number> = {
  Model: 1,
  Rig: 3,
  Animate: 5,
  Light: 6,
  Composite: 17,
  Texture: 2,
  "FX sim": 11,
  "Layout pass": 4,
  "Look dev": 2,
  "Final polish": 17,
  Review: 0,
  "Fix feedback": 5,
  Optimize: 6,
  "QC check": 0,
  "Color grade": 17,
  Render: 7,
  "Prep delivery": 0,
  Retopology: 1,
  "UV unwrap": 1,
  "Hair groom": 12,
  // Previously-missing departments (see taskTitles above) — every one of the
  // 18 real departments must have at least one task-title source so the
  // Supervisor/Lead home dashboard has generated tasks/velocity to show.
  "Camera track": 8,
  "Digital double match": 9,
  "Creature sim": 10,
  "Roto pass": 13,
  "Paint fix": 14,
  "Matte paint": 15,
  "Motion graphics": 16,
};

const CHECKLIST_ITEMS = [
  "Setup scene",
  "First pass",
  "Internal review",
  "Final polish",
];

// weeklyRating must vary independently of which task title/department a task landed
// on. taskTitles.length (title selection uses `i % taskTitles.length`) is a multiple
// of 5 in practice, so indexing a 5-item rating cycle by the same `i` made every task
// generated from a given title land on the exact same rating every time. Using a
// 7-item cycle keeps the rating's period coprime with any title-pool length that's a
// multiple of 5 (or of itself), so the two no longer march in lockstep.
const WEEKLY_RATING_CYCLE = [
  "on-track",
  "on-track",
  "at-risk",
  "on-track",
  "behind",
  "at-risk",
  "on-track",
] as const;

// How many checklist items should be checked off for a given task status/assignment state.
// Keeps checklist completion honest relative to status instead of an independent modulo,
// e.g. a 'todo'/unassigned task can never show a fully (or mostly) checked-off checklist.
function checklistDoneCount(
  status: TaskStatus,
  unassigned: boolean,
  seed: number,
): number {
  // A finished, signed-off task is fully done regardless of whether it's since been unassigned.
  if (status === "approved" || status === "complete")
    return CHECKLIST_ITEMS.length;
  if (
    unassigned ||
    status === "todo" ||
    status === "not-started" ||
    status === "cancelled"
  )
    return 0;
  if (status === "bottleneck") return 1;
  if (status === "in-progress") return 1 + (seed % 2); // 1-2 items: work is underway but not done
  if (status === "review" || status === "lead-review" || status === "pm-review")
    return 3; // submitted, final polish still pending sign-off
  return 0;
}

function checklistForStatus(
  status: TaskStatus,
  seed: number,
  unassigned: boolean,
): { text: string; done: boolean }[] {
  const doneCount = checklistDoneCount(status, unassigned, seed);
  return CHECKLIST_ITEMS.map((text, idx) => ({ text, done: idx < doneCount }));
}

export const TASKS: Task[] = [];
for (let i = 0; i < 300; i++) {
  const projIdx =
    i < 80
      ? 0
      : i < 120
        ? 1
        : i < 140
          ? 2
          : i < 190
            ? 3
            : i < 210
              ? 4
              : i < 250
                ? 5
                : i < 260
                  ? 6
                  : i < 275
                    ? 7
                    : i < 288
                      ? 8
                      : 9;
  const projId = `p${projIdx + 1}`;
  const hasAsset = i % 3 !== 2;
  const hasShot = i % 3 !== 0;
  // Only ever pick an asset/shot that actually belongs to this task's own project —
  // picking from the full ASSETS/SHOTS pool independent of project produced 'used in'/
  // 'related' cross-references pointing at a totally different production.
  const projectAssets = ASSETS.filter((a) => a.projectId === projId);
  const projectShots = SHOTS.filter((s) => s.projectId === projId);
  const asset =
    hasAsset && projectAssets.length > 0
      ? projectAssets[i % projectAssets.length]
      : undefined;
  const shot =
    hasShot && projectShots.length > 0
      ? projectShots[i % projectShots.length]
      : undefined;
  const entity = asset ? asset.name : shot ? shot.name : PROJECTS[projIdx].name;
  const titleTemplate = taskTitles[i % taskTitles.length];
  const titleKey =
    Object.keys(taskDeptMap).find((k) => titleTemplate.startsWith(k)) ||
    "Model";
  const deptIdx = taskDeptMap[titleKey] ?? i % DEPARTMENTS.length;
  const dept = DEPARTMENTS[deptIdx];
  // status must vary independently of which title/department a task's index landed on.
  // taskTitles.length is currently 27 (a multiple of taskStatuses.length === 9), so a bare
  // `i % taskStatuses.length` makes every task generated from the same title land on the
  // exact same status every time (same lockstep failure mode already fixed for
  // weeklyRating below via WEEKLY_RATING_CYCLE). Folding in how many times this title has
  // already repeated (i / taskTitles.length), scaled by a step coprime with 9, makes each
  // repeat of the same title cycle through a different status instead of being pinned to one.
  const titleRepeatIdx = Math.floor(i / taskTitles.length);
  const status = taskStatuses[(i + titleRepeatIdx * 5) % taskStatuses.length];
  // Every ~23rd task is left unclaimed (self-serve pool) rather than pre-assigned.
  const isUnassigned = i % 23 === 0;

  // Find artists in this department for assignment
  const deptArtists = USERS.filter(
    (u) => u.departmentId === dept.id && u.role === "artist",
  );
  const assignee =
    deptArtists.length > 0
      ? deptArtists[i % deptArtists.length]
      : USERS[i % USERS.length];

  // Producer or lead assigns the task
  const deptProducer = USERS.find(
    (u) => u.departmentId === dept.id && u.role === "producer",
  );
  const deptLead = USERS.find(
    (u) => u.departmentId === dept.id && u.role === "lead",
  );
  // Every department (including dept 0, Production Management, whose
  // producer is the ex Production Manager) should have its own producer, so
  // the lookup above should always hit. Fall back to the Production Head —
  // the real top of the reporting chain — so admin tasks are always
  // assigned by a real internal user rather than USERS[0] (the External
  // Client).
  const internalAssignerFallback = USERS.find(
    (u) => u.id === productionHeadId,
  )!;
  const assigner =
    i % 2 === 0
      ? deptProducer || internalAssignerFallback
      : deptLead || deptProducer || internalAssignerFallback;

  // Generate daily logs. An unassigned task (self-serve pool, assigneeId '') can't have
  // logged hours yet — same reasoning as checklistDoneCount() zeroing out an unassigned
  // task's checklist above — so it gets none regardless of the i%3 sampling below.
  const dailyLogs: DailyLog[] = [];
  if (!isUnassigned && i % 3 !== 2) {
    // Not all tasks have logs
    for (let d = 0; d < Math.min((i % 5) + 1, 5); d++) {
      dailyLogs.push({
        date: `2024-09-${String(((d + 20) % 28) + 1).padStart(2, "0")}`,
        hours: [2, 4, 6, 8, 3][d % 5],
        note: [
          "Bottleneck on upstream dependency.",
          "Good progress, 60% done.",
          "Waiting for review notes.",
          "Reworking per feedback.",
          "Final polish pass.",
        ][d % 5],
        userId: assignee.id,
      });
    }
  }

  TASKS.push({
    id: `t${i + 1}`,
    title: titleTemplate.replace("{entity}", entity),
    description: `Task for ${PROJECTS[projIdx].name}: ${titleTemplate.replace("{entity}", entity)}. Follow pipeline guidelines and submit for review when complete.`,
    projectId: projId,
    assetId: asset?.id,
    shotId: shot?.id,
    assigneeId: isUnassigned ? "" : assignee.id,
    assignedById: assigner.id,
    status,
    priority: taskPriorities[i % taskPriorities.length],
    dueDate: `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    estimatedHours: [4, 8, 16, 24, 40, 80][i % 6],
    actualHours: Math.floor(([4, 8, 16, 24, 40, 80][i % 6] * (i % 5)) / 5),
    tags: [
      dept.abbreviation.toLowerCase(),
      i % 4 === 0
        ? "urgent"
        : i % 4 === 1
          ? "bottleneck"
          : i % 4 === 2
            ? "ready"
            : "waiting",
    ],
    // t${i-1} is only a same-project task except right at a project boundary (e.g. i=120 is
    // Nova Burst's first task while t119 is Iron Veil's last) — without the projectId guard
    // that boundary task would get wired to a "blocking" dependency from an entirely
    // different production, the same cross-project mismatch already fixed for asset/shot
    // linking above. TASKS is 0-indexed but ids are `t${index+1}`, so the task with id
    // `t${i-1}` lives at array index i-2, not i-1.
    dependencies:
      i > 5 && i % 3 === 0 && TASKS[i - 2]?.projectId === projId
        ? [
            {
              taskId: `t${i - 1}`,
              type: DEPENDENCY_TYPES[i % DEPENDENCY_TYPES.length],
              ...(i % 4 === 0 ? { lagDays: (i % 5) + 1 } : {}),
            },
          ]
        : [],
    // Checklist completion must correlate with status/assignment, not be derived independently —
    // an unassigned/todo task can't have finished its checklist, and only a task that's actually
    // been submitted (review+) or signed off (approved/complete) can show later items checked.
    checklist: checklistForStatus(status, i, isUnassigned),
    comments:
      i % 2 === 0
        ? [
            {
              userId: assigner.id,
              text: "Looking good, keep it up!",
              timestamp: "2024-09-20T10:30:00Z",
            },
            {
              userId: assignee.id,
              text: "Working on the feedback.",
              timestamp: "2024-09-21T14:15:00Z",
            },
          ]
        : [],
    attachments: i % 5 === 0 ? ["reference_v1.jpg", "notes.pdf"] : [],
    department: dept.name,
    createdAt: `2024-${String(6 + (i % 6)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    lastStatusUpdate: `2024-09-${String((i % 28) + 1).padStart(2, "0")}T${String(8 + (i % 14)).padStart(2, "0")}:00:00Z`,
    dailyLogs,
    weeklyRating: WEEKLY_RATING_CYCLE[i % WEEKLY_RATING_CYCLE.length],
    pipelinePhase: dept.abbreviation,
    approvalHistory: [],
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
    entityType: isShot ? "shot" : "asset",
    versionNumber: `v${String((i % 12) + 1).padStart(3, "0")}`,
    status: (["pending", "approved", "rejected", "changes-requested"] as const)[
      i % 4
    ],
    createdById: `u${(i % USERS.length) + 1}`,
    createdAt: `2024-${String(7 + (i % 5)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}T${String(8 + (i % 12)).padStart(2, "0")}:00:00Z`,
    thumbnailSeed: 3000 + i,
    notes:
      i % 3 === 0
        ? "Updated per review notes."
        : i % 3 === 1
          ? "Initial submission."
          : "Reworked based on feedback.",
    derivedFromId: i > 0 ? `v${i}` : "",
    fileSize: `${(((i * 23 + 10) % 500) + 20).toFixed(0)} MB`,
  });
}

// The randomized distribution above (entityIdx = i % ASSETS.length, with i
// only ever odd for assets) never lands on an even-indexed asset — so assets
// like asset1/asset3 end up with zero rows here despite their header showing
// a real "Version: v001, Published" state. Backfill one version per asset
// that's otherwise missing entirely, so an asset never shows a published
// current version with a blank version history.
ASSETS.forEach((asset) => {
  const hasVersion = VERSIONS.some((v) => v.entityId === asset.id);
  if (hasVersion) return;
  VERSIONS.push({
    id: `v-seed-${asset.id}`,
    entityId: asset.id,
    entityType: "asset",
    versionNumber: asset.version,
    status:
      asset.publishStatus === "published"
        ? "approved"
        : asset.publishStatus === "failed"
          ? "rejected"
          : "pending",
    createdById: asset.assigneeId,
    createdAt: `${asset.updatedAt}T12:00:00Z`,
    thumbnailSeed: asset.thumbnailSeed,
    notes: "Initial submission.",
    derivedFromId: "",
    fileSize: asset.fileSize,
  });
});

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
    status: (["pending", "approved", "rejected", "changes-requested"] as const)[
      i % 4
    ],
    comments: [
      "Looks great, approved!",
      "The rim lighting needs adjustment on frame 45-60.",
      "Overall good but the timing feels off in the second half.",
      "Perfect execution. Ship it!",
      "Please fix the intersection artifact at the edge.",
    ][i % 5],
    frame: i % 3 === 0 ? 45 + i : undefined,
    createdAt: `2024-09-${String((i % 28) + 1).padStart(2, "0")}T${String(9 + (i % 10)).padStart(2, "0")}:00:00Z`,
    updatedAt: `2024-09-${String((i % 28) + 1).padStart(2, "0")}T${String(10 + (i % 10)).padStart(2, "0")}:00:00Z`,
  });
}

// --- Publish Logs ------------------------------------------------------
//
// No generator loop here (unlike VERSIONS/REVIEWS above, both of which get
// correctly overwritten with real API data by store/auth.ts's fetchMe()
// after login) -- the publishing feature has no real backend at all yet
// (no publishLogsTable, no /api/publish-logs route), so there is nothing
// to hydrate from. Genuinely empty until that gets built; populated at
// runtime only via usePublishingStore's addPublishLog on a real "Confirm
// Publish" action.

export const PUBLISH_LOGS: PublishLog[] = [];

// --- Workflows & Runs -------------------------------------------------------

export const WORKFLOWS: Workflow[] = [
  {
    id: "wf1",
    name: "Review → Approve → Publish",
    description: "Standard review loop with auto-publish on approval",
    nodes: 4,
    lastEdited: "2 days ago",
    trigger: "New Version",
    runs: 342,
    successRate: 94,
    status: "active",
  },
  {
    id: "wf2",
    name: "Shot Delivery Pipeline",
    description: "Export, transcode, and upload to client",
    nodes: 6,
    lastEdited: "1 week ago",
    trigger: "Status Change",
    runs: 128,
    successRate: 89,
    status: "active",
  },
  {
    id: "wf3",
    name: "Asset QC Check",
    description: "Automated geometry and texture validation",
    nodes: 3,
    lastEdited: "3 weeks ago",
    trigger: "Publish",
    runs: 567,
    successRate: 97,
    status: "active",
  },
  {
    id: "wf4",
    name: "Client Preview Loop",
    description: "Watermark and send to client portal",
    nodes: 5,
    lastEdited: "1 month ago",
    trigger: "Manual",
    runs: 45,
    successRate: 100,
    status: "active",
  },
  {
    id: "wf5",
    name: "Emergency Hotfix",
    description: "Bypass standard gates for critical fixes",
    nodes: 2,
    lastEdited: "2 months ago",
    trigger: "Manual",
    runs: 12,
    successRate: 83,
    status: "draft",
  },
  {
    id: "wf6",
    name: "New Project Onboarding",
    description: "Create folders, set permissions, invite team",
    nodes: 8,
    lastEdited: "3 months ago",
    trigger: "New Project",
    runs: 10,
    successRate: 100,
    status: "active",
  },
  {
    id: "wf7",
    name: "Nightly Render Farm Submit",
    description: "Batch submit all pending renders at midnight",
    nodes: 5,
    lastEdited: "5 days ago",
    trigger: "Schedule",
    runs: 89,
    successRate: 91,
    status: "active",
  },
  {
    id: "wf8",
    name: "Dept Handoff Pipeline",
    description: "Auto-notify next department when work completes",
    nodes: 4,
    lastEdited: "2 weeks ago",
    trigger: "Status Change",
    runs: 234,
    successRate: 96,
    status: "active",
  },
];

export const WORKFLOW_RUNS: WorkflowRun[] = [];
for (let i = 0; i < 25; i++) {
  const wf = WORKFLOWS[i % WORKFLOWS.length];
  WORKFLOW_RUNS.push({
    id: `wr${i + 1}`,
    workflowId: wf.id,
    triggeredBy: `u${(i % 20) + 1}`,
    startedAt: `2024-09-${String((i % 28) + 1).padStart(2, "0")}T${String(8 + (i % 14)).padStart(2, "0")}:00:00Z`,
    completedAt:
      i % 3 !== 0
        ? `2024-09-${String((i % 28) + 1).padStart(2, "0")}T${String(9 + (i % 14)).padStart(2, "0")}:00:00Z`
        : undefined,
    status: (
      ["running", "completed", "failed", "completed", "completed"] as const
    )[i % 5],
    currentNode: i % 3 === 0 ? "Review Gate" : "Done",
    entityId: `asset${(i % 40) + 1}`,
    logs: [
      {
        timestamp: "09:00:00",
        node: "Trigger",
        message: `Workflow started by ${USERS[i % 20].name}`,
        status: "info" as const,
      },
      {
        timestamp: "09:00:05",
        node: "Action",
        message: "Notified reviewers",
        status: "success" as const,
      },
      {
        timestamp: "09:02:30",
        node: "Review Gate",
        message:
          i % 5 === 2 ? "Review rejected by reviewer" : "Review approved",
        status: i % 5 === 2 ? ("error" as const) : ("success" as const),
      },
      ...(i % 5 !== 2
        ? [
            {
              timestamp: "09:03:00",
              node: "Publish",
              message: "Asset published to production",
              status: "success" as const,
            },
          ]
        : []),
    ],
  });
}

// --- Audit Events -----------------------------------------------------------

export const AUDIT_EVENTS: AuditEvent[] = [];
const eventTypes = [
  "created",
  "status_changed",
  "assignee_set",
  "version_submitted",
  "version_approved",
  "version_rejected",
  "published",
  "linked_to_shot",
  "downstream_notified",
  "comment_added",
  "priority_changed",
  "dependency_added",
];

for (let i = 0; i < 100; i++) {
  const isAsset = i % 2 === 0;
  const num = (i % 40) + 1;
  const eventType = eventTypes[i % eventTypes.length];
  // Must match the real ASSETS/SHOTS id format ("asset1", "sh1", ...) —
  // this previously generated a disjoint "ast_001"/"sh_001" namespace, so
  // any user-driven entity selection on the Audit page returned an empty
  // timeline (see product review §4/§6).
  const entityId = isAsset ? `asset${num}` : `sh${num}`;

  AUDIT_EVENTS.push({
    id: `e${i + 1}`,
    entityId,
    entityType: isAsset ? "asset" : "shot",
    timestamp: `2024-${String(7 + (i % 5)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")} ${String(8 + (i % 14)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00`,
    userId: `u${(i % USERS.length) + 1}`,
    eventType,
    description: [
      `Created ${i % 2 === 0 ? "asset" : "shot"} entity`,
      `Status changed to ${["in-progress", "review", "complete", "bottleneck"][i % 4]}`,
      `Assigned to ${USERS[(i + 3) % USERS.length].name}`,
      `Submitted version v${String((i % 12) + 1).padStart(3, "0")}`,
      `Approved version v${String((i % 12) + 1).padStart(3, "0")}`,
      `Rejected version — needs revisions`,
      `Published to production`,
      `Linked to shot SEQ_${String(((i % 5) + 1) * 10).padStart(3, "0")}`,
      `Notified ${(i % 5) + 2} downstream artists`,
      `Comment added by ${USERS[i % USERS.length].name}`,
      `Priority changed to ${["critical", "high", "medium", "low"][i % 4]}`,
      `Dependency added: ${i % 2 === 0 ? `asset${(i % 20) + 1}` : `sh${(i % 30) + 1}`}`,
    ][i % eventTypes.length],
    // Previously always {} regardless of eventType, which left the built
    // diff/changed-fields UI in audit.tsx permanently unreachable, AND (once
    // populated) Time Travel's rollback was purely cosmetic — it only
    // struck through later events in this page's timeline without touching
    // the real entity anywhere (see product review §4/§9). Populated for
    // the event types that represent a real field on Asset/Shot, using
    // real status values and real user ids (not display names) so
    // store/audit.ts's rollbackEntity() can apply these values directly to
    // useAssetStore/useShotStore. `priority_changed` is deliberately left
    // as {} — neither Asset nor Shot has a priority field, so there's
    // nothing on the entity itself to roll back for that event type.
    changedFields:
      eventType === "status_changed"
        ? {
            status: isAsset
              ? `${["not-started", "in-progress", "review"][i % 3]} → ${["in-progress", "review", "complete", "bottleneck", "at-risk"][i % 5]}`
              : `${["not-started", "in-progress", "review"][i % 3]} → ${["in-progress", "review", "complete", "bottleneck", "approved"][i % 5]}`,
          }
        : eventType === "assignee_set"
          ? {
              assigneeId: `${USERS[i % USERS.length].id} → ${USERS[(i + 3) % USERS.length].id}`,
            }
          : {},
  });
}

// --- Notifications (50) ---------------------------------------------------

export const NOTIFICATIONS: Notification[] = [];
const notifTemplates: {
  title: string;
  desc: string;
  cat: Notification["category"];
  pri: Notification["priority"];
}[] = [
  {
    title: "Task Assigned",
    desc: 'You were assigned to "{task}"',
    cat: "assignment",
    pri: "medium",
  },
  {
    title: "Version Approved",
    desc: "{user} approved {version}",
    cat: "approval",
    pri: "low",
  },
  {
    title: "Dependency Bottleneck",
    desc: "{asset} is bottleneck, affecting your task",
    cat: "workflow",
    pri: "high",
  },
  {
    title: "Review Requested",
    desc: "{user} requested your review on {entity}",
    cat: "review",
    pri: "high",
  },
  {
    title: "Publish Complete",
    desc: "{asset} published to production",
    cat: "publishing",
    pri: "low",
  },
  {
    title: "Mentioned in Comment",
    desc: "{user} mentioned you in {entity}",
    cat: "mention",
    pri: "medium",
  },
  {
    title: "Workflow Failed",
    desc: 'Workflow "{workflow}" failed at step 3',
    cat: "workflow",
    pri: "high",
  },
  {
    title: "Deadline Approaching",
    desc: "{task} is due in 2 days",
    cat: "system",
    pri: "medium",
  },
  {
    title: "Dept Handoff",
    desc: "{dept} has completed their phase — work transferred to you",
    cat: "handoff",
    pri: "high",
  },
  {
    title: "New Team Member",
    desc: "{user} joined the project",
    cat: "system",
    pri: "low",
  },
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
      .replace("{user}", user.name)
      .replace("{task}", task.title)
      .replace("{asset}", asset.name)
      .replace("{entity}", asset.name)
      .replace("{version}", `v${String((i % 12) + 1).padStart(3, "0")}`)
      .replace("{workflow}", WORKFLOWS[i % WORKFLOWS.length].name)
      .replace("{dept}", DEPARTMENTS[i % DEPARTMENTS.length].name),
    timestamp: [
      "2 mins ago",
      "10 mins ago",
      "30 mins ago",
      "1 hour ago",
      "2 hours ago",
      "3 hours ago",
      "5 hours ago",
      "1 day ago",
      "2 days ago",
      "3 days ago",
    ][i % 10],
    read: i > 15,
    category: tmpl.cat,
    priority: tmpl.pri,
    entityId: i % 2 === 0 ? asset.id : task.id,
    entityType: i % 2 === 0 ? "asset" : "task",
  });
}

// --- AI Suggestions (30) ---------------------------------------------------

export const AI_SUGGESTIONS: AISuggestion[] = [
  {
    id: "ai1",
    severity: "CRITICAL",
    title: "Capacity Overload: Yuki Tanaka at 119%",
    description:
      "ENV_SpaceStation is a dependency for 7 shots in SEQ_030. If this slips 3+ days, critical path extends by 11 days.",
    entity: "ENV_SpaceStation",
    entityType: "asset",
    assignee: "Yuki Tanaka",
    suggestedAction: "Reassign 2 tasks to available environment artists",
    impact: "7 shots, 3 sequences affected",
    page: "dashboard",
  },
  {
    id: "ai2",
    severity: "CRITICAL",
    title: "Review Bottleneck: 12 reviews pending > 48h",
    description:
      "Review queue has 12 items pending more than 48 hours. Average review time has increased 3x this sprint.",
    entity: "Review Queue",
    entityType: "review",
    assignee: "Maya Chen",
    suggestedAction: "Schedule dedicated review sessions",
    impact: "Pipeline throughput reduced by 40%",
    page: "dashboard",
  },
  {
    id: "ai3",
    severity: "HIGH",
    title: "Velocity Drop: Iron Veil camera animation",
    description:
      "Review cycle averaging 2.8 rounds/shot vs studio avg 1.4. P50=Nov 3, P80=Nov 9, P95=Nov 14.",
    entity: "Iron Veil",
    entityType: "project",
    assignee: "Diego Vargas",
    suggestedAction: "Add reviewer checkpoint at 50% completion",
    impact: "Project delivery may slip 2 weeks",
    page: "scheduling",
  },
  {
    id: "ai4",
    severity: "HIGH",
    title: "Missing Dependencies: FX_MagicBlast",
    description:
      "3 downstream tasks bottleneck. Current velocity 40% below required pace.",
    entity: "FX_MagicBlast",
    entityType: "asset",
    assignee: "Priya Nair",
    suggestedAction: "Escalate to department lead",
    impact: "3 tasks, 5 shots affected",
    page: "dashboard",
  },
  {
    id: "ai5",
    severity: "MEDIUM",
    title: "Storage Warning: 85% capacity",
    description:
      "Studio storage at 85%. At current rate, will reach 95% in 12 days.",
    entity: "Storage",
    entityType: "system",
    assignee: "Rafi Solomonov",
    suggestedAction: "Archive completed project renders",
    impact: "Pipeline may halt if storage full",
    page: "dashboard",
  },
  {
    id: "ai6",
    severity: "MEDIUM",
    title: "Publish Conflict: Lyra Rig versions",
    description:
      "Two versions of Lyra Rig submitted for publishing within 1 hour. Potential overwrite risk.",
    entity: "Lyra Rig v3",
    entityType: "asset",
    assignee: "Luca Moretti",
    suggestedAction: "Review and resolve version conflict",
    impact: "4 dependent animations may use wrong rig",
    page: "publishing",
  },
  {
    id: "ai7",
    severity: "LOW",
    title: "Optimization: Unused assets detected",
    description:
      "8 assets in Starfall have no shot references and no active tasks.",
    entity: "Starfall",
    entityType: "project",
    assignee: "Aisha Diallo",
    suggestedAction: "Review and archive unused assets",
    impact: "Storage savings ~2.3 GB",
    page: "assets",
  },
  {
    id: "ai8",
    severity: "HIGH",
    title: "Critical Path Risk: SEQ_030 Climax",
    description:
      "Sequence has 5 bottleneck shots with cascading dependencies. Estimated delay: 8 business days.",
    entity: "SEQ_030",
    entityType: "sequence",
    assignee: "Production Team",
    suggestedAction: "Reassign bottleneck tasks and add overtime budget",
    impact: "Project milestone at risk",
    page: "scheduling",
  },
  {
    id: "ai9",
    severity: "MEDIUM",
    title: "Review Overdue: Moros walk cycle",
    description: "Task has been in review status for 5 days without action.",
    entity: "Moros Walk Cycle",
    entityType: "task",
    assignee: "Maya Chen",
    suggestedAction: "Send review reminder",
    impact: "Blocks 2 downstream animation tasks",
    page: "tasks",
  },
  {
    id: "ai10",
    severity: "CRITICAL",
    title: "Render Farm Queue Overflow",
    description:
      "340 render jobs queued, average wait time 6.2 hours (normal: 1.5h). 3 nodes offline.",
    entity: "Render Farm",
    entityType: "system",
    assignee: "Rafi Solomonov",
    suggestedAction: "Restart offline nodes, prioritize critical path renders",
    impact: "All departments affected",
    page: "dashboard",
  },
];

for (let i = 0; i < 20; i++) {
  AI_SUGGESTIONS.push({
    id: `ai${11 + i}`,
    severity: (["HIGH", "MEDIUM", "LOW", "MEDIUM"] as const)[i % 4],
    title: [
      "Task dependency chain detected",
      "Potential scheduling conflict",
      "Asset version mismatch",
      "Workflow optimization available",
      "Resource rebalancing opportunity",
    ][i % 5],
    description: `Automated analysis detected an optimization opportunity in ${PROJECTS[i % PROJECTS.length].name}.`,
    entity: PROJECTS[i % PROJECTS.length].name,
    entityType: "project",
    assignee: USERS[i % USERS.length].name,
    suggestedAction: "Review suggested changes",
    impact: "Minor efficiency improvement",
    page: ["dashboard", "scheduling", "assets", "tasks", "publishing"][i % 5],
  });
}

export const AI_RECOMMENDATIONS = AI_SUGGESTIONS.filter(
  (s) => s.page === "dashboard" || s.page === "scheduling",
)
  .slice(0, 5)
  .map((s) => ({
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
    60 + ((i * 7 + 13) % 60),
    65 + ((i * 11 + 7) % 55),
    70 + ((i * 5 + 19) % 50),
    55 + ((i * 13 + 3) % 65),
    60 + ((i * 9 + 11) % 55),
    70 + ((i * 3 + 17) % 50),
    65 + ((i * 8 + 23) % 55),
    75 + ((i * 6 + 9) % 45),
  ],
}));

// --- Leave / Time Off -------------------------------------------------------
// Roughly a quarter of the roster has an upcoming leave block within the
// scheduling window (2025-06-01 + 45 days), used by Team Calendar & Capacity
// Forecast to subtract time-off from available capacity.

export interface LeaveEvent {
  id: string;
  userId: string;
  type: "vacation" | "sick" | "holiday";
  start: string;
  end: string;
  reason: string;
}

const leaveTypes: LeaveEvent["type"][] = ["vacation", "sick", "holiday"];
const leaveReasons: Record<LeaveEvent["type"], string[]> = {
  vacation: ["Annual leave", "Family trip", "Long weekend"],
  sick: ["Sick leave", "Medical appointment"],
  holiday: ["Studio closure", "Public holiday"],
};

export const LEAVE_EVENTS: LeaveEvent[] = USERS.filter(
  (u, i) => u.role !== "client" && i % 4 === 0,
).map((user, i) => {
  const type = leaveTypes[i % leaveTypes.length];
  const startOffset = 2 + ((i * 5 + 7) % 40);
  const duration =
    type === "holiday" ? 1 : type === "sick" ? 1 + (i % 2) : 2 + (i % 4);
  const start = new Date("2025-06-01");
  start.setDate(start.getDate() + startOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + duration - 1);
  const reasons = leaveReasons[type];
  return {
    id: `leave${i + 1}`,
    userId: user.id,
    type,
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
    reason: reasons[i % reasons.length],
  };
});

// --- Milestones -----------------------------------------------------------

export const MILESTONES: Milestone[] = [];
const msNames = [
  "Concept Lock",
  "Asset Complete",
  "Animation Lock",
  "Lighting Complete",
  "Final Comp",
  "Client Delivery",
  "Internal Review",
  "Sound Design Lock",
];
PROJECTS.forEach((proj, pi) => {
  for (let m = 0; m < 4; m++) {
    MILESTONES.push({
      id: `ms${pi * 4 + m + 1}`,
      projectId: proj.id,
      name: msNames[m % msNames.length],
      dueDate: `2025-${String(m * 2 + (pi % 6) + 1).padStart(2, "0")}-${String(((m * 5 + 10) % 28) + 1).padStart(2, "0")}`,
      status: (["complete", "on-track", "at-risk", "overdue"] as const)[m % 4],
      progress: [100, 75, 45, 20][m % 4],
    });
  }
});

// --- Plugins ---------------------------------------------------------------

export const PLUGINS: Plugin[] = [
  {
    id: "pl1",
    name: "AI Auto-Layout",
    category: "Pipeline",
    rating: 4.8,
    installs: "2.3k",
    verified: true,
    icon: "Zap",
    description:
      "Automatically arranges shots in optimal sequence based on camera flow analysis.",
    author: "Forge Labs",
    version: "2.1.0",
    compatibility: "Forge 3.0+",
    lastUpdated: "2 weeks ago",
  },
  {
    id: "pl2",
    name: "BulkRender Submit",
    category: "Render",
    rating: 4.5,
    installs: "8.1k",
    verified: true,
    icon: "Package",
    description: "Batch submit render jobs across multiple farm providers.",
    author: "RenderStack",
    version: "5.3.1",
    compatibility: "Forge 2.5+",
    lastUpdated: "1 month ago",
  },
  {
    id: "pl3",
    name: "ShotGrid Sync",
    category: "Integration",
    rating: 4.2,
    installs: "5.9k",
    verified: true,
    icon: "Link",
    description:
      "Bidirectional sync with Autodesk ShotGrid for hybrid pipelines.",
    author: "PipelineBridge",
    version: "3.0.0",
    compatibility: "Forge 3.0+",
    lastUpdated: "3 weeks ago",
  },
  {
    id: "pl4",
    name: "Deadline Monitor",
    category: "Monitoring",
    rating: 4.7,
    installs: "3.4k",
    verified: true,
    icon: "Activity",
    description:
      "Real-time monitoring dashboard for Thinkbox Deadline render farm.",
    author: "FarmWatch",
    version: "1.8.2",
    compatibility: "Forge 2.0+",
    lastUpdated: "1 week ago",
  },
  {
    id: "pl5",
    name: "QuickNote Overlay",
    category: "Annotation",
    rating: 4.0,
    installs: "1.2k",
    verified: true,
    icon: "PenTool",
    description:
      "Quick annotation overlay for review sessions with Apple Pencil support.",
    author: "SketchTools",
    version: "2.0.0",
    compatibility: "Forge 3.0+",
    lastUpdated: "2 months ago",
  },
  {
    id: "pl6",
    name: "BetaColorProfile",
    category: "Color",
    rating: 3.1,
    installs: "421",
    verified: false,
    icon: "Palette",
    description:
      "ACES and OCIO color profile management. Beta — use at own risk.",
    author: "ColorLab",
    version: "0.9.3",
    compatibility: "Forge 2.5+",
    lastUpdated: "3 months ago",
  },
  {
    id: "pl7",
    name: "KitsuBridge",
    category: "Integration",
    rating: 4.6,
    installs: "6.7k",
    verified: true,
    icon: "Link2",
    description:
      "Sync with Kitsu production tracking for teams using both tools.",
    author: "CGWire",
    version: "4.1.0",
    compatibility: "Forge 2.0+",
    lastUpdated: "2 weeks ago",
  },
  {
    id: "pl8",
    name: "TimelapseCapture",
    category: "Tools",
    rating: 3.8,
    installs: "987",
    verified: false,
    icon: "Camera",
    description:
      "Capture work-in-progress timelapses for social media and presentations.",
    author: "ArtDoc",
    version: "1.2.0",
    compatibility: "Forge 2.5+",
    lastUpdated: "6 weeks ago",
  },
  {
    id: "pl9",
    name: "Smart Dependencies",
    category: "Pipeline",
    rating: 4.9,
    installs: "4.2k",
    verified: true,
    icon: "GitFork",
    description:
      "AI-powered dependency detection and management across your pipeline.",
    author: "Forge Labs",
    version: "1.5.0",
    compatibility: "Forge 3.0+",
    lastUpdated: "1 week ago",
  },
  {
    id: "pl10",
    name: "Client Portal",
    category: "Integration",
    rating: 4.4,
    installs: "3.1k",
    verified: true,
    icon: "Globe",
    description:
      "White-label client review portal with watermarking and approval workflows.",
    author: "ClientView",
    version: "3.2.0",
    compatibility: "Forge 2.5+",
    lastUpdated: "3 weeks ago",
  },
  {
    id: "pl11",
    name: "Nuke Connector",
    category: "Integration",
    rating: 4.7,
    installs: "7.8k",
    verified: true,
    icon: "Plug",
    description: "Direct integration with Foundry Nuke for comp workflows.",
    author: "NukeTools",
    version: "6.0.1",
    compatibility: "Forge 2.0+",
    lastUpdated: "2 weeks ago",
  },
  {
    id: "pl12",
    name: "Budget Tracker",
    category: "Production",
    rating: 4.3,
    installs: "1.8k",
    verified: true,
    icon: "DollarSign",
    description: "Track project budgets, burn rates, and financial forecasts.",
    author: "ProdFinance",
    version: "2.4.0",
    compatibility: "Forge 3.0+",
    lastUpdated: "1 month ago",
  },
];

// --- Chat Messages -----------------------------------------------------------

// dept2 is Modeling, not Animation (DEPT_DEFINITIONS[0] Production Management -> dept1,
// [1] Modeling -> dept2, ... [5] Animation -> dept6) — these messages about a chase
// sequence and a playblast were showing up in the Modeling chat channel instead of
// Animation's. u2 and u8 aren't the Animation Supervisor/Lead either: u2 is Maya Chen
// (VFX Producer) and u8 is Isla MacLeod (Previs Lead) — there is no "Jada Williams" in
// USERS at all, so chat.tsx's `USERS.find(u => u.id === msg.userId)` was silently
// misattributing every one of these messages to the wrong real person. Corrected to
// dept6 and to the actual Animation Supervisor/Lead (u33 Akira Suzuki, u34 Nia Okafor).
export const MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    departmentId: "dept6", // Animation
    userId: "u33", // Akira Suzuki (Animation Supervisor)
    text: "Hey team, let's make sure we review the pacing on the chase sequence before the client review tomorrow.",
    attachments: [],
    timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: "m2",
    departmentId: "dept6",
    userId: "u34", // Nia Okafor (Animation Lead)
    text: "I'll upload the latest playblast here in a few minutes. I think the weight on the landing still feels a bit floaty.",
    attachments: [],
    timestamp: new Date(Date.now() - 3600000 * 23).toISOString(),
  },
  {
    id: "m3",
    departmentId: "dept6",
    userId: "u34",
    text: "Here is the current pass:",
    attachments: [
      {
        id: "a1",
        type: "video",
        url: "https://test-videos.co.uk/vids/jellyfish/mp4/h264/1080/Jellyfish_1080_10s_5MB.mp4",
        name: "chase_seq_v12_playblast.mp4",
      },
    ],
    timestamp: new Date(Date.now() - 3600000 * 22).toISOString(),
  },
];

export const USER_STATUS = USERS.reduce(
  (acc, u) => {
    acc[u.id] = {
      isPunchedIn: Math.random() > 0.3,
      lastActive: new Date().toISOString(),
    };
    return acc;
  },
  {} as Record<string, { isPunchedIn: boolean; lastActive: string }>,
);

export interface TimeLog {
  id: string;
  userId: string;
  taskId: string;
  date: string;
  hours: number;
  note: string;
}

// USERS[0].id used to be a harmless positional reference (the seed's first coordinator);
// after the client-role fix it resolves to the External Client, which put a client on an
// internal artist timecard with logged hours. It also pointed at t1, an unassigned
// "Model ..." task that has nothing to do with the "Worked on rigging" note. Derive a real
// rigging artist and one of their actual rigging tasks instead, so both the user and the
// task genuinely match the note.
const timeLogArtist =
  USERS.find((u) => u.title === "Rigger") ??
  USERS.find((u) => u.role === "artist")!;
const timeLogTask =
  TASKS.find(
    (t) => t.assigneeId === timeLogArtist.id && t.title.startsWith("Rig "),
  ) ?? TASKS[0];

export const TIME_LOGS: TimeLog[] = [
  {
    id: "l1",
    userId: timeLogArtist.id,
    taskId: timeLogTask.id,
    date: "2026-08-07",
    hours: 8,
    note: "Worked on rigging",
  },
];

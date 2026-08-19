import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Filter, Download, Save, TableProperties, List, LayoutGrid,
  ChevronDown, ChevronRight, Layers, ArrowUpDown, Bookmark, BookmarkPlus,
  Trash2, Building2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cut } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/hooks/use-toast';
import { PROJECTS, EPISODES, SEQUENCES, USERS, DEPARTMENTS, TaskStatus } from '@/data/mockData';
import { useShotStore } from '@/store/shots';
import { useTasksStore } from '@/store/tasks';
import { useTrackingViewsStore, TrackingGroupKey, TrackingSortKey } from '@/store/trackingViews';

// ----------------------------------------------------------------------------
// Static config
// ----------------------------------------------------------------------------

const GRID_COLS = '44px 130px 100px 120px 160px 130px 104px 110px 120px 120px minmax(220px,1fr)';
const CELL = 'border-r border-b border-[#333] p-2 flex items-center overflow-hidden';
const CELL_CENTER = `${CELL} justify-center text-center`;

const GROUP_OPTIONS: { value: TrackingGroupKey; label: string }[] = [
  { value: 'none', label: 'No Grouping' },
  { value: 'project', label: 'Project' },
  { value: 'episode', label: 'Episode' },
  { value: 'department', label: 'Department' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'status', label: 'Status' },
  { value: 'internalReview', label: 'Internal Review' },
  { value: 'clientReview', label: 'Client Review' },
];

const SORT_OPTIONS: { value: TrackingSortKey; label: string }[] = [
  { value: 'hierarchy', label: 'Hierarchy (Default)' },
  { value: 'shot', label: 'Shot Name' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'status', label: 'Status' },
  { value: 'updated', label: 'Last Updated' },
];

const STATUS_DOT_COLORS: Record<string, string> = {
  complete: '#10b981', 'in-progress': '#f59e0b', bottleneck: '#ef4444', review: '#a855f7',
  'not-started': '#71717a', 'at-risk': '#f97316', 'client-review': '#8b5cf6', approved: '#22c55e', published: '#06b6d4',
};
const REVIEW_DOT_COLORS: Record<string, string> = {
  approved: '#10b981', rejected: '#ef4444', 'changes-requested': '#f97316', pending: '#3b82f6', 'not-submitted': '#71717a',
};
const SHOT_BUCKET_COLOR: Record<string, string> = {
  complete: '#10b981', 'in-progress': '#f59e0b', bottleneck: '#ef4444', review: '#a855f7', other: '#52525b',
};
const TASK_BUCKET_COLOR: Record<string, string> = {
  complete: '#10b981', 'in-progress': '#f59e0b', bottleneck: '#ef4444', review: '#a855f7', todo: '#71717a', other: '#3f3f46',
};
const TASK_BUCKET_ORDER = ['complete', 'in-progress', 'review', 'bottleneck', 'todo', 'other'] as const;

// Full Shot.status vocabulary (9 values) so every shot renders a valid, non-empty
// selection regardless of what state it's currently in.
const SHOT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'not-started', label: 'Not Started' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'bottleneck', label: 'Bottleneck' },
  { value: 'review', label: 'Review' },
  { value: 'client-review', label: 'Client Review' },
  { value: 'at-risk', label: 'At Risk' },
  { value: 'approved', label: 'Approved' },
  { value: 'complete', label: 'Complete' },
  { value: 'published', label: 'Published' },
];

// Full review-status vocabulary (5 values) shared by internal & client review columns.
const REVIEW_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'not-submitted', label: 'Not Submitted' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'changes-requested', label: 'Changes Req' },
  { value: 'rejected', label: 'Rejected' },
];

function humanize(s: string) {
  return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function bucketShotStatus(status: string): keyof typeof SHOT_BUCKET_COLOR {
  if (status === 'complete') return 'complete';
  if (status === 'in-progress') return 'in-progress';
  if (status === 'bottleneck') return 'bottleneck';
  if (status === 'review' || status === 'client-review') return 'review';
  return 'other';
}

function bucketTaskStatus(status: TaskStatus): keyof typeof TASK_BUCKET_COLOR {
  if (status === 'todo' || status === 'not-started') return 'todo';
  if (status === 'in-progress') return 'in-progress';
  if (status === 'review' || status === 'lead-review' || status === 'manager-review') return 'review';
  if (status === 'bottleneck') return 'bottleneck';
  if (status === 'complete' || status === 'approved') return 'complete';
  return 'other';
}

// ----------------------------------------------------------------------------
// Row / grouping model
// ----------------------------------------------------------------------------

interface TrackingRow {
  id: string;
  no: number;
  project: string;
  projectId: string;
  episode: string;
  sequence: string;
  shot: string;
  assignee: string;
  assigneeId: string;
  departmentId: string;
  department: string;
  departmentColor: string;
  status: string;
  internalReview: string;
  clientReview: string;
  usdVersion: string;
  updatedAt: string;
  notes: string;
}

interface GroupNode {
  key: string;
  label: string;
  color?: string;
  rows: TrackingRow[];
  children?: GroupNode[];
}

function getGroupValue(row: TrackingRow, key: TrackingGroupKey): { id: string; label: string; color?: string } {
  switch (key) {
    case 'project':
      return { id: row.projectId, label: row.project };
    case 'episode':
      return { id: `${row.projectId}__${row.episode}`, label: row.episode };
    case 'department':
      return { id: row.departmentId, label: row.department, color: row.departmentColor };
    case 'assignee':
      return { id: row.assigneeId || row.assignee, label: row.assignee };
    case 'status':
      return { id: row.status, label: humanize(row.status), color: STATUS_DOT_COLORS[row.status] };
    case 'internalReview':
      return { id: `ir-${row.internalReview}`, label: humanize(row.internalReview), color: REVIEW_DOT_COLORS[row.internalReview] };
    case 'clientReview':
      return { id: `cr-${row.clientReview}`, label: humanize(row.clientReview), color: REVIEW_DOT_COLORS[row.clientReview] };
    default:
      return { id: 'all', label: 'All' };
  }
}

function buildGroups(rows: TrackingRow[], keys: TrackingGroupKey[]): GroupNode[] {
  if (keys.length === 0) return [];
  const [key, ...rest] = keys;
  const order: string[] = [];
  const map = new Map<string, { label: string; color?: string; rows: TrackingRow[] }>();
  rows.forEach((row) => {
    const { id, label, color } = getGroupValue(row, key);
    if (!map.has(id)) {
      map.set(id, { label, color, rows: [] });
      order.push(id);
    }
    map.get(id)!.rows.push(row);
  });
  return order
    .map((id) => {
      const entry = map.get(id)!;
      const node: GroupNode = { key: id, label: entry.label, color: entry.color, rows: entry.rows };
      if (rest.length > 0) node.children = buildGroups(entry.rows, rest);
      return node;
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function compareRows(a: TrackingRow, b: TrackingRow, sortBy: TrackingSortKey): number {
  switch (sortBy) {
    case 'shot': return a.shot.localeCompare(b.shot);
    case 'assignee': return a.assignee.localeCompare(b.assignee);
    case 'status': return a.status.localeCompare(b.status);
    case 'updated': return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    default: return 0;
  }
}

// ----------------------------------------------------------------------------
// Shared sub-components
// ----------------------------------------------------------------------------

function MiniStatusBar({ rows }: { rows: TrackingRow[] }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = { complete: 0, 'in-progress': 0, bottleneck: 0, review: 0, other: 0 };
    rows.forEach((r) => { c[bucketShotStatus(r.status)]++; });
    return c;
  }, [rows]);
  const total = rows.length || 1;
  const order: (keyof typeof SHOT_BUCKET_COLOR)[] = ['complete', 'in-progress', 'review', 'bottleneck', 'other'];
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="flex h-1.5 w-20 rounded-full overflow-hidden bg-[#222]">
        {order.map((key) => counts[key] > 0 && (
          <motion.div
            key={key}
            initial={{ width: 0 }}
            animate={{ width: `${(counts[key] / total) * 100}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            style={{ background: SHOT_BUCKET_COLOR[key] }}
          />
        ))}
      </div>
      <span className="text-[10px] text-emerald-500 font-mono w-8 text-right">{Math.round((counts.complete / total) * 100)}%</span>
    </div>
  );
}

function renderLeaves(
  rows: TrackingRow[],
  view: 'list' | 'card',
  renderListRow: (row: TrackingRow) => React.ReactNode,
  renderCard: (row: TrackingRow) => React.ReactNode,
) {
  if (view === 'card') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-3">
        {rows.map((row) => renderCard(row))}
      </div>
    );
  }
  return <>{rows.map((row) => renderListRow(row))}</>;
}

interface GroupSectionProps {
  node: GroupNode;
  depth: number;
  path: string;
  collapsedKeys: Set<string>;
  toggleGroup: (path: string) => void;
  view: 'list' | 'card';
  renderListRow: (row: TrackingRow) => React.ReactNode;
  renderCard: (row: TrackingRow) => React.ReactNode;
}

function GroupSection({ node, depth, path, collapsedKeys, toggleGroup, view, renderListRow, renderCard }: GroupSectionProps) {
  const isCollapsed = collapsedKeys.has(path);
  const count = node.rows.length;
  return (
    <div className="border-b border-[#242424] last:border-b-0">
      <motion.button
        type="button"
        whileTap={{ scale: 0.995 }}
        onClick={() => toggleGroup(path)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left bg-[#151515] hover:bg-[#1c1c1c] transition-colors"
        style={{ paddingLeft: 12 + depth * 22 }}
      >
        <motion.span
          animate={{ rotate: isCollapsed ? -90 : 0 }}
          transition={{ duration: 0.15 }}
          className="text-[#888] shrink-0"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </motion.span>
        {node.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: node.color }} />}
        <span className="text-[12px] font-semibold text-white truncate">{node.label}</span>
        <span className="text-[10px] text-[#777] font-normal shrink-0">{count} shot{count === 1 ? '' : 's'}</span>
        <div className="flex-1" />
        <MiniStatusBar rows={node.rows} />
      </motion.button>
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {node.children
              ? node.children.map((child) => (
                <GroupSection
                  key={child.key}
                  node={child}
                  depth={depth + 1}
                  path={`${path}::${child.key}`}
                  collapsedKeys={collapsedKeys}
                  toggleGroup={toggleGroup}
                  view={view}
                  renderListRow={renderListRow}
                  renderCard={renderCard}
                />
              ))
              : renderLeaves(node.rows, view, renderListRow, renderCard)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------

export default function TrackingGrid() {
  const { currentUser } = useAuthStore();
  const { toast } = useToast();

  const [search, setSearchState] = useState('');
  const [projectFilter, setProjectFilterState] = useState('all');
  const [view, setViewState] = useState<'list' | 'card'>('list');
  const [groupBy1, setGroupBy1State] = useState<TrackingGroupKey>('none');
  const [groupBy2, setGroupBy2State] = useState<TrackingGroupKey>('none');
  const [sortBy, setSortByState] = useState<TrackingSortKey>('hierarchy');
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [localOverrides, setLocalOverrides] = useState<Record<string, any>>({});
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  // Toggles visibility of the grouping/sorting/saved-views filter controls (row 2 below).
  const [showFilterControls, setShowFilterControls] = useState(true);

  const liveShots = useShotStore((state) => state.shots);
  const updateShot = useShotStore((state) => state.updateShot);
  const updateReviewStatus = useShotStore((state) => state.updateReviewStatus);
  const liveTasks = useTasksStore((state) => state.tasks);

  const savedViews = useTrackingViewsStore((state) => state.views);
  const activeViewId = useTrackingViewsStore((state) => state.activeViewId);
  const addView = useTrackingViewsStore((state) => state.addView);
  const removeView = useTrackingViewsStore((state) => state.removeView);
  const setActiveViewId = useTrackingViewsStore((state) => state.setActiveViewId);

  // Guards against clearing "active view" while we are programmatically applying one.
  const applyingRef = useRef(false);
  const markDirty = () => { if (!applyingRef.current && activeViewId) setActiveViewId(null); };

  const setSearch = (v: string) => { setSearchState(v); markDirty(); };
  const setProjectFilter = (v: string) => { setProjectFilterState(v); markDirty(); };
  const setView = (v: 'list' | 'card') => { setViewState(v); markDirty(); };
  const setGroupBy1 = (v: TrackingGroupKey) => {
    setGroupBy1State(v);
    // The "Then by" dropdown excludes whatever groupBy1 currently is, but that
    // filtering only runs on groupBy2's own render — if the user now picks a
    // primary group that happens to match the *existing* secondary group,
    // groupBy2 is left pointing at a value its own option list no longer
    // offers (and buildGroups would nest a key under itself). Reset it too.
    if (v === 'none' || v === groupBy2) setGroupBy2State('none');
    setCollapsedKeys(new Set());
    markDirty();
  };
  const setGroupBy2 = (v: TrackingGroupKey) => { setGroupBy2State(v); setCollapsedKeys(new Set()); markDirty(); };
  const setSortBy = (v: TrackingSortKey) => { setSortByState(v); markDirty(); };

  const activeView = useMemo(() => savedViews.find((v) => v.id === activeViewId) || null, [savedViews, activeViewId]);

  const isDirty = Object.keys(localOverrides).length > 0;

  // Warn on tab close / reload / browser back-forward so staged edits aren't silently lost.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Warn on in-app navigation (sidebar / any <a> link) while edits are staged but not saved.
  useEffect(() => {
    if (!isDirty) return;
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (!href.startsWith('/') || href === window.location.pathname) return;
      const confirmed = window.confirm('You have unsaved tracking grid changes that haven\'t been saved. Leave this page and discard them?');
      if (!confirmed) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [isDirty]);

  const trackingData = useMemo(() => {
    // Filter by project
    let filteredShots = liveShots;
    if (projectFilter !== 'all') {
      filteredShots = filteredShots.filter((s) => s.projectId === projectFilter);
    }

    // Default hierarchical ordering: Project -> Episode -> Sequence -> Shot
    filteredShots = [...filteredShots].sort((a, b) => {
      if (a.projectId !== b.projectId) return String(a.projectId || '').localeCompare(String(b.projectId || ''));
      if (a.episodeId !== b.episodeId) return String(a.episodeId || '').localeCompare(String(b.episodeId || ''));
      if (a.sequenceId !== b.sequenceId) return String(a.sequenceId || '').localeCompare(String(b.sequenceId || ''));
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    if (search) {
      const term = search.toLowerCase();
      filteredShots = filteredShots.filter((s) => {
        const projName = PROJECTS.find((p) => p.id === s.projectId)?.name || '';
        const epName = EPISODES.find((e) => e.id === s.episodeId)?.name || '';
        return String(s.name || '').toLowerCase().includes(term) ||
          String(s.sequence || '').toLowerCase().includes(term) ||
          projName.toLowerCase().includes(term) ||
          epName.toLowerCase().includes(term);
      });
    }

    let mapped: TrackingRow[] = filteredShots.map((shot, i) => {
      const proj = PROJECTS.find((p) => p.id === shot.projectId);
      const ep = EPISODES.find((e) => e.id === shot.episodeId);
      const seq = SEQUENCES.find((sq) => sq.id === shot.sequenceId);
      const assignee = USERS.find((u) => u.id === shot.assigneeId);
      const dept = assignee ? DEPARTMENTS.find((d) => d.id === assignee.departmentId) : undefined;

      return {
        id: shot.id,
        no: i + 1,
        project: proj?.name || 'Unknown',
        projectId: shot.projectId,
        episode: ep?.name || 'EP_01',
        sequence: seq?.name || shot.sequence,
        shot: shot.name,
        assignee: assignee?.name || 'Unassigned',
        assigneeId: shot.assigneeId,
        departmentId: dept?.id || 'unassigned',
        department: dept?.name || 'Unassigned',
        departmentColor: dept?.color || '#555555',
        status: localOverrides[shot.id]?.status || shot.status,
        internalReview: localOverrides[shot.id]?.internalReview || shot.internalReviewStatus,
        clientReview: localOverrides[shot.id]?.clientReview || shot.clientReviewStatus,
        usdVersion: shot.usdVersion || 'v001.usd',
        updatedAt: shot.updatedAt,
        notes: localOverrides[shot.id]?.notes !== undefined ? localOverrides[shot.id]?.notes : (shot.notes || 'No notes.'),
      };
    });

    if (sortBy !== 'hierarchy') {
      mapped = [...mapped].sort((a, b) => compareRows(a, b, sortBy));
    }

    return mapped.map((row, i) => ({ ...row, no: i + 1 }));
  }, [search, projectFilter, localOverrides, liveShots, sortBy]);

  const groupTree = useMemo(() => {
    if (groupBy1 === 'none') return null;
    const keys = [groupBy1, ...(groupBy2 !== 'none' ? [groupBy2] : [])];
    return buildGroups(trackingData, keys);
  }, [trackingData, groupBy1, groupBy2]);

  const deptRollup = useMemo(() => {
    const relevantTasks = projectFilter === 'all' ? liveTasks : liveTasks.filter((t) => t.projectId === projectFilter);
    return DEPARTMENTS.map((dept) => {
      const deptTasks = relevantTasks.filter((t) => t.department === dept.name);
      const buckets: Record<string, number> = { todo: 0, 'in-progress': 0, review: 0, bottleneck: 0, complete: 0, other: 0 };
      deptTasks.forEach((t) => { buckets[bucketTaskStatus(t.status)]++; });
      return { dept, total: deptTasks.length, buckets };
    }).filter((d) => d.total > 0);
  }, [liveTasks, projectFilter]);

  const toggleGroup = (path: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const updateCell = (id: string, field: string, value: string) => {
    setLocalOverrides((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value,
      },
    }));
  };

  const applyView = (id: string) => {
    const v = savedViews.find((sv) => sv.id === id);
    if (!v) return;
    applyingRef.current = true;
    setSearchState(v.filters.search);
    setProjectFilterState(v.filters.projectFilter);
    setGroupBy1State(v.filters.groupBy1);
    setGroupBy2State(v.filters.groupBy2);
    setSortByState(v.filters.sortBy);
    setViewState(v.filters.view);
    setActiveViewId(id);
    setCollapsedKeys(new Set());
    requestAnimationFrame(() => { applyingRef.current = false; });
    toast({ title: 'View Applied', description: `Switched to "${v.name}".` });
  };

  const handleSaveView = () => {
    const name = newViewName.trim();
    if (!name) return;
    addView(name, { search, projectFilter, groupBy1, groupBy2, sortBy, view });
    setNewViewName('');
    setSaveViewOpen(false);
    toast({ title: 'View Saved', description: `"${name}" added to Saved Views.` });
  };

  const handleDeleteView = (id: string, name: string) => {
    removeView(id);
    toast({ title: 'View Deleted', description: `"${name}" removed from Saved Views.` });
  };

  const escapeCSVValue = (value: unknown) => {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const handleExportCSV = () => {
    const headers = [
      'No', 'Project', 'Episode', 'Sequence', 'Shot', 'Assignee', 'Department',
      'Status', 'USD Version', 'Internal Review', 'Client Review', 'Updated At', 'Notes',
    ];
    const rows = trackingData.map((row) => [
      row.no, row.project, row.episode, row.sequence, row.shot, row.assignee, row.department,
      row.status, row.usdVersion, row.internalReview, row.clientReview, row.updatedAt, row.notes,
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escapeCSVValue).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tracking-grid-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: 'Export Complete', description: `${trackingData.length} rows exported to CSV.` });
  };

  if (!currentUser || !['vfx_producer', 'production_manager', 'coordinator', 'supervisor', 'lead'].includes(currentUser.role)) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-muted-foreground">
        <TableProperties className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-xl font-semibold mb-2 text-foreground">Access Denied</h2>
        <p>You need Production or Supervisor privileges to access the Tracking Grid.</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'text-emerald-500';
      case 'in-progress': return 'text-amber-500';
      case 'bottleneck': return 'text-red-500';
      case 'review': return 'text-purple-500';
      case 'client-review': return 'text-violet-400';
      case 'at-risk': return 'text-orange-500';
      case 'approved': return 'text-green-500';
      case 'published': return 'text-cyan-500';
      case 'not-started': return 'text-[#888]';
      default: return 'text-muted-foreground';
    }
  };

  const getReviewColor = (status: string) => {
    switch (status) {
      case 'approved': return 'text-emerald-500 bg-emerald-500/10';
      case 'rejected': return 'text-red-500 bg-red-500/10';
      case 'changes-requested': return 'text-orange-500 bg-orange-500/10';
      case 'pending': return 'text-blue-500 bg-blue-500/10';
      case 'not-submitted': return 'text-[#888] bg-[#333]/40';
      default: return 'text-muted-foreground bg-muted/20';
    }
  };

  const renderListRow = (row: TrackingRow) => (
    <div key={row.id} className="grid hover:bg-[#252525] transition-colors" style={{ gridTemplateColumns: GRID_COLS }}>
      <div className={`${CELL_CENTER} text-[#888]`}>{row.no}</div>
      <div className={`${CELL} text-white font-medium`}><span className="truncate">{row.project}</span></div>
      <div className={`${CELL} text-[#ccc]`}><span className="truncate">{row.episode}</span></div>
      <div className={`${CELL} text-[#ccc]`}><span className="truncate">{row.sequence}</span></div>
      <div className={`${CELL} text-[#4facfe] font-medium`}><span className="truncate">{row.shot}</span></div>
      <div className={`${CELL} text-[#aaa]`}><span className="truncate">{row.assignee}</span></div>
      <div className="border-r border-b border-[#333] p-0 text-center font-semibold capitalize relative">
        <select
          className={`w-full h-full bg-transparent outline-none appearance-none cursor-pointer text-center ${getStatusColor(row.status)} hover:bg-[#333]/50 transition-colors p-2`}
          value={row.status}
          onChange={(e) => updateCell(row.id, 'status', e.target.value)}
        >
          {SHOT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-[#1a1a1a]">{o.label}</option>
          ))}
        </select>
      </div>
      <div className={`${CELL_CENTER} text-xs text-[#00cec9] font-mono`}>{row.usdVersion}</div>
      <div className="border-r border-b border-[#333] p-0 text-center relative">
        <select
          className={`w-full h-full bg-transparent outline-none appearance-none cursor-pointer text-center px-2 py-2 font-bold uppercase text-[10px] ${getReviewColor(row.internalReview)} hover:bg-[#333]/50 transition-colors`}
          value={row.internalReview}
          onChange={(e) => updateCell(row.id, 'internalReview', e.target.value)}
        >
          {REVIEW_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-[#1a1a1a]">{o.label}</option>
          ))}
        </select>
      </div>
      <div className="border-r border-b border-[#333] p-0 text-center relative">
        <select
          className={`w-full h-full bg-transparent outline-none appearance-none cursor-pointer text-center px-2 py-2 font-bold uppercase text-[10px] ${getReviewColor(row.clientReview)} hover:bg-[#333]/50 transition-colors`}
          value={row.clientReview}
          onChange={(e) => updateCell(row.id, 'clientReview', e.target.value)}
        >
          {REVIEW_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-[#1a1a1a]">{o.label}</option>
          ))}
        </select>
      </div>
      <div className="border-b border-[#333] p-0">
        <input
          type="text"
          className="w-full h-full bg-transparent outline-none px-2 py-2 text-[11px] text-[#ccc] hover:bg-[#333]/50 transition-colors focus:bg-[#333] focus:text-white"
          value={row.notes}
          onChange={(e) => updateCell(row.id, 'notes', e.target.value)}
        />
      </div>
    </div>
  );

  const renderCard = (row: TrackingRow) => (
    <div key={row.id} className="bg-[#1a1a1a] border border-[#333] rounded-sm p-3 flex flex-col gap-3 shadow-sm hover:border-[#555] transition-colors">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-sm font-semibold text-white">{row.shot}</div>
          <div className="text-[10px] text-[#888] flex items-center gap-1">
            <span>{row.project} • {row.sequence}</span>
            <span className="inline-flex items-center gap-1 ml-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: row.departmentColor }} />
              {row.department}
            </span>
          </div>
        </div>
        <div className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm ${getStatusColor(row.status)} bg-black/20 border border-[#333]`}>
          {row.status.replace('-', ' ')}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="bg-[#111] p-2 rounded-sm border border-[#222]">
          <div className="text-[#666] mb-1 text-[9px] uppercase">Internal</div>
          <select
            className={`w-full bg-transparent outline-none appearance-none cursor-pointer font-semibold ${getReviewColor(row.internalReview).split(' ')[0]}`}
            value={row.internalReview}
            onChange={(e) => updateCell(row.id, 'internalReview', e.target.value)}
          >
            {REVIEW_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="bg-[#111] p-2 rounded-sm border border-[#222]">
          <div className="text-[#666] mb-1 text-[9px] uppercase">Client</div>
          <select
            className={`w-full bg-transparent outline-none appearance-none cursor-pointer font-semibold ${getReviewColor(row.clientReview).split(' ')[0]}`}
            value={row.clientReview}
            onChange={(e) => updateCell(row.id, 'clientReview', e.target.value)}
          >
            {REVIEW_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-[#888] mt-1">
        <span>Assignee: {row.assignee}</span>
        <span className="font-mono text-[#00cec9] text-[10px]">{row.usdVersion}</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] p-4 bg-[#0a0a0a] text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Global Tracking Grid</h1>
          <p className="text-[#888] text-sm mt-1">Hierarchical sequence & shot tracking with Review pipelines.</p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-400 mr-1" title="You have staged edits that haven't been saved yet">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
              Unsaved changes
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="border-[#333] text-[#ccc]">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={() => {
            Object.entries(localOverrides).forEach(([id, changes]) => {
              if ('status' in changes || 'notes' in changes) {
                updateShot(id, {
                  ...('status' in changes ? { status: changes.status } : {}),
                  ...('notes' in changes ? { notes: changes.notes } : {}),
                });
              }
              if (changes.internalReview) updateReviewStatus(id, true, changes.internalReview);
              if (changes.clientReview) updateReviewStatus(id, false, changes.clientReview);
            });
            setLocalOverrides({});
            toast({ title: 'Changes Saved', description: 'Tracking grid updated successfully.' });
          }}>
            <Save className="w-4 h-4 mr-2" /> Save Changes
          </Button>
        </div>
      </div>

      {/* Department status rollup strip */}
      <div className="mb-4 shrink-0">
        <div className="flex items-center gap-1.5 mb-2">
          <Building2 className="w-3.5 h-3.5 text-[#666]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Department Status Rollup</h2>
        </div>
        <TooltipProvider delayDuration={150}>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {deptRollup.map(({ dept, total, buckets }, i) => (
              <motion.div
                key={dept.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.02 }}
                whileHover={{ y: -2 }}
                className="shrink-0 w-[168px] bg-[#111] border border-[#2a2a2a] rounded-sm p-2.5 hover:border-[#444] transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dept.color }} />
                  <span className="text-[11px] font-semibold text-white truncate flex-1" title={dept.name}>{dept.abbreviation}</span>
                  <span className="text-[10px] text-[#777] font-mono">{total}</span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex h-2 rounded-full overflow-hidden bg-[#1e1e1e] cursor-default">
                      {TASK_BUCKET_ORDER.map((key) => buckets[key] > 0 && (
                        <motion.div
                          key={key}
                          initial={{ width: 0 }}
                          animate={{ width: `${(buckets[key] / total) * 100}%` }}
                          transition={{ duration: 0.4, ease: 'easeOut' }}
                          style={{ background: TASK_BUCKET_COLOR[key] }}
                        />
                      ))}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-[11px]">
                    <div className="font-semibold mb-1">{dept.name}</div>
                    {(['todo', 'in-progress', 'review', 'bottleneck', 'complete'] as const).map((key) => (
                      <div key={key} className="flex justify-between gap-3">
                        <span className="capitalize">{key.replace('-', ' ')}</span>
                        <span>{buckets[key]} ({Math.round((buckets[key] / total) * 100)}%)</span>
                      </div>
                    ))}
                  </TooltipContent>
                </Tooltip>
                <div className="flex justify-between mt-1.5 text-[9px] text-[#666]">
                  <span>{Math.round((buckets.complete / total) * 100)}% done</span>
                  {buckets.bottleneck > 0 && <span className="text-red-500 font-medium">{buckets.bottleneck} blocked</span>}
                </div>
              </motion.div>
            ))}
            {deptRollup.length === 0 && (
              <div className="text-[11px] text-[#666] py-2">No task data for the current project filter.</div>
            )}
          </div>
        </TooltipProvider>
      </div>

      {/* Filters row 1 */}
      <div className="flex items-center gap-3 p-3 bg-[#111] border border-[#333] rounded-sm mb-2 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
          <Input
            placeholder="Search shot, sequence, or episode..."
            className="pl-9 h-9 bg-[#1a1a1a] border-[#333] text-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-48 h-9 bg-[#1a1a1a] border-[#333] text-white"><SelectValue placeholder="Project" /></SelectTrigger>
          <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
            <SelectItem value="all">All Projects</SelectItem>
            {PROJECTS.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex bg-[#1a1a1a] p-0.5 rounded-sm border border-[#333]">
          <Button
            variant={view === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('list')}
            className={`h-8 px-3 shadow-none ${view === 'list' ? 'bg-[#333] text-white' : 'text-[#888]'}`}
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            variant={view === 'card' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('card')}
            className={`h-8 px-3 shadow-none ${view === 'card' ? 'bg-[#333] text-white' : 'text-[#888]'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowFilterControls((v) => !v)}
          title={showFilterControls ? 'Hide grouping & sort filters' : 'Show grouping & sort filters'}
          className={`h-9 w-9 hover:text-white ${showFilterControls ? 'text-white bg-[#252525]' : 'text-[#888]'}`}
        >
          <Filter className="w-4 h-4" />
        </Button>
      </div>

      {/* Filters row 2: grouping, sorting, saved views */}
      <AnimatePresence initial={false}>
        {showFilterControls && (
          <motion.div
            key="filter-controls"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={cut.transition}
            className="overflow-hidden shrink-0"
          >
            <div className="flex items-center gap-3 p-3 bg-[#111] border border-[#333] rounded-sm mb-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#666]" />
                <Select value={groupBy1} onValueChange={(v) => setGroupBy1(v as TrackingGroupKey)}>
                  <SelectTrigger className="w-[150px] h-8 bg-[#1a1a1a] border-[#333] text-white text-[12px]"><SelectValue placeholder="Group by" /></SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                    {GROUP_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <AnimatePresence>
                  {groupBy1 !== 'none' && (
                    <motion.div
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 'auto', opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="flex items-center gap-1.5 overflow-hidden"
                    >
                      <ChevronRight className="w-3.5 h-3.5 text-[#555] shrink-0" />
                      <Select value={groupBy2} onValueChange={(v) => setGroupBy2(v as TrackingGroupKey)}>
                        <SelectTrigger className="w-[150px] h-8 bg-[#1a1a1a] border-[#333] text-white text-[12px]"><SelectValue placeholder="Then by" /></SelectTrigger>
                        <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                          {GROUP_OPTIONS.filter((o) => o.value === 'none' || o.value !== groupBy1).map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="w-px h-6 bg-[#333]" />

              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-[#666]" />
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as TrackingSortKey)}>
                  <SelectTrigger className="w-[168px] h-8 bg-[#1a1a1a] border-[#333] text-white text-[12px]"><SelectValue placeholder="Sort by" /></SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                    {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 border-[#333] text-[#ccc] gap-1.5">
                    <Bookmark className="w-3.5 h-3.5" />
                    <span className="max-w-[120px] truncate">{activeView ? activeView.name : 'Saved Views'}</span>
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 bg-[#1a1a1a] border-[#333] text-white">
                  <DropdownMenuLabel className="text-[#888] text-[10px] uppercase tracking-wide">Saved Views</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-[#333]" />
                  {savedViews.length === 0 && (
                    <div className="px-2 py-3 text-[11px] text-[#666]">No saved views yet. Set your filters, then click Save View.</div>
                  )}
                  {savedViews.map((v) => (
                    <DropdownMenuItem
                      key={v.id}
                      onClick={() => applyView(v.id)}
                      className={`flex items-center justify-between gap-2 cursor-pointer ${activeViewId === v.id ? 'bg-[#252525] text-white' : ''}`}
                    >
                      <span className="truncate">{v.name}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteView(v.id, v.name); }}
                        className="text-[#666] hover:text-red-400 shrink-0 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Popover open={saveViewOpen} onOpenChange={setSaveViewOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 border-[#333] text-[#ccc] gap-1.5">
                    <BookmarkPlus className="w-3.5 h-3.5" /> Save View
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 bg-[#161616] border-[#333] text-white">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold">Save current view</div>
                    <p className="text-[11px] text-[#888]">Saves your search, filters, grouping and sort order so you can jump back anytime.</p>
                    <Input
                      autoFocus
                      placeholder="e.g. Animation Bottlenecks"
                      value={newViewName}
                      onChange={(e) => setNewViewName(e.target.value)}
                      className="h-8 bg-[#1a1a1a] border-[#333] text-white text-[12px]"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveView(); }}
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <Button size="sm" variant="ghost" className="h-7 text-[#888]" onClick={() => setSaveViewOpen(false)}>Cancel</Button>
                      <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveView} disabled={!newViewName.trim()}>Save</Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid */}
      {view === 'list' ? (
        <div className="flex-1 border border-[#333] rounded-sm overflow-hidden flex flex-col bg-[#0f0f0f]">
          <div className="overflow-auto flex-1">
            <div style={{ minWidth: '1480px' }} className="text-[12px]">
              <div className="grid sticky top-0 z-10 bg-[#1e237e] text-white shadow-sm font-medium" style={{ gridTemplateColumns: GRID_COLS }}>
                <div className={`${CELL_CENTER} bg-[#1e237e]`}>No</div>
                <div className={`${CELL} bg-[#1e237e]`}>Project</div>
                <div className={`${CELL} bg-[#1e237e]`}>Episode</div>
                <div className={`${CELL} bg-[#1e237e]`}>Sequence</div>
                <div className={`${CELL} bg-[#1e237e]`}>Shot</div>
                <div className={`${CELL} bg-[#1e237e]`}>Assignee</div>
                <div className={`${CELL_CENTER} bg-[#1e237e]`}>Status</div>
                <div className={`${CELL_CENTER} bg-[#1e237e]`}>USD Version</div>
                <div className={`${CELL_CENTER} bg-[#1e237e]`}>Internal Review</div>
                <div className={`${CELL_CENTER} bg-[#1e237e]`}>Client Review</div>
                <div className={`${CELL_CENTER} bg-[#1e237e]`}>Production Notes</div>
              </div>
              <div className="bg-[#1a1a1a]">
                {groupTree
                  ? groupTree.map((node) => (
                    <GroupSection
                      key={node.key}
                      node={node}
                      depth={0}
                      path={node.key}
                      collapsedKeys={collapsedKeys}
                      toggleGroup={toggleGroup}
                      view="list"
                      renderListRow={renderListRow}
                      renderCard={renderCard}
                    />
                  ))
                  : renderLeaves(trackingData, 'list', renderListRow, renderCard)}
                {trackingData.length === 0 && (
                  <div className="text-center p-8 text-muted-foreground">
                    No tracking data found matching the filters.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-[#0f0f0f] border border-[#333] rounded-sm">
          {groupTree
            ? groupTree.map((node) => (
              <GroupSection
                key={node.key}
                node={node}
                depth={0}
                path={node.key}
                collapsedKeys={collapsedKeys}
                toggleGroup={toggleGroup}
                view="card"
                renderListRow={renderListRow}
                renderCard={renderCard}
              />
            ))
            : renderLeaves(trackingData, 'card', renderListRow, renderCard)}
          {trackingData.length === 0 && (
            <div className="text-center p-8 text-muted-foreground">
              No tracking data found matching the filters.
            </div>
          )}
        </div>
      )}

      {/* Footer Stats */}
      <div className="bg-[#111] border-t border-[#333] p-2 flex justify-between items-center text-xs text-[#888]">
        <div>Showing {trackingData.length} entries</div>
        <div className="flex gap-4">
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Approved: {trackingData.filter((d) => d.clientReview === 'approved').length}</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500"></div> Pending: {trackingData.filter((d) => d.clientReview === 'pending').length}</span>
        </div>
      </div>
    </div>
  );
}

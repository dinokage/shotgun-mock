# Task Drawer Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `TaskDrawer.tsx`'s decorative UI actions (checklist toggle, comments, reassignment, approve/reject, start task, log-time navigation) to the real Zustand store mutations that already exist for most of them — closing the single largest concrete "looks interactive but doesn't persist" gap found in the ftrack-parity codebase audit (see `docs/superpowers/specs/2026-08-12-forge-ftrack-parity-design.md`, Phase A).

**Architecture:** `artifacts/forge/src/components/shared/TaskDrawer.tsx` is already a single, well-built, reused-everywhere component (wired into `AppShell`, `home.tsx`, `tasks.tsx`, `scheduling.tsx`, `profile.tsx` via `useUIStore`'s `activeTaskDrawer` id) — it does **not** need to be rebuilt or unified, contrary to earlier framing in the spec. Its problem is narrower: six of its interactive elements only call `toast()` instead of the corresponding `useTasksStore` action, and one (`toggleChecklistItem`) doesn't exist yet in the store at all. This plan adds that one store action and rewires six existing `onClick` handlers to call real store mutations before showing their toast, so state changes actually persist (the `tasks` store already uses Zustand's `persist` middleware to `localStorage`). `artifacts/forge` currently has **zero test infrastructure** — no Vitest config, no test files — so Task 1 adds it, since every subsequent task needs to write a real test.

**Tech Stack:** Vitest, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom, Zustand (existing), wouter (existing, for Task 7's navigation).

## Global Constraints

- pnpm workspace: run `pnpm install` from the repo root after any `package.json` change, never `npm install`.
- `pnpm-workspace.yaml` enforces a 24-hour `minimumReleaseAge` on new npm packages (supply-chain safety guard) — **never disable it**. If a pinned version in this plan gets rejected as "too new," relax that package's version range rather than touching the setting.
- All code is TypeScript and must pass `artifacts/forge`'s `typecheck` script: `tsc -p artifacts/forge/tsconfig.json --noEmit` (run from repo root, or `pnpm --filter @workspace/forge run typecheck`).
- Match existing conventions: Zustand actions are plain functions on the store returning `void`, using `set((state) => ({ tasks: state.tasks.map(...) }))` immutable-update style (see `updateTaskStatus`, `reassignTask` in `artifacts/forge/src/store/tasks.ts` for the pattern to copy). User feedback uses `useToast()` from `@/hooks/use-toast`, fired **after** a real store mutation, never standalone.
- `artifacts/forge/tsconfig.json` currently excludes `**/*.test.ts` but not `**/*.test.tsx` — Task 1 fixes this, since this plan's test files are `.tsx` (they render React components).

---

### Task 1: Add Vitest + Testing Library infrastructure to `artifacts/forge`

**Files:**
- Modify: `artifacts/forge/package.json`
- Modify: `artifacts/forge/tsconfig.json`
- Create: `artifacts/forge/vitest.config.ts`
- Create: `artifacts/forge/src/test/setup.ts`
- Create: `artifacts/forge/src/test/smoke.test.tsx`

**Interfaces:**
- Produces: a working `pnpm --filter @workspace/forge run test` command; a `src/test/setup.ts` every later test file implicitly relies on via Vitest's `setupFiles` config (no explicit import needed).

- [ ] **Step 1: Add test devDependencies to `artifacts/forge/package.json`**

Add these entries into the existing `"devDependencies"` object (keep everything else in the file unchanged):

```json
    "vitest": "^3.2.4",
    "@testing-library/react": "^16.3.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/user-event": "^14.5.2",
    "jsdom": "^25.0.1",
```

- [ ] **Step 2: Add test scripts to `artifacts/forge/package.json`**

In the existing `"scripts"` object, add:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Install**

Run: `pnpm install` (from repo root)
Expected: exits 0, lockfile updates to include the new devDependencies.

- [ ] **Step 4: Create `artifacts/forge/vitest.config.ts`**

```typescript
import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 5: Create `artifacts/forge/src/test/setup.ts`**

```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: Update `artifacts/forge/tsconfig.json`'s exclude list to also skip `.test.tsx` files from the production typecheck**

Change:
```json
  "exclude": ["node_modules", "build", "dist", "**/*.test.ts"],
```
to:
```json
  "exclude": ["node_modules", "build", "dist", "**/*.test.ts", "**/*.test.tsx"],
```

- [ ] **Step 7: Write a smoke test — `artifacts/forge/src/test/smoke.test.tsx`**

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('test infrastructure smoke test', () => {
  it('renders a component and finds it via Testing Library', () => {
    render(<div>ok</div>);
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run it**

Run: `pnpm --filter @workspace/forge run test`
Expected: `1 passed`, exits 0.

- [ ] **Step 9: Verify typecheck still passes with the tsconfig change**

Run: `pnpm --filter @workspace/forge run typecheck`
Expected: exits 0, no errors (the smoke test file must NOT appear in its output, since it's now excluded).

- [ ] **Step 10: Commit**

```bash
git add artifacts/forge/package.json artifacts/forge/tsconfig.json artifacts/forge/vitest.config.ts artifacts/forge/src/test/setup.ts artifacts/forge/src/test/smoke.test.tsx pnpm-lock.yaml
git commit -m "chore: add Vitest + Testing Library to artifacts/forge"
```

---

### Task 2: Wire the checklist toggle

**Files:**
- Modify: `artifacts/forge/src/store/tasks.ts`
- Modify: `artifacts/forge/src/components/shared/TaskDrawer.tsx`
- Create: `artifacts/forge/src/store/tasks.test.ts`
- Create: `artifacts/forge/src/components/shared/TaskDrawer.test.tsx`

**Interfaces:**
- Consumes: `Task` type from `@/data/mockData` (`checklist: { text: string; done: boolean }[]` field, confirmed at `artifacts/forge/src/data/mockData.ts:197`).
- Produces: `useTasksStore.getState().toggleChecklistItem(taskId: string, index: number): void` — later tasks in this plan don't depend on it, but it's the pattern Task 3–6 copy.

Currently, `TaskDrawer.tsx`'s checklist items (lines 299–310) render a `Circle`/`CheckCircle2` icon with `cursor-pointer hover:text-foreground` styling but **no `onClick` at all** — clicking does nothing.

- [ ] **Step 1: Write the failing store test — `artifacts/forge/src/store/tasks.test.ts`**

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { useTasksStore } from './tasks';
import type { Task } from '@/data/mockData';

const baseTask: Task = {
  id: 'test-task-1',
  title: 'Test task',
  description: '',
  projectId: 'p1',
  assigneeId: 'u1',
  assignedById: 'u2',
  status: 'in-progress',
  priority: 'medium',
  dueDate: '2026-01-01',
  estimatedHours: 8,
  actualHours: 0,
  tags: [],
  dependencies: [],
  checklist: [
    { text: 'First step', done: false },
    { text: 'Second step', done: false },
  ],
  comments: [],
  attachments: [],
  department: 'Compositing',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastStatusUpdate: '2026-01-01T00:00:00.000Z',
  dailyLogs: [],
  pipelinePhase: 'comp',
};

describe('useTasksStore.toggleChecklistItem', () => {
  beforeEach(() => {
    useTasksStore.setState({ tasks: [baseTask] });
  });

  it('flips a checklist item from not-done to done', () => {
    useTasksStore.getState().toggleChecklistItem('test-task-1', 0);
    const updated = useTasksStore.getState().tasks.find((t) => t.id === 'test-task-1');
    expect(updated?.checklist[0].done).toBe(true);
    expect(updated?.checklist[1].done).toBe(false);
  });

  it('flips it back to not-done on a second toggle', () => {
    useTasksStore.getState().toggleChecklistItem('test-task-1', 0);
    useTasksStore.getState().toggleChecklistItem('test-task-1', 0);
    const updated = useTasksStore.getState().tasks.find((t) => t.id === 'test-task-1');
    expect(updated?.checklist[0].done).toBe(false);
  });

  it('does not affect other tasks', () => {
    useTasksStore.setState({
      tasks: [baseTask, { ...baseTask, id: 'test-task-2', checklist: [{ text: 'x', done: false }] }],
    });
    useTasksStore.getState().toggleChecklistItem('test-task-1', 0);
    const other = useTasksStore.getState().tasks.find((t) => t.id === 'test-task-2');
    expect(other?.checklist[0].done).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @workspace/forge run test -- tasks.test.ts`
Expected: FAIL — `toggleChecklistItem is not a function` (TypeScript compile error under Vitest, or runtime `TypeError`).

- [ ] **Step 3: Add `toggleChecklistItem` to the store**

In `artifacts/forge/src/store/tasks.ts`, add to the `TaskState` interface (after `addComment`):

```typescript
  toggleChecklistItem: (taskId: string, index: number) => void;
```

Add to the store implementation (after the `addComment` implementation, before the closing `}),` of the `persist` callback):

```typescript
      toggleChecklistItem: (taskId, index) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  checklist: t.checklist.map((item, i) =>
                    i === index ? { ...item, done: !item.done } : item
                  ),
                }
              : t
          ),
        })),
```

- [ ] **Step 4: Run the store test to verify it passes**

Run: `pnpm --filter @workspace/forge run test -- tasks.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Write the failing component test — `artifacts/forge/src/components/shared/TaskDrawer.test.tsx`**

```tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskDrawer } from './TaskDrawer';
import { useTasksStore } from '@/store/tasks';
import { useUIStore } from '@/store/ui';
import { useAuthStore } from '@/store/auth';
import { USERS } from '@/data/mockData';
import type { Task } from '@/data/mockData';

const testTask: Task = {
  id: 'drawer-test-task',
  title: 'Comp the hero shot',
  description: 'Composite BG plate',
  projectId: USERS[0] ? 'p1' : 'p1',
  assigneeId: USERS[0].id,
  assignedById: USERS[0].id,
  status: 'in-progress',
  priority: 'medium',
  dueDate: '2026-01-01',
  estimatedHours: 8,
  actualHours: 2,
  tags: [],
  dependencies: [],
  checklist: [{ text: 'Rough comp', done: false }],
  comments: [],
  attachments: [],
  department: 'Compositing',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastStatusUpdate: '2026-01-01T00:00:00.000Z',
  dailyLogs: [],
  pipelinePhase: 'comp',
};

describe('TaskDrawer', () => {
  beforeEach(() => {
    useTasksStore.setState({ tasks: [testTask] });
    useUIStore.setState({ activeTaskDrawer: 'drawer-test-task' });
    useAuthStore.setState({ currentUser: USERS[0], isAuthenticated: true });
  });

  it('toggles a checklist item when clicked', async () => {
    const user = userEvent.setup();
    render(<TaskDrawer />);

    const checklistRow = screen.getByText('Rough comp').closest('div')!;
    const icon = checklistRow.querySelector('svg')!;
    await user.click(icon);

    const updated = useTasksStore.getState().tasks.find((t) => t.id === 'drawer-test-task');
    expect(updated?.checklist[0].done).toBe(true);
  });
});
```

`useAuthStore`'s state shape is confirmed as `{ currentUser: User | null; isAuthenticated: boolean; ... }` (`artifacts/forge/src/store/auth.ts:6-14`), matching the `setState` call above exactly.

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @workspace/forge run test -- TaskDrawer.test.tsx`
Expected: FAIL — the click has no effect because there's no `onClick` handler yet, so `checklist[0].done` stays `false`.

- [ ] **Step 7: Wire the click handler in `TaskDrawer.tsx`**

Destructure the new action alongside the existing ones (near the top of the component body):

```typescript
  const toggleChecklistItem = useTasksStore(state => state.toggleChecklistItem);
```

Replace the checklist item rendering block (currently lines 300–309):

```tsx
                {task.checklist.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {item.done ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground shrink-0 cursor-pointer hover:text-foreground" />
                    )}
                    <span className={item.done ? 'text-muted-foreground line-through' : ''}>{item.text}</span>
                  </div>
                ))}
```

with:

```tsx
                {task.checklist.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {item.done ? (
                      <CheckCircle2
                        className="w-4 h-4 text-green-500 shrink-0 cursor-pointer"
                        onClick={() => toggleChecklistItem(task.id, i)}
                      />
                    ) : (
                      <Circle
                        className="w-4 h-4 text-muted-foreground shrink-0 cursor-pointer hover:text-foreground"
                        onClick={() => toggleChecklistItem(task.id, i)}
                      />
                    )}
                    <span className={item.done ? 'text-muted-foreground line-through' : ''}>{item.text}</span>
                  </div>
                ))}
```

- [ ] **Step 8: Run the component test to verify it passes**

Run: `pnpm --filter @workspace/forge run test -- TaskDrawer.test.tsx`
Expected: `1 passed`.

- [ ] **Step 9: Run the full test suite and typecheck**

Run: `pnpm --filter @workspace/forge run test && pnpm --filter @workspace/forge run typecheck`
Expected: all tests pass, typecheck exits 0.

- [ ] **Step 10: Commit**

```bash
git add artifacts/forge/src/store/tasks.ts artifacts/forge/src/store/tasks.test.ts artifacts/forge/src/components/shared/TaskDrawer.tsx artifacts/forge/src/components/shared/TaskDrawer.test.tsx
git commit -m "feat: wire TaskDrawer checklist toggle to real store mutation"
```

---

### Task 3: Wire "Post Comment" to `addComment`

**Files:**
- Modify: `artifacts/forge/src/components/shared/TaskDrawer.tsx`
- Modify: `artifacts/forge/src/components/shared/TaskDrawer.test.tsx`

**Interfaces:**
- Consumes: `useTasksStore.getState().addComment(taskId: string, userId: string, text: string): void` — already exists at `artifacts/forge/src/store/tasks.ts:60-73`, currently unused by any page.

Currently (lines 412–424), clicking "Post Comment" only calls `toast(...)` and clears the input — the comment is never added to `task.comments`, so it disappears on drawer close.

- [ ] **Step 1: Add a failing test to `TaskDrawer.test.tsx`**

```tsx
  it('posts a comment and adds it to the task', async () => {
    const user = userEvent.setup();
    render(<TaskDrawer />);

    const textarea = screen.getByPlaceholderText('Add a comment... (Type @ to mention)');
    await user.type(textarea, 'Looks good, approving soon.');
    await user.click(screen.getByRole('button', { name: 'Post Comment' }));

    const updated = useTasksStore.getState().tasks.find((t) => t.id === 'drawer-test-task');
    expect(updated?.comments).toHaveLength(1);
    expect(updated?.comments[0].text).toBe('Looks good, approving soon.');
    expect(updated?.comments[0].userId).toBe(USERS[0].id);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @workspace/forge run test -- TaskDrawer.test.tsx`
Expected: FAIL — `updated?.comments` is still empty.

- [ ] **Step 3: Wire the handler**

Destructure `addComment`:

```typescript
  const addComment = useTasksStore(state => state.addComment);
```

Replace the "Post Comment" button's `onClick` (currently lines 415–421):

```tsx
                  onClick={() => {
                    if (commentText.trim()) {
                      toast({ title: 'Comment Posted', description: 'Your comment has been added.' });
                      setCommentText('');
                      setShowMentions(false);
                    }
                  }}
```

with:

```tsx
                  onClick={() => {
                    if (commentText.trim()) {
                      addComment(task.id, currentUser.id, commentText.trim());
                      toast({ title: 'Comment Posted', description: 'Your comment has been added.' });
                      setCommentText('');
                      setShowMentions(false);
                    }
                  }}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/forge run test -- TaskDrawer.test.tsx`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add artifacts/forge/src/components/shared/TaskDrawer.tsx artifacts/forge/src/components/shared/TaskDrawer.test.tsx
git commit -m "feat: wire TaskDrawer comment posting to real store mutation"
```

---

### Task 4: Wire Reassign and Revoke Assignment to `reassignTask`

**Files:**
- Modify: `artifacts/forge/src/components/shared/TaskDrawer.tsx`
- Modify: `artifacts/forge/src/components/shared/TaskDrawer.test.tsx`

**Interfaces:**
- Consumes: `useTasksStore.getState().reassignTask(taskId: string, assigneeId: string): void` — already exists at `artifacts/forge/src/store/tasks.ts:56-59`.

Currently (lines 156–168), both the per-user "Reassign" dropdown items and the "Revoke Assignment" item only call `toast(...)`.

- [ ] **Step 1: Add failing tests to `TaskDrawer.test.tsx`**

```tsx
  it('reassigns the task when a roster member is picked from the Reassign menu', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ currentUser: { ...USERS[0], role: 'lead' }, isAuthenticated: true });
    const otherUser = USERS.find((u) => u.id !== USERS[0].id)!;
    useTasksStore.setState({
      tasks: [{ ...testTask, department: 'Compositing' }],
    });
    render(<TaskDrawer />);

    await user.click(screen.getByText('Reassign'));
    await user.click(screen.getByText(otherUser.name));

    const updated = useTasksStore.getState().tasks.find((t) => t.id === 'drawer-test-task');
    expect(updated?.assigneeId).toBe(otherUser.id);
  });

  it('revokes assignment when "Revoke Assignment" is clicked', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ currentUser: { ...USERS[0], role: 'lead' }, isAuthenticated: true });
    render(<TaskDrawer />);

    await user.click(screen.getByText('Reassign'));
    await user.click(screen.getByText('Revoke Assignment'));

    const updated = useTasksStore.getState().tasks.find((t) => t.id === 'drawer-test-task');
    expect(updated?.assigneeId).toBe('');
  });
```

These tests require `currentUser.role === 'lead'` to make the "Reassign" trigger visible (per the `isLeadership` check at line 88) — confirmed against `User.role: Role` in `mockData.ts:61`. The dropdown's roster filter (`USERS.filter(u => u.departmentId === currentDept?.id ...)`, line 155) resolves `currentDept` from `task.department` (a plain string, e.g. `'Compositing'`) via `DEPARTMENTS.find(d => d.name === task.department)` — since `testTask.department` is already `'Compositing'` and real `USERS`/`DEPARTMENTS` mock data is used (not stubbed), the roster filter naturally returns real candidates as long as at least one seeded user has a matching `departmentId`, which the real mock data guarantees.

- [ ] **Step 2: Run to verify both fail**

Run: `pnpm --filter @workspace/forge run test -- TaskDrawer.test.tsx`
Expected: FAIL — `assigneeId` unchanged in both cases.

- [ ] **Step 3: Wire the handlers**

Destructure `reassignTask`:

```typescript
  const reassignTask = useTasksStore(state => state.reassignTask);
```

Replace the per-user dropdown item's `onClick` (currently lines 156–158):

```tsx
                          <DropdownMenuItem key={u.id} className="text-xs gap-2 cursor-pointer" onClick={() => {
                            toast({ title: "Task Reassigned", description: `Task assigned to ${u.name}` });
                          }}>
```

with:

```tsx
                          <DropdownMenuItem key={u.id} className="text-xs gap-2 cursor-pointer" onClick={() => {
                            reassignTask(task.id, u.id);
                            toast({ title: "Task Reassigned", description: `Task assigned to ${u.name}` });
                          }}>
```

Replace the "Revoke Assignment" item's `onClick` (currently lines 164–166):

```tsx
                        <DropdownMenuItem className="text-xs text-red-500 cursor-pointer" onClick={() => {
                          toast({ title: "Task Revoked", description: "Task is now unassigned", variant: "destructive" });
                        }}>
```

with:

```tsx
                        <DropdownMenuItem className="text-xs text-red-500 cursor-pointer" onClick={() => {
                          reassignTask(task.id, '');
                          toast({ title: "Task Revoked", description: "Task is now unassigned", variant: "destructive" });
                        }}>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @workspace/forge run test -- TaskDrawer.test.tsx`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add artifacts/forge/src/components/shared/TaskDrawer.tsx artifacts/forge/src/components/shared/TaskDrawer.test.tsx
git commit -m "feat: wire TaskDrawer reassign/revoke to real store mutation"
```

---

### Task 5: Wire Lead and Manager Approve/Reject buttons to `updateTaskStatus`

**Files:**
- Modify: `artifacts/forge/src/components/shared/TaskDrawer.tsx`
- Modify: `artifacts/forge/src/components/shared/TaskDrawer.test.tsx`

**Interfaces:**
- Consumes: `useTasksStore.getState().updateTaskStatus(taskId: string, status: TaskStatus): void` — already exists at `artifacts/forge/src/store/tasks.ts:32-39`. `TaskStatus` is defined at `artifacts/forge/src/data/mockData.ts:179`.

Status transitions for this task (chosen from the existing `TaskStatus` union — no new status values are added):
- Lead **Approve** → `'manager-review'`
- Lead **Reject** → `'in-progress'` (sent back to the artist)
- Manager **Approve & Publish** → `'complete'`
- Manager **Reject** → `'in-progress'` (sent back to the team)

Currently (lines 233–262), all four buttons only call `toast(...)`.

- [ ] **Step 1: Add failing tests to `TaskDrawer.test.tsx`**

```tsx
  it('lead approve moves the task to manager-review', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ currentUser: { ...USERS[0], role: 'lead' }, isAuthenticated: true });
    render(<TaskDrawer />);

    await user.click(screen.getByText('Approve'));

    const updated = useTasksStore.getState().tasks.find((t) => t.id === 'drawer-test-task');
    expect(updated?.status).toBe('manager-review');
  });

  it('lead reject sends the task back to in-progress', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ currentUser: { ...USERS[0], role: 'lead' }, isAuthenticated: true });
    useTasksStore.setState({ tasks: [{ ...testTask, status: 'lead-review' }] });
    render(<TaskDrawer />);

    await user.click(screen.getByText('Reject'));

    const updated = useTasksStore.getState().tasks.find((t) => t.id === 'drawer-test-task');
    expect(updated?.status).toBe('in-progress');
  });

  it('manager approve & publish marks the task complete', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ currentUser: { ...USERS[0], role: 'vfx_producer' }, isAuthenticated: true });
    render(<TaskDrawer />);

    await user.click(screen.getByText('Approve & Publish'));

    const updated = useTasksStore.getState().tasks.find((t) => t.id === 'drawer-test-task');
    expect(updated?.status).toBe('complete');
  });

  it('manager reject sends the task back to in-progress', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ currentUser: { ...USERS[0], role: 'vfx_producer' }, isAuthenticated: true });
    useTasksStore.setState({ tasks: [{ ...testTask, status: 'manager-review' }] });
    render(<TaskDrawer />);

    await user.click(screen.getByText('Reject'));

    const updated = useTasksStore.getState().tasks.find((t) => t.id === 'drawer-test-task');
    expect(updated?.status).toBe('in-progress');
  });
```

Note: both lead and manager sections render a "Reject" button, so once both are wired, a test targeting one must render the drawer as only that role (as the tests above already do via `currentUser.role`) — `getByText('Reject')` will only match one at a time since each role's action bar is conditionally rendered.

- [ ] **Step 2: Run to verify all four fail**

Run: `pnpm --filter @workspace/forge run test -- TaskDrawer.test.tsx`
Expected: FAIL — `status` unchanged in all four.

- [ ] **Step 3: Wire the handlers**

Destructure `updateTaskStatus`:

```typescript
  const updateTaskStatus = useTasksStore(state => state.updateTaskStatus);
```

Replace the Lead Actions block's two `onClick`s (currently lines 235–244):

```tsx
                  <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" onClick={() => {
                    toast({ title: "Approved for Manager", description: `Sent to Production.` });
                  }}>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
                  </Button>
                  <Button variant="outline" className="flex-1 text-red-500 hover:bg-red-500/10" onClick={() => {
                    toast({ title: "Review Rejected", description: `Sent back to artist.` });
                  }}>
                    <X className="w-4 h-4 mr-2" /> Reject
                  </Button>
```

with:

```tsx
                  <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" onClick={() => {
                    updateTaskStatus(task.id, 'manager-review');
                    toast({ title: "Approved for Manager", description: `Sent to Production.` });
                  }}>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
                  </Button>
                  <Button variant="outline" className="flex-1 text-red-500 hover:bg-red-500/10" onClick={() => {
                    updateTaskStatus(task.id, 'in-progress');
                    toast({ title: "Review Rejected", description: `Sent back to artist.` });
                  }}>
                    <X className="w-4 h-4 mr-2" /> Reject
                  </Button>
```

Replace the Manager Actions block's two `onClick`s (currently lines 251–260):

```tsx
                  <Button className="flex-1 bg-[#1E7A34] hover:bg-[#1E7A34]/90 text-white" onClick={() => {
                    toast({ title: "Published", description: `Published to production dashboard.` });
                  }}>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Approve & Publish
                  </Button>
                  <Button variant="outline" className="flex-1 text-red-500 hover:bg-red-500/10" onClick={() => {
                    toast({ title: "Review Rejected", description: `Sent back to team.` });
                  }}>
                    <X className="w-4 h-4 mr-2" /> Reject
                  </Button>
```

with:

```tsx
                  <Button className="flex-1 bg-[#1E7A34] hover:bg-[#1E7A34]/90 text-white" onClick={() => {
                    updateTaskStatus(task.id, 'complete');
                    toast({ title: "Published", description: `Published to production dashboard.` });
                  }}>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Approve & Publish
                  </Button>
                  <Button variant="outline" className="flex-1 text-red-500 hover:bg-red-500/10" onClick={() => {
                    updateTaskStatus(task.id, 'in-progress');
                    toast({ title: "Review Rejected", description: `Sent back to team.` });
                  }}>
                    <X className="w-4 h-4 mr-2" /> Reject
                  </Button>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @workspace/forge run test -- TaskDrawer.test.tsx`
Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add artifacts/forge/src/components/shared/TaskDrawer.tsx artifacts/forge/src/components/shared/TaskDrawer.test.tsx
git commit -m "feat: wire TaskDrawer lead/manager approve-reject to real store mutation"
```

---

### Task 6: Wire "Start Task" to `updateTaskStatus`

**Files:**
- Modify: `artifacts/forge/src/components/shared/TaskDrawer.tsx`
- Modify: `artifacts/forge/src/components/shared/TaskDrawer.test.tsx`

**Interfaces:**
- Consumes: `updateTaskStatus` (already destructured in Task 5).

Currently (lines 218–230), when the assignee's status is `'not-started'`/`'todo'` (not yet `'in-progress'`), clicking the button only calls `toast({ title: 'Task Started' })` — the status never actually changes to `'in-progress'`, so the button keeps showing "Start Task" forever.

- [ ] **Step 1: Add a failing test to `TaskDrawer.test.tsx`**

```tsx
  it('moves a not-started task to in-progress when "Start Task" is clicked', async () => {
    const user = userEvent.setup();
    useTasksStore.setState({ tasks: [{ ...testTask, status: 'not-started' }] });
    render(<TaskDrawer />);

    await user.click(screen.getByText('Start Task'));

    const updated = useTasksStore.getState().tasks.find((t) => t.id === 'drawer-test-task');
    expect(updated?.status).toBe('in-progress');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @workspace/forge run test -- TaskDrawer.test.tsx`
Expected: FAIL — `status` stays `'not-started'`.

- [ ] **Step 3: Wire the handler**

Replace the assignee action button's `onClick` (currently lines 219–226):

```tsx
                <Button className="flex-1" variant={task.status === 'in-progress' ? 'default' : 'outline'} onClick={() => {
                  if (task.status === 'in-progress') {
                    submitForReview(task.id);
                    toast({ title: 'Submitted for Lead Review' });
                  } else {
                    toast({ title: 'Task Started' });
                  }
                }}>
```

with:

```tsx
                <Button className="flex-1" variant={task.status === 'in-progress' ? 'default' : 'outline'} onClick={() => {
                  if (task.status === 'in-progress') {
                    submitForReview(task.id);
                    toast({ title: 'Submitted for Lead Review' });
                  } else {
                    updateTaskStatus(task.id, 'in-progress');
                    toast({ title: 'Task Started' });
                  }
                }}>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/forge run test -- TaskDrawer.test.tsx`
Expected: `9 passed`.

- [ ] **Step 5: Commit**

```bash
git add artifacts/forge/src/components/shared/TaskDrawer.tsx artifacts/forge/src/components/shared/TaskDrawer.test.tsx
git commit -m "feat: wire TaskDrawer Start Task button to real store mutation"
```

---

### Task 7: Wire "Log Daily Time" to navigate to the Timesheets page

**Files:**
- Modify: `artifacts/forge/src/components/shared/TaskDrawer.tsx`
- Modify: `artifacts/forge/src/components/shared/TaskDrawer.test.tsx`

**Interfaces:**
- Consumes: `useLocation` from `wouter` (already used elsewhere in the app, e.g. `artifacts/forge/src/App.tsx:52`) — `const [, setLocation] = useLocation();` gives a `setLocation(path: string): void` navigator.
- Consumes: `useUIStore.getState().setActiveTaskDrawer(taskId: string | null): void` — already exists, used to close the drawer on navigate.

Currently (lines 264–269), clicking "Log Daily Time" only calls `toast({ title: 'Log Daily Time', description: 'Redirecting to time logging...' })` — it says "Redirecting" but never actually navigates anywhere.

- [ ] **Step 1: Add a failing test to `TaskDrawer.test.tsx`**

This test needs the component wrapped in a `wouter` `Router` so `useLocation` works in jsdom. Add this import at the top of the test file:

```tsx
import { Router } from 'wouter';
import memoryLocation from 'wouter/memory-location';
```

Add the test:

```tsx
  it('navigates to /timesheets and closes the drawer when "Log Daily Time" is clicked', async () => {
    const user = userEvent.setup();
    const { hook } = memoryLocation({ path: '/', record: true });
    render(
      <Router hook={hook}>
        <TaskDrawer />
      </Router>
    );

    await user.click(screen.getByText('Log Daily Time'));

    expect(hook().path).toBe('/timesheets');
    expect(useUIStore.getState().activeTaskDrawer).toBeNull();
  });
```

Import `useUIStore` at the top of the test file if not already imported (it already is, from Task 2's setup).

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @workspace/forge run test -- TaskDrawer.test.tsx`
Expected: FAIL — path stays `/`, drawer stays open.

- [ ] **Step 3: Wire the handler**

Add the `wouter` import near the top of `TaskDrawer.tsx` (alongside the existing imports):

```typescript
import { useLocation } from 'wouter';
```

Destructure the navigator inside the component body (alongside the other hooks):

```typescript
  const [, setLocation] = useLocation();
```

Replace the "Log Daily Time" button's `onClick` (currently lines 264–268):

```tsx
                <Button variant="outline" className="flex-1 bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20" onClick={() => {
                  toast({ title: 'Log Daily Time', description: 'Redirecting to time logging...' });
                }}>
```

with:

```tsx
                <Button variant="outline" className="flex-1 bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20" onClick={() => {
                  setActiveTaskDrawer(null);
                  setLocation('/timesheets');
                }}>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/forge run test -- TaskDrawer.test.tsx`
Expected: `10 passed`.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `pnpm --filter @workspace/forge run test && pnpm --filter @workspace/forge run typecheck && pnpm --filter @workspace/forge run build`
Expected: all pass, build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add artifacts/forge/src/components/shared/TaskDrawer.tsx artifacts/forge/src/components/shared/TaskDrawer.test.tsx
git commit -m "feat: wire TaskDrawer Log Daily Time button to navigate to Timesheets"
```

---

## Self-review notes (completed during plan authoring)

- **Spec coverage:** This plan covers the "Task Drawer" bullet of Phase A in the frontend-track spec, corrected from "formalize a reusable component" (it already exists) to "wire its six dead handlers + add the one missing store action." The remaining Phase A bullets (`tracking.tsx` grouping/saved-views, dependency link types, Available Tasks column, Gantt persistence) are **not** covered here — they're independent subsystems and belong in their own follow-on plans, per the writing-plans Scope Check.
- **Placeholder scan:** No TBD/TODO; every step has real code. `useAuthStore`'s shape and the `User`/`Department` fields referenced in Task 4's tests were read directly from `artifacts/forge/src/store/auth.ts` and `src/data/mockData.ts` during plan authoring (not assumed), so no verification hedges remain in the task steps.
- **Type consistency:** `toggleChecklistItem(taskId: string, index: number)` is defined identically in Task 2 and never renamed later. `updateTaskStatus`/`reassignTask`/`addComment` signatures match their existing definitions in `artifacts/forge/src/store/tasks.ts` verbatim (verified by reading the file before writing this plan).

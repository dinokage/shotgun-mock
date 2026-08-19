import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useUIStore } from '@/store/ui';
import { useTasksStore } from '@/store/tasks';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { USERS, PROJECTS, DEPARTMENTS, Task, TaskStatus } from '@/data/mockData';
import { STUDIO_LEADERSHIP_ROLES } from '@/store/permissions';
import { UploadCloud } from 'lucide-react';

export function CreateTaskModal() {
  const { createTaskModalOpen, setCreateTaskModalOpen, createTaskDefaultAssigneeId, setCreateTaskDefaultAssigneeId } = useUIStore();
  const { addTask, tasks } = useTasksStore();
  const { currentUser } = useAuthStore();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');

  // Pre-fill the assignee when the modal is opened with a default (e.g. from
  // a person's profile page via "Assign Task").
  useEffect(() => {
    if (createTaskModalOpen && createTaskDefaultAssigneeId) {
      setAssigneeId(createTaskDefaultAssigneeId);
    }
  }, [createTaskModalOpen, createTaskDefaultAssigneeId]);

  const handleOpenChange = (open: boolean) => {
    setCreateTaskModalOpen(open);
    if (!open) {
      setCreateTaskDefaultAssigneeId(null);
    }
  };

  if (!currentUser) return null;

  // VFX Producers / PMs / Coordinators can assign across the whole studio;
  // everyone else (including Supervisors/Leads) can only assign within their
  // own department. Uses the shared STUDIO_LEADERSHIP_ROLES list from
  // store/permissions.ts (also used by home.tsx) instead of a local copy.
  const isStudioLeadership = STUDIO_LEADERSHIP_ROLES.includes(currentUser.role);

  const availableUsers = USERS.filter(u => 
    isStudioLeadership || u.departmentId === currentUser.departmentId
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title || !projectId || !assigneeId) {
      toast({ title: 'Missing fields', description: 'Please fill out all required fields.', variant: 'destructive' });
      return;
    }

    const dept = USERS.find(u => u.id === assigneeId)?.departmentId;
    const departmentName = DEPARTMENTS.find(d => d.id === dept)?.name || 'General';

    // Derived from the live store, not the frozen TASKS import — using
    // TASKS.length here meant every task created after the first in a
    // session got the same id, a real duplicate-key bug once persistence
    // exists (see product review §6).
    const nextNumericId = tasks.reduce((max, t) => {
      const n = parseInt(t.id.replace(/\D/g, ''), 10);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 100);

    const newTask: Task = {
      id: `t${nextNumericId + 1}`,
      title,
      description,
      projectId,
      assigneeId,
      assignedById: currentUser.id,
      status: 'todo',
      priority,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Next week
      estimatedHours: 8,
      actualHours: 0,
      tags: [],
      dependencies: [],
      checklist: [],
      comments: [],
      attachments: [],
      department: departmentName,
      createdAt: new Date().toISOString(),
      lastStatusUpdate: new Date().toISOString(),
      dailyLogs: [],
      pipelinePhase: 'MAIN',
      approvalHistory: [],
    };

    // Add to Zustand store
    addTask(newTask);

    toast({
      title: 'Task Assigned',
      description: `Successfully assigned "${title}" to ${USERS.find(u => u.id === assigneeId)?.name}.`,
    });

    // Reset and close
    setTitle('');
    setDescription('');
    setProjectId('');
    setAssigneeId('');
    setPriority('medium');
    setCreateTaskDefaultAssigneeId(null);
    setCreateTaskModalOpen(false);
  };

  return (
    <Dialog open={createTaskModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Assign New Task</DialogTitle>
          <DialogDescription>
            Create a new task and assign it to an artist in your department.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Task Title</Label>
            <Input id="title" placeholder="e.g. Rig Main Character" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="desc">Description (Optional)</Label>
            <Input id="desc" placeholder="Brief details about the task..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECTS.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Artist" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(val: any) => setPriority(val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-2">
            <Label>Attachments (Reference Art, Scripts, DCC Files)</Label>
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:bg-muted/50 transition-colors cursor-pointer">
              <UploadCloud className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Drag & drop files here, or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Supports any format (.ma, .blend, .pdf, .mp4, .png)</p>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button type="submit">Assign Task</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

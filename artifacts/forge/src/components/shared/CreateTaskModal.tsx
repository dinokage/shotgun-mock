import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useUIStore } from '@/store/ui';
import { useTasksStore } from '@/store/tasks';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { USERS, PROJECTS, DEPARTMENTS, TASKS, Task, TaskStatus } from '@/data/mockData';
import { UploadCloud } from 'lucide-react';

export function CreateTaskModal() {
  const { createTaskModalOpen, setCreateTaskModalOpen } = useUIStore();
  const { addTask } = useTasksStore();
  const { currentUser } = useAuthStore();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');

  if (!currentUser) return null;

  // Managers and Leads can only assign to their own department
  const isLeadership = ['vfx_producer', 'production_manager', 'coordinator', 'supervisor', 'lead'].includes(currentUser.role);
  
  // VFX Producers / PMs can assign across studio, but Supervisors/Leads can only assign within their dept.
  const isStudioLeadership = ['vfx_producer', 'production_manager', 'coordinator'].includes(currentUser.role);
  
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

    const newTask: Task = {
      id: `t${TASKS.length + 100}`, // Mock ID generation
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
    setCreateTaskModalOpen(false);
  };

  return (
    <Dialog open={createTaskModalOpen} onOpenChange={setCreateTaskModalOpen}>
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
            <Button type="button" variant="outline" onClick={() => setCreateTaskModalOpen(false)}>Cancel</Button>
            <Button type="submit">Assign Task</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

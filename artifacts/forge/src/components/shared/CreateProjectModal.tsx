import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useUIStore } from '@/store/ui';
import { useCreateProject } from '@/hooks/useProjects';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

// Mirrors the distinct `type` values seeded across mockData.ts's PROJECTS,
// so a project created here reads consistently with the rest of the grid.
const PROJECT_TYPES = [
  'Animated Feature',
  'Animated Series',
  'Animated Short',
  'Ad Campaign',
  'Feature VFX',
  'Game Cinematic',
  'Theme Park',
  'VR Experience',
];

export function CreateProjectModal() {
  const { createProjectModalOpen, setCreateProjectModalOpen } = useUIStore();
  const { mutateAsync: createProject, isPending } = useCreateProject();
  const { currentUser } = useAuthStore();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [type, setType] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [budget, setBudget] = useState('');
  const [description, setDescription] = useState('');

  if (!currentUser) return null;

  const resetForm = () => {
    setName('');
    setClient('');
    setType('');
    setDueDate('');
    setBudget('');
    setDescription('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !client || !type) {
      toast({ title: 'Missing fields', description: 'Please fill out all required fields.', variant: 'destructive' });
      return;
    }

    try {
      const project = await createProject({
        name,
        client,
        type,
        // Since we didn't add description and budget to the API DTO, we might ignore them here, 
        // but we'll include endDate and a mock code
        code: name.substring(0, 3).toUpperCase(), // Basic mock code
        endDate: dueDate || null,
        status: 'active',
      });

      toast({
        title: 'Project Created',
        description: `"${project.name}" has been added to the roster.`,
      });

      resetForm();
      setCreateProjectModalOpen(false);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to create project.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog
      open={createProjectModalOpen}
      onOpenChange={(open) => {
        setCreateProjectModalOpen(open);
        if (!open) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Set up a new project for scheduling, asset tracking, and task assignment.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input id="project-name" placeholder="e.g. Starfall" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project-client">Client</Label>
              <Input id="project-client" placeholder="e.g. StreamMax Studios" value={client} onChange={e => setClient(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project-due">Due Date</Label>
              <Input id="project-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-budget">Budget (USD)</Label>
              <Input id="project-budget" type="number" min="0" placeholder="e.g. 2500000" value={budget} onChange={e => setBudget(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-desc">Description (Optional)</Label>
            <Textarea id="project-desc" placeholder="Brief overview of the project..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setCreateProjectModalOpen(false)} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? 'Creating...' : 'Create Project'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

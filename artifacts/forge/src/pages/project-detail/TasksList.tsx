import { useState } from 'react';
import { useTasksStore } from '@/store/tasks';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PriorityChip } from '@/components/shared/PriorityChip';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { USERS } from '@/data/mockData';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function TasksListView({ projectId }: { projectId: string }) {
  const tasks = useTasksStore(state => state.tasks).filter(t => t.projectId === projectId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const toggleAll = () => {
    if (selectedIds.size === tasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map(t => t.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkAction = (action: string) => {
    toast({ title: 'Bulk action applied', description: `${action} applied to ${selectedIds.size} tasks.` });
    setSelectedIds(new Set());
  };

  return (
    <div className="h-full flex flex-col relative">
      {selectedIds.size > 0 && (
        <div className="absolute top-0 left-0 right-0 h-14 bg-primary/10 border-b border-primary/20 z-10 flex items-center px-4 justify-between animate-in slide-in-from-top-2">
          <div className="text-sm font-medium text-primary">
            {selectedIds.size} tasks selected
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => handleBulkAction('Change Status')}>Change Status</Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkAction('Reassign')}>Reassign</Button>
            <Button size="sm" variant="destructive" onClick={() => handleBulkAction('Delete')}>Delete</Button>
          </div>
        </div>
      )}
      
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur z-0 shadow-sm">
            <tr>
              <th className="p-3 w-10">
                <Checkbox checked={selectedIds.size === tasks.length && tasks.length > 0} onCheckedChange={toggleAll} />
              </th>
              <th className="p-3 font-medium cursor-pointer hover:bg-muted">Title</th>
              <th className="p-3 font-medium cursor-pointer hover:bg-muted">Assignee</th>
              <th className="p-3 font-medium cursor-pointer hover:bg-muted">Status</th>
              <th className="p-3 font-medium cursor-pointer hover:bg-muted">Priority</th>
              <th className="p-3 font-medium cursor-pointer hover:bg-muted">Due Date</th>
              <th className="p-3 font-medium cursor-pointer hover:bg-muted">Est. Hrs</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map(task => {
              const user = USERS.find(u => u.id === task.assigneeId);
              const isSelected = selectedIds.has(task.id);
              return (
                <tr key={task.id} className={`border-b border-border hover:bg-muted/30 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                  <td className="p-3">
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(task.id)} />
                  </td>
                  <td className="p-3 font-medium">{task.title}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <UserAvatar userId={task.assigneeId} />
                      <span>{user?.name}</span>
                    </div>
                  </td>
                  <td className="p-3"><StatusBadge status={task.status} /></td>
                  <td className="p-3"><PriorityChip priority={task.priority} /></td>
                  <td className="p-3 text-muted-foreground">{task.dueDate}</td>
                  <td className="p-3 text-muted-foreground">{task.estimatedHours}h</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

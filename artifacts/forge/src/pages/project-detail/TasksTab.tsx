import { useState } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Kanban, List, GitCommit } from 'lucide-react';
import KanbanView from './TasksKanban';
import TasksListView from './TasksList';
import TasksTimelineView from './TasksTimeline';

export default function TasksTab({ project }: { project: any }) {
  const [view, setView] = useState('kanban');

  return (
    <div className="flex flex-col h-full overflow-hidden border border-border rounded-lg bg-card/50">
      <div className="p-3 border-b border-border bg-card flex justify-between items-center">
        <ToggleGroup type="single" value={view} onValueChange={(v) => { if(v) setView(v); }}>
          <ToggleGroupItem value="kanban" aria-label="Kanban View" className="px-3"><Kanban className="w-4 h-4 mr-2"/> Kanban</ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List View" className="px-3"><List className="w-4 h-4 mr-2"/> List</ToggleGroupItem>
          <ToggleGroupItem value="timeline" aria-label="Timeline View" className="px-3"><GitCommit className="w-4 h-4 mr-2"/> Timeline</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {view === 'kanban' && <KanbanView projectId={project.id} />}
        {view === 'list' && <TasksListView projectId={project.id} />}
        {view === 'timeline' && <TasksTimelineView projectId={project.id} />}
      </div>
    </div>
  );
}

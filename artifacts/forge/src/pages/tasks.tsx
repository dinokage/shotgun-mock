import KanbanView from './project-detail/TasksKanban';

export default function Tasks() {
  return (
    <div className="p-6 h-screen flex flex-col max-w-[1600px] mx-auto">
      <div className="mb-4">
        <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
        <p className="text-muted-foreground mt-2">Global task management view</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <KanbanView />
      </div>
    </div>
  );
}

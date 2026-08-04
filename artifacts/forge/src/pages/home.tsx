import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PriorityChip } from '@/components/shared/PriorityChip';
import { useTasksStore } from '@/store/tasks';
import { USERS, PROJECTS, AUDIT_EVENTS } from '@/data/mockData';
import { CheckCircle2, MessageSquare, Plus, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

export default function Home() {
  const tasks = useTasksStore(state => state.tasks);
  const myTasks = tasks.filter(t => t.assigneeId === 'u1');
  const { toast } = useToast();

  const handleApprove = () => {
    toast({ title: 'Item approved', description: 'The next step in the workflow has been triggered.' });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">My Work</h1>
        <Button className="gap-2">
          <Plus className="w-4 h-4" /> New Task
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Open Tasks', value: myTasks.length, sub: '2 due this week' },
          { label: 'Awaiting Approval', value: 2, sub: 'Needs your review' },
          { label: 'Mentions', value: 4, sub: 'In last 24h' },
          { label: 'Velocity', value: '85%', sub: 'vs last week' }
        ].map((stat, i) => (
          <Card key={i} className="hover-elevate">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">My Tasks</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/projects/p1">View Board <ArrowRight className="w-4 h-4 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground">
                    <th className="h-10 px-4 text-left font-medium">Task</th>
                    <th className="h-10 px-4 text-left font-medium">Status</th>
                    <th className="h-10 px-4 text-left font-medium">Priority</th>
                    <th className="h-10 px-4 text-left font-medium">Due Date</th>
                    <th className="h-10 px-4 text-left font-medium">Project</th>
                  </tr>
                </thead>
                <tbody>
                  {myTasks.map(task => {
                    const project = PROJECTS.find(p => p.id === task.projectId);
                    return (
                      <tr key={task.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="p-4 font-medium">{task.title}</td>
                        <td className="p-4"><StatusBadge status={task.status} /></td>
                        <td className="p-4"><PriorityChip priority={task.priority} /></td>
                        <td className="p-4 text-muted-foreground">{task.dueDate}</td>
                        <td className="p-4 text-muted-foreground">{project?.name}</td>
                      </tr>
                    );
                  })}
                  {myTasks.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        No tasks assigned to you right now.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                Awaiting Approval
                <span className="bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded-full">2</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { title: 'SEQ_030_SH_015 v002', project: 'Starfall', type: 'Review' },
                { title: 'ENV_DesertCanyons Layout', project: 'Starfall', type: 'Asset' }
              ].map((item, i) => (
                <div key={i} className="border rounded-md p-3 space-y-3 bg-muted/20">
                  <div>
                    <div className="font-medium text-sm">{item.title}</div>
                    <div className="text-xs text-muted-foreground">{item.project} • {item.type}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleApprove} className="flex-1 bg-status-green hover:bg-status-green/90 text-white">
                      <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleApprove} className="flex-1">
                      <MessageSquare className="w-4 h-4 mr-1.5" /> Request Changes
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {AUDIT_EVENTS.slice(0, 5).map((event, i) => {
                  const user = USERS.find(u => u.id === event.userId);
                  return (
                    <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full border border-border bg-card shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10 text-muted-foreground">
                        <div className="w-2 h-2 rounded-full bg-primary/50" />
                      </div>
                      <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] p-3 rounded border border-border bg-card shadow-sm group-hover:border-primary/30 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm flex items-center gap-1.5">
                            {user?.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">{event.timestamp.split(' ')[1]}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {event.description}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

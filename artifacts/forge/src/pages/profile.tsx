import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { USERS, TASKS, PROJECTS, AUDIT_EVENTS } from '@/data/mockData';
import { ListTodo, FolderOpen, Clock, Mail, MapPin, Building2, Key } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PriorityChip } from '@/components/shared/PriorityChip';
import { useUIStore } from '@/store/ui';

export default function Profile() {
  const user = USERS[0];
  const myTasks = TASKS.filter(t => t.assigneeId === user.id);
  const myProjects = [...new Set(myTasks.map(t => t.projectId))].map(pid => PROJECTS.find(p => p.id === pid)).filter(Boolean);
  const myEvents = AUDIT_EVENTS.filter(e => e.userId === user.id).slice(0, 10);
  const { setActiveTaskDrawer } = useUIStore();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Profile Header */}
      <div className="flex items-center gap-6">
        <Avatar className="w-20 h-20">
          <AvatarImage src={user.avatar} alt={user.name} />
          <AvatarFallback className="text-2xl">{user.name.charAt(0)}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-3xl font-bold">{user.name}</h1>
          <p className="text-muted-foreground">{user.role}</p>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {user.email}</span>
            <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {user.department}</span>
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {user.studioId === 'studio1' ? 'Portland' : user.studioId === 'studio2' ? 'London' : 'Tokyo'}</span>
          </div>
        </div>
        <div className="ml-auto">
          <Button variant="outline">Edit Profile</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active Tasks', value: myTasks.filter(t => t.status === 'in-progress').length, icon: ListTodo },
          { label: 'Projects', value: myProjects.length, icon: FolderOpen },
          { label: 'Completed', value: myTasks.filter(t => t.status === 'complete').length, icon: ListTodo },
          { label: 'Capacity', value: `${user.capacity}%`, icon: Clock },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="text-xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Availability Heatmap */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Availability (Next 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-1 overflow-hidden rounded-md border border-border">
            {Array.from({ length: 30 }).map((_, i) => {
              // Procedurally generate some availability data
              // Random pattern with some weekends (greyed)
              const d = new Date();
              d.setDate(d.getDate() + i);
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const load = isWeekend ? 0 : (user.capacity + (Math.sin(i) * 30));
              let color = 'bg-green-500'; // available
              if (load > 110) color = 'bg-red-500'; // overloaded
              else if (load > 85) color = 'bg-yellow-500'; // near capacity
              if (isWeekend) color = 'bg-muted';
              
              return (
                <div 
                  key={i} 
                  className={`flex-1 h-12 ${color} opacity-80 hover:opacity-100 transition-opacity flex flex-col items-center justify-end pb-1 border-r border-background/20 last:border-0 cursor-help`}
                  title={`${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: ${isWeekend ? 'Off' : Math.round(load) + '% loaded'}`}
                >
                  <span className="text-[9px] font-mono mix-blend-overlay text-white font-bold">{d.getDate()}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground justify-end">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded bg-green-500" /> Available</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded bg-yellow-500" /> Near Capacity</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded bg-red-500" /> Overloaded</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded bg-muted" /> OOO / Weekend</div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">My Tasks ({myTasks.length})</TabsTrigger>
          <TabsTrigger value="projects">Projects ({myProjects.length})</TabsTrigger>
          <TabsTrigger value="licenses">Licenses ({user.licenses?.length || 0})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-4">
          <div className="rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className="h-10 px-4 text-left font-medium">Task</th>
                  <th className="h-10 px-4 text-left font-medium">Status</th>
                  <th className="h-10 px-4 text-left font-medium">Priority</th>
                  <th className="h-10 px-4 text-left font-medium">Due</th>
                </tr>
              </thead>
              <tbody>
                {myTasks.slice(0, 15).map(task => (
                  <tr key={task.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setActiveTaskDrawer(task.id)}>
                    <td className="p-4 font-medium">{task.title}</td>
                    <td className="p-4"><StatusBadge status={task.status} /></td>
                    <td className="p-4"><PriorityChip priority={task.priority} /></td>
                    <td className="p-4 text-muted-foreground">{task.dueDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="projects" className="mt-4 space-y-3">
          {myProjects.map(p => p && (
            <Card key={p.id} className="hover:bg-muted/20 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-8 rounded" style={{ background: p.thumbnail }} />
                <div className="flex-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.type} · {p.progress}% complete</div>
                </div>
                <Badge variant={p.status === 'ON_TRACK' ? 'default' : 'secondary'}>{p.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-3">
          {myEvents.map(ev => (
            <div key={ev.id} className="flex items-start gap-3 p-3 rounded border border-border">
              <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-sm">{ev.description}</div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{ev.timestamp}</div>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="licenses" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assigned Software Licenses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {user.licenses && user.licenses.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {user.licenses.map((license, i) => (
                    <div key={i} className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Key className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium">{license}</div>
                        <div className="text-xs text-green-500 font-mono mt-0.5">ACTIVE</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground text-sm italic">No active software licenses found for this user.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

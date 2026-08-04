import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { SHOTS, AUDIT_EVENTS } from '@/data/mockData';

const burndownData = [
  { name: 'Week 1', planned: 247, actual: 247 },
  { name: 'Week 2', planned: 210, actual: 220 },
  { name: 'Week 3', planned: 180, actual: 195 },
  { name: 'Week 4', planned: 150, actual: 160 },
  { name: 'Week 5', planned: 120, actual: 140 },
  { name: 'Week 6', planned: 90, actual: 110 },
  { name: 'Week 7', planned: 60, actual: 80 },
  { name: 'Week 8', planned: 30, actual: 78 }, // Current
];

const COLORS = {
  complete: 'hsl(134 60% 30%)',
  'in-progress': 'hsl(28 72% 41%)',
  blocked: 'hsl(0 54% 41%)',
  todo: 'hsl(204 20% 45%)'
};

export default function DashboardTab({ project }: { project: any }) {
  const pieData = [
    { name: 'Complete', value: 98, fill: COLORS.complete },
    { name: 'In Progress', value: 74, fill: COLORS['in-progress'] },
    { name: 'Blocked', value: 25, fill: COLORS.blocked },
    { name: 'To Do', value: 50, fill: COLORS.todo },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-8">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Burndown</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={burndownData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Line type="monotone" dataKey="planned" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="5 5" name="Planned Remaining" />
                <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" strokeWidth={3} name="Actual Remaining" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Overall Progress', value: `${project.progress}%` },
            { label: 'Shots Approved', value: '98 / 247' },
            { label: 'Assets Approved', value: '45 / 84' },
            { label: 'Current Velocity', value: '18 tasks/wk' },
          ].map((k, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground font-medium mb-1">{k.label}</div>
                <div className="text-xl font-bold">{k.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Shot Status</CardTitle>
          </CardHeader>
          <CardContent className="h-[250px] flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold">{project.shotsCount}</span>
              <span className="text-xs text-muted-foreground">Total Shots</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Deadlines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { t: 'SEQ_020 Lighting Pass', d: 'Oct 10' },
              { t: 'Character Rigs Final', d: 'Oct 15' },
              { t: 'Director Review Loop', d: 'Oct 18' },
            ].map((item, i) => (
              <div key={i} className="flex justify-between items-center text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="font-medium">{item.t}</span>
                <span className="text-muted-foreground">{item.d}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

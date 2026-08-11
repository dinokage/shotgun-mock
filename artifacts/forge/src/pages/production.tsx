import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SHOTS, DEPARTMENTS, PROJECTS } from '@/data/mockData';
import { TableProperties, PlayCircle } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useUIStore } from '@/store/ui';
import { Link, useLocation } from 'wouter';

export default function ProductionDashboard() {
  const { currentUser } = useAuthStore();
  const [, setLocation] = useLocation();

  const isManager = currentUser && ['vfx_producer', 'production_manager', 'coordinator', 'supervisor', 'lead'].includes(currentUser.role);

  if (!isManager) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-muted-foreground">
        <TableProperties className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-xl font-semibold mb-2 text-foreground">Access Denied</h2>
        <p>You need Production or Supervisor privileges to access the Production Dashboard.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Production Dashboard</h1>
          <p className="text-muted-foreground mt-1">High-level overview of department progress and latest deliverables.</p>
        </div>
      </div>

      {/* Department Wise Previews */}
      <div className="space-y-8">
        {['Layout', 'Animation', 'Lighting', 'FX', 'Rendering', 'Compositing'].map((deptName, i) => {
          const dept = DEPARTMENTS.find(d => d.name.toLowerCase().includes(deptName.toLowerCase())) || { id: deptName, name: deptName, color: 'hsl(var(--primary))' };
          // Deterministic mock generation based on index
          const deptShots = [...SHOTS].sort((a, b) => a.id.localeCompare(b.id)).slice(i * 4, (i * 4) + 4);
          
          return (
            <Card key={dept.id} className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xl font-semibold flex items-center gap-2" style={{ color: dept.color }}>
                  {dept.name}
                  <span className="text-sm font-normal text-muted-foreground ml-2">Latest Shorts</span>
                </CardTitle>
                <Link href="/tracking" className="text-sm text-primary hover:underline font-medium">View All</Link>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {deptShots.map(shot => {
                    const project = PROJECTS.find(p => p.id === shot.projectId);
                    return (
                      <div key={shot.id} className="group flex flex-col gap-2 cursor-pointer" onClick={() => setLocation('/review')}>
                        <div className="relative aspect-video bg-muted rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors">
                          {shot.thumbnail ? (
                            <img src={shot.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={shot.name} />
                          ) : (
                            <div className="w-full h-full bg-muted/50" />
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <PlayCircle className="w-12 h-12 text-white drop-shadow-md" />
                          </div>
                          <div className="absolute top-2 right-2">
                            <StatusBadge status={shot.status} className="shadow-md" />
                          </div>
                        </div>
                        <div>
                          <div className="font-semibold text-sm group-hover:text-primary transition-colors flex items-center justify-between">
                            {shot.name}
                            <span className="text-xs text-muted-foreground font-mono">{shot.usdVersion || 'v001.usd'}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{project?.name}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

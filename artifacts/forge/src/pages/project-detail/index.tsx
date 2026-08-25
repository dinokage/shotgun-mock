import { useState } from 'react';
import { useRoute } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProject } from '@/hooks/useProjects';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { Link } from 'wouter';
import DashboardTab from './DashboardTab';
import AssetsTab from './AssetsTab';
import TasksTab from './TasksTab';
import VersionsTab from './VersionsTab';
import DailiesTab from './DailiesTab';
import { StatusBadge } from '@/components/shared/StatusBadge';

export default function ProjectDetail() {
  const [, params] = useRoute('/projects/:id');
  const projectId = params?.id;
  
  const { data: project, isLoading, error } = useProject(projectId || '');

  if (isLoading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;
  if (error || !project) return <div className="p-6 text-center text-muted-foreground">Project not found.</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 -ml-2 text-muted-foreground">
            <Link href="/projects"><ChevronLeft className="w-5 h-5" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
              <StatusBadge status={project.status} />
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {project.type} • Due {project.endDate ? new Date(project.endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD'}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-[1600px] w-full mx-auto">
        <Tabs defaultValue="dashboard" className="w-full h-full flex flex-col">
          <TabsList className="w-full justify-start border-b border-border rounded-none h-auto p-0 bg-transparent mb-6">
            <TabsTrigger value="dashboard" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">Dashboard</TabsTrigger>
            <TabsTrigger value="assets" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">Shots & Assets</TabsTrigger>
            <TabsTrigger value="tasks" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">Tasks</TabsTrigger>
            <TabsTrigger value="versions" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">Versions & Publishes</TabsTrigger>
            <TabsTrigger value="dailies" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">Dailies & Previews</TabsTrigger>
          </TabsList>
          
          <div className="flex-1 min-h-0">
            <TabsContent value="dashboard" className="h-full m-0 data-[state=active]:flex flex-col"><DashboardTab project={project as any} /></TabsContent>
            <TabsContent value="assets" className="h-full m-0 data-[state=active]:flex flex-col"><AssetsTab project={project as any} /></TabsContent>
            <TabsContent value="tasks" className="h-full m-0 data-[state=active]:flex flex-col"><TasksTab project={project as any} /></TabsContent>
            <TabsContent value="versions" className="h-full m-0 data-[state=active]:flex flex-col"><VersionsTab project={project as any} /></TabsContent>
            <TabsContent value="dailies" className="h-full m-0 data-[state=active]:flex flex-col"><DailiesTab project={project as any} /></TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { TASKS, SHOTS, USERS, PROJECTS, DEPARTMENTS } from '@/data/mockData';
import { useAuthStore } from '@/store/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, Download, Save, CheckSquare, Square, Grid3X3, TableProperties } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

export default function TrackingGrid() {
  const { currentUser } = useAuthStore();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Join tasks with their associated shots for a unified view
  const trackingData = useMemo(() => {
    return TASKS.map(task => {
      const shot = SHOTS.find(s => s.id === task.shotId);
      const assignee = USERS.find(u => u.id === task.assigneeId);
      const project = PROJECTS.find(p => p.id === task.projectId);
      return {
        ...task,
        shotName: shot?.name || '-',
        sequence: shot?.sequence || '-',
        assigneeName: assignee?.name || 'Unassigned',
        projectName: project?.name || 'Unknown',
      };
    }).filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase()) || t.shotName.toLowerCase().includes(search.toLowerCase());
      const matchesProj = projectFilter === 'all' || t.projectId === projectFilter;
      const matchesDept = deptFilter === 'all' || t.department === deptFilter;
      return matchesSearch && matchesProj && matchesDept;
    });
  }, [search, projectFilter, deptFilter]);

  const handleSelectAll = () => {
    if (selectedIds.size === trackingData.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(trackingData.map(t => t.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBulkUpdate = () => {
    if (selectedIds.size === 0) return;
    toast({
      title: "Bulk Update Successful",
      description: `Applied changes to ${selectedIds.size} rows simultaneously.`,
    });
    setSelectedIds(new Set());
  };

  if (!currentUser || !['vfx_producer', 'production_manager', 'coordinator', 'supervisor'].includes(currentUser.role)) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-muted-foreground">
        <TableProperties className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-xl font-semibold mb-2 text-foreground">Access Denied</h2>
        <p>You need Production or Supervisor privileges to access the Tracking Grid.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background p-6 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1 flex items-center gap-2">
            <Grid3X3 className="w-6 h-6 text-primary" /> Global Tracking Grid
          </h1>
          <p className="text-muted-foreground text-sm">Spreadsheet bulk-edit view for Production.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => toast({ title: "Exporting CSV..." })}>
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
          <Button size="sm" onClick={handleBulkUpdate} disabled={selectedIds.size === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Save className="w-4 h-4 mr-2" /> Bulk Update ({selectedIds.size})
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg shadow-sm shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Search tasks, shots, sequences..." 
            className="pl-9 h-9" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Project" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {PROJECTS.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Depts</SelectItem>
            {DEPARTMENTS.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground"><Filter className="w-4 h-4" /></Button>
      </div>

      {/* Grid */}
      <div className="flex-1 bg-card border border-border rounded-lg overflow-hidden shadow-sm flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left text-[13px] whitespace-nowrap">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-md z-10 shadow-[0_1px_0_var(--border)]">
              <tr className="text-muted-foreground">
                <th className="h-10 px-3 w-10 text-center cursor-pointer" onClick={handleSelectAll}>
                  {selectedIds.size === trackingData.length && trackingData.length > 0 ? (
                    <CheckSquare className="w-4 h-4 mx-auto text-primary" />
                  ) : (
                    <Square className="w-4 h-4 mx-auto" />
                  )}
                </th>
                <th className="h-10 px-3 font-medium">Shot / Asset</th>
                <th className="h-10 px-3 font-medium">Task</th>
                <th className="h-10 px-3 font-medium">Dept</th>
                <th className="h-10 px-3 font-medium">Assignee</th>
                <th className="h-10 px-3 font-medium">Status</th>
                <th className="h-10 px-3 font-medium">Est. (hrs)</th>
                <th className="h-10 px-3 font-medium">Due Date</th>
                <th className="h-10 px-3 font-medium">Project</th>
              </tr>
            </thead>
            <tbody>
              {trackingData.map(row => (
                <tr 
                  key={row.id} 
                  className={`border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${selectedIds.has(row.id) ? 'bg-primary/5' : ''}`}
                  onClick={() => toggleSelect(row.id)}
                >
                  <td className="h-10 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleSelect(row.id)} className="focus:outline-none">
                      {selectedIds.has(row.id) ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4 text-muted-foreground opacity-30 hover:opacity-100 transition-opacity" />
                      )}
                    </button>
                  </td>
                  <td className="h-10 px-3 font-medium text-foreground">{row.shotName} <span className="text-[10px] text-muted-foreground font-normal ml-1">{row.sequence}</span></td>
                  <td className="h-10 px-3 truncate max-w-[200px]">{row.title}</td>
                  <td className="h-10 px-3"><Badge variant="outline" className="text-[10px] font-normal px-1.5">{row.department}</Badge></td>
                  <td className="h-10 px-3 text-muted-foreground">{row.assigneeName}</td>
                  <td className="h-10 px-3">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                      row.status === 'complete' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                      row.status === 'review' ? 'bg-purple-500/10 text-purple-600 border-purple-500/20' :
                      row.status === 'blocked' ? 'bg-red-500/10 text-red-600 border-red-500/20' :
                      row.status === 'in-progress' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                      'bg-muted text-muted-foreground border-transparent'
                    }`}>
                      {row.status.replace('-', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="h-10 px-3 text-right tabular-nums">{row.estimatedHours}</td>
                  <td className="h-10 px-3 text-muted-foreground tabular-nums">{row.dueDate}</td>
                  <td className="h-10 px-3 text-muted-foreground truncate max-w-[150px]">{row.projectName}</td>
                </tr>
              ))}
              {trackingData.length === 0 && (
                <tr>
                  <td colSpan={9} className="h-32 text-center text-muted-foreground">
                    No results found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="h-10 bg-muted/30 border-t border-border flex items-center justify-between px-4 text-xs text-muted-foreground shrink-0">
          <span>{trackingData.length} total rows</span>
          {selectedIds.size > 0 && <span className="text-primary font-medium">{selectedIds.size} selected</span>}
        </div>
      </div>
    </div>
  );
}

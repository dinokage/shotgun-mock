import { useState, useMemo } from 'react';
import { Search, Filter, Download, Save, TableProperties } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/hooks/use-toast';
import { PROJECTS, EPISODES, SEQUENCES, SHOTS, USERS, Shot } from '@/data/mockData';

export default function TrackingGrid() {
  const { currentUser } = useAuthStore();
  const { toast } = useToast();
  
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');

  const trackingData = useMemo(() => {
    let rowIndex = 1;
    
    // Filter shots based on project
    let filteredShots = SHOTS;
    if (projectFilter !== 'all') {
      filteredShots = filteredShots.filter(s => s.projectId === projectFilter);
    }
    
    // Sort logically by Project -> Episode -> Sequence -> Shot
    filteredShots = [...filteredShots].sort((a, b) => {
      if (a.projectId !== b.projectId) return String(a.projectId || '').localeCompare(String(b.projectId || ''));
      if (a.episodeId !== b.episodeId) return String(a.episodeId || '').localeCompare(String(b.episodeId || ''));
      if (a.sequenceId !== b.sequenceId) return String(a.sequenceId || '').localeCompare(String(b.sequenceId || ''));
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    return filteredShots.filter(s => {
      if (!search) return true;
      const term = search.toLowerCase();
      const projName = PROJECTS.find(p => p.id === s.projectId)?.name || '';
      const epName = EPISODES.find(e => e.id === s.episodeId)?.name || '';
      return String(s.name || '').toLowerCase().includes(term) || 
             String(s.sequence || '').toLowerCase().includes(term) || 
             projName.toLowerCase().includes(term) ||
             epName.toLowerCase().includes(term);
    }).map(shot => {
      const proj = PROJECTS.find(p => p.id === shot.projectId);
      const ep = EPISODES.find(e => e.id === shot.episodeId);
      const seq = SEQUENCES.find(sq => sq.id === shot.sequenceId);
      const assignee = USERS.find(u => u.id === shot.assigneeId);

      return {
        id: shot.id,
        no: rowIndex++,
        project: proj?.name || 'Unknown',
        episode: ep?.name || 'EP_01',
        sequence: seq?.name || shot.sequence,
        shot: shot.name,
        assignee: assignee?.name || 'Unassigned',
        status: shot.status,
        internalReview: shot.internalReviewStatus,
        clientReview: shot.clientReviewStatus,
        usdVersion: shot.usdVersion || 'v001.usd',
        updatedAt: shot.updatedAt,
        notes: shot.notes || 'No notes.',
      };
    });
  }, [search, projectFilter]);

  if (!currentUser || !['vfx_producer', 'production_manager', 'coordinator', 'supervisor'].includes(currentUser.role)) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-muted-foreground">
        <TableProperties className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-xl font-semibold mb-2 text-foreground">Access Denied</h2>
        <p>You need Production or Supervisor privileges to access the Tracking Grid.</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'text-emerald-500';
      case 'in-progress': return 'text-amber-500';
      case 'bottleneck': return 'text-red-500';
      case 'review': return 'text-purple-500';
      default: return 'text-muted-foreground';
    }
  };

  const getReviewColor = (status: string) => {
    switch (status) {
      case 'approved': return 'text-emerald-500 bg-emerald-500/10';
      case 'rejected': return 'text-red-500 bg-red-500/10';
      case 'changes-requested': return 'text-orange-500 bg-orange-500/10';
      case 'pending': return 'text-blue-500 bg-blue-500/10';
      default: return 'text-muted-foreground bg-muted/20';
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] p-4 bg-[#0a0a0a] text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Global Tracking Grid</h1>
          <p className="text-[#888] text-sm mt-1">Hierarchical sequence & shot tracking with Review pipelines.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => toast({ title: "Exporting to Excel..." })} className="border-[#333] text-[#ccc]">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
            <Save className="w-4 h-4 mr-2" /> Save Changes
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 p-3 bg-[#111] border border-[#333] rounded-sm mb-4 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
          <Input 
            placeholder="Search shot, sequence, or episode..." 
            className="pl-9 h-9 bg-[#1a1a1a] border-[#333] text-white" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-48 h-9 bg-[#1a1a1a] border-[#333] text-white"><SelectValue placeholder="Project" /></SelectTrigger>
          <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
            <SelectItem value="all">All Projects</SelectItem>
            {PROJECTS.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-[#888] hover:text-white"><Filter className="w-4 h-4" /></Button>
      </div>

      {/* Grid */}
      <div className="flex-1 border border-[#333] rounded-sm overflow-hidden flex flex-col bg-[#0f0f0f]">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left text-[12px] border-collapse" style={{ minWidth: '1400px' }}>
            <thead className="sticky top-0 z-10 bg-[#1e237e] text-white shadow-sm">
              <tr>
                <th className="border border-[#333] p-2 font-medium w-12 text-center bg-[#1e237e]">No</th>
                <th className="border border-[#333] p-2 font-medium w-32 bg-[#1e237e]">Project</th>
                <th className="border border-[#333] p-2 font-medium w-32 bg-[#1e237e]">Episode</th>
                <th className="border border-[#333] p-2 font-medium w-32 bg-[#1e237e]">Sequence</th>
                <th className="border border-[#333] p-2 font-medium w-32 bg-[#1e237e]">Shot</th>
                <th className="border border-[#333] p-2 font-medium w-32 bg-[#1e237e]">Assignee</th>
                <th className="border border-[#333] p-2 font-medium w-24 text-center bg-[#1e237e]">Status</th>
                <th className="border border-[#333] p-2 font-medium w-32 text-center bg-[#1e237e]">USD Version</th>
                <th className="border border-[#333] p-2 font-medium w-32 text-center bg-[#1e237e]">Internal Review</th>
                <th className="border border-[#333] p-2 font-medium w-32 text-center bg-[#1e237e]">Client Review</th>
                <th className="border border-[#333] p-2 font-medium text-center bg-[#1e237e]">Production Notes</th>
              </tr>
            </thead>
            <tbody className="bg-[#1a1a1a]">
              {trackingData.map((row, i) => (
                <tr key={row.id} className="hover:bg-[#252525] transition-colors">
                  <td className="border border-[#333] p-2 text-center text-[#888]">{row.no}</td>
                  <td className="border border-[#333] p-2 text-white font-medium">{row.project}</td>
                  <td className="border border-[#333] p-2 text-[#ccc]">{row.episode}</td>
                  <td className="border border-[#333] p-2 text-[#ccc]">{row.sequence}</td>
                  <td className="border border-[#333] p-2 text-[#4facfe] font-medium">{row.shot}</td>
                  <td className="border border-[#333] p-2 text-[#aaa]">{row.assignee}</td>
                  <td className={`border border-[#333] p-2 text-center font-semibold capitalize ${getStatusColor(row.status)}`}>
                    {row.status}
                  </td>
                  <td className="border border-[#333] p-2 text-center text-xs text-[#00cec9] font-mono">{row.usdVersion}</td>
                  <td className="border border-[#333] p-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${getReviewColor(row.internalReview)}`}>
                      {row.internalReview}
                    </span>
                  </td>
                  <td className="border border-[#333] p-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${getReviewColor(row.clientReview)}`}>
                      {row.clientReview}
                    </span>
                  </td>
                  <td className="border border-[#333] p-2 text-[11px] text-[#ccc] truncate max-w-[200px]">{row.notes}</td>
                </tr>
              ))}
              {trackingData.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center p-8 text-muted-foreground">
                    No tracking data found matching the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer Stats */}
        <div className="bg-[#111] border-t border-[#333] p-2 flex justify-between items-center text-xs text-[#888]">
          <div>Showing {trackingData.length} entries</div>
          <div className="flex gap-4">
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Approved: {trackingData.filter(d => d.clientReview === 'approved').length}</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500"></div> Pending: {trackingData.filter(d => d.clientReview === 'pending').length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

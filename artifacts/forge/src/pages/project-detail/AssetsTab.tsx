import { useState } from 'react';
import { SHOTS, ASSETS, USERS } from '@/data/mockData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { Search, SlidersHorizontal, X, FileVideo, Box } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function AssetsTab({ project }: { project: any }) {
  const [view, setView] = useState('shots');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = view === 'shots' ? SHOTS.filter(s => s.projectId === project.id) : ASSETS.filter(a => a.projectId === project.id);
  const selectedItem = items.find(i => i.id === selectedId);

  return (
    <div className="flex h-full overflow-hidden border border-border rounded-lg bg-card/50">
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-4">
            <ToggleGroup type="single" value={view} onValueChange={(v) => { if(v) setView(v); setSelectedId(null); }}>
              <ToggleGroupItem value="shots" className="gap-2 px-3"><FileVideo className="w-4 h-4"/> Shots</ToggleGroupItem>
              <ToggleGroupItem value="assets" className="gap-2 px-3"><Box className="w-4 h-4"/> Assets</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={`Search ${view}...`} className="pl-9 h-9" />
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9"><SlidersHorizontal className="w-4 h-4" /></Button>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-8">
            {items.map(item => (
              <div 
                key={item.id} 
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  "border rounded-md overflow-hidden bg-card cursor-pointer hover:border-primary/50 transition-colors group",
                  selectedId === item.id ? "ring-2 ring-primary border-primary" : "border-border"
                )}
              >
                <div className="h-24 w-full bg-gradient-to-br from-primary/20 to-sidebar relative">
                  <div className="absolute top-2 right-2">
                    <StatusBadge status={item.status} className="bg-background/90" />
                  </div>
                </div>
                <div className="p-3">
                  <div className="font-mono text-[10px] text-muted-foreground mb-1">{item.id}</div>
                  <div className="font-medium text-sm truncate" title={item.name}>{item.name}</div>
                  <div className="mt-3 flex items-center justify-between">
                    <UserAvatar userId={item.assigneeId} />
                    <span className="text-[10px] text-muted-foreground">Upd: {item.updatedAt.substring(5)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {selectedItem && (
        <div className="w-80 border-l border-border bg-card flex flex-col animate-in slide-in-from-right-8 duration-200 shrink-0">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold truncate pr-2">{selectedItem.id}</h3>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setSelectedId(null)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Name</div>
                  <div className="font-medium text-sm">{selectedItem.name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Status</div>
                  <StatusBadge status={selectedItem.status} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Assignee</div>
                  <div className="flex items-center gap-2 text-sm">
                    <UserAvatar userId={selectedItem.assigneeId} />
                    {USERS.find(u => u.id === selectedItem.assigneeId)?.name}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Last Updated</div>
                  <div className="text-sm">{selectedItem.updatedAt}</div>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="text-sm font-medium mb-3">Recent Versions</div>
                <div className="space-y-2">
                  <div className="text-xs p-2 border border-border rounded bg-muted/30">v003 - Approved by Maya</div>
                  <div className="text-xs p-2 border border-border rounded bg-muted/30">v002 - Rejected (lighting)</div>
                  <div className="text-xs p-2 border border-border rounded bg-muted/30">v001 - Initial pass</div>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="text-sm font-medium mb-3">Notes</div>
                <textarea 
                  className="w-full h-24 bg-muted/50 border border-border rounded p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Add notes..."
                />
              </div>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

import { VERSIONS, USERS } from '@/data/mockData';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { useState } from 'react';
import { GitCommit, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function VersionsTab({ project }: { project: any }) {
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  return (
    <div className="flex h-full gap-6">
      <div className="w-2/3 flex flex-col h-full border border-border rounded-lg bg-card overflow-hidden">
        <div className="p-4 border-b border-border font-semibold flex items-center justify-between">
          Versions & Publishes
          <div className="text-sm font-normal text-muted-foreground">Showing latest</div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-4 content-start">
          {VERSIONS.map(v => {
            const user = USERS.find(u => u.id === v.createdById);
            const isSelected = selectedVersion === v.id;
            return (
              <Card 
                key={v.id} 
                className={cn("cursor-pointer hover:border-primary/50 transition-all", isSelected ? 'border-primary ring-1 ring-primary' : '')}
                onClick={() => setSelectedVersion(v.id)}
              >
                <div className="h-32 bg-muted relative rounded-t-lg overflow-hidden">
                  <div className="absolute top-2 right-2">
                    <StatusBadge status={v.status} className="bg-background/90" />
                  </div>
                  <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs font-mono px-1.5 py-0.5 rounded">
                    {v.versionNumber}
                  </div>
                </div>
                <CardContent className="p-3">
                  <div className="font-semibold text-sm mb-1">{v.entityId}</div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <UserAvatar userId={v.createdById} />
                      <span className="text-xs text-muted-foreground">{user?.name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{new Date(v.createdAt).toLocaleDateString()}</span>
                  </div>
                  {v.notes && <div className="text-xs text-muted-foreground mt-2 line-clamp-1">{v.notes}</div>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="w-1/3 flex flex-col h-full border border-border rounded-lg bg-card overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">
          Publish Lineage
        </div>
        <div className="flex-1 p-6 relative overflow-hidden flex items-center justify-center bg-muted/10">
          {selectedVersion ? (
            <div className="flex items-center">
              <div className="w-32 text-center">
                <div className="w-12 h-12 bg-muted rounded-full mx-auto mb-2 flex items-center justify-center border-2 border-border">
                  <GitCommit className="text-muted-foreground" />
                </div>
                <div className="font-mono text-xs text-muted-foreground">v001</div>
                <div className="text-xs mt-1">Approved</div>
              </div>
              <div className="w-16 flex items-center justify-center">
                <div className="h-px bg-border w-full relative">
                  <ArrowRight className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-border" />
                </div>
              </div>
              <div className="w-32 text-center">
                <div className="w-12 h-12 bg-primary/20 rounded-full mx-auto mb-2 flex items-center justify-center border-2 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary),0.3)]">
                  <GitCommit />
                </div>
                <div className="font-mono text-xs font-bold text-primary">v002</div>
                <div className="text-xs mt-1">Current</div>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm text-center">
              Select a version to view lineage graph
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayCircle, Plus, GripVertical, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

const mockPlaylists = [
  { id: 'pl1', name: 'Director Daily Review - Oct 1', items: 12, author: 'Maya Chen' },
  { id: 'pl2', name: 'Lighting Approvals', items: 4, author: 'Aisha Diallo' },
];

export default function PlaylistsTab({ project }: { project: any }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { toast } = useToast();

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="flex h-full gap-6">
      <div className="w-1/3 flex flex-col h-full border border-border rounded-lg bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <span className="font-semibold">Playlists</span>
          <Button size="sm" variant="ghost" className="h-8"><Plus className="w-4 h-4 mr-1"/> New</Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {mockPlaylists.map(pl => (
            <Card 
              key={pl.id} 
              className={`cursor-pointer hover:border-primary/50 transition-colors ${selectedId === pl.id ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
              onClick={() => setSelectedId(pl.id)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{pl.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{pl.items} versions • By {pl.author}</div>
                </div>
                <Button size="icon" variant="ghost" className="rounded-full text-primary hover:text-primary hover:bg-primary/10" onClick={handlePlay}>
                  <PlayCircle className="w-6 h-6" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="w-2/3 flex flex-col h-full border border-border rounded-lg bg-card overflow-hidden">
        {selectedId ? (
          <>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <span className="font-semibold">{mockPlaylists.find(p => p.id === selectedId)?.name}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline"><Plus className="w-4 h-4 mr-1"/> Add Version</Button>
                <Button size="sm" asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <Link href="/review"><PlayCircle className="w-4 h-4 mr-1"/> Start Review</Link>
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 p-2 border border-border rounded-md bg-muted/20 hover:bg-muted/50 group">
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab opacity-50 hover:opacity-100" />
                  <img src={`https://picsum.photos/seed/${i}/64/36`} className="w-16 h-9 rounded object-cover border border-border" alt="thumb" />
                  <div className="flex-1">
                    <div className="font-mono text-sm font-medium">SEQ_020_SH_04{i} <span className="text-muted-foreground ml-2">v00{i}</span></div>
                    <div className="text-xs text-muted-foreground">Lighting pass update</div>
                  </div>
                  <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a playlist to view its contents
          </div>
        )}
      </div>
    </div>
  );
}

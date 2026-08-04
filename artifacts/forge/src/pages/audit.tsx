import { useState } from 'react';
import { AUDIT_EVENTS, USERS } from '@/data/mockData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { ChevronDown, ChevronUp, History, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function AuditLog() {
  const [selectedEntity, setSelectedEntity] = useState('CHAR_Hero_Lyra');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();

  const events = AUDIT_EVENTS.filter(e => e.entityId === selectedEntity).reverse();

  const handleRollback = (timestamp: string) => {
    toast({ title: 'Rollback initiated', description: `Entity rolled back to state at ${timestamp}` });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Time Travel</h1>
          <p className="text-muted-foreground mt-1">Audit log and state rollback</p>
        </div>
        <div className="w-72">
          <Select value={selectedEntity} onValueChange={setSelectedEntity}>
            <SelectTrigger>
              <SelectValue placeholder="Select entity..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CHAR_Hero_Lyra">CHAR_Hero_Lyra</SelectItem>
              <SelectItem value="FX_MagicBlast">FX_MagicBlast</SelectItem>
              <SelectItem value="ENV_SpaceStation">ENV_SpaceStation</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        {events.map((event, index) => {
          const user = USERS.find(u => u.id === event.userId);
          const isExpanded = expandedId === event.id;
          const hasChanges = Object.keys(event.changedFields).length > 0;
          
          return (
            <Card key={event.id} className="overflow-hidden hover:border-primary/30 transition-colors">
              <div className="p-4 flex items-start gap-4 bg-card">
                <button
                  type="button"
                  className="flex-1 flex items-start gap-4 text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}
                >
                  <div className="w-10 h-10 rounded bg-muted/50 border border-border flex items-center justify-center shrink-0">
                    <History className="w-5 h-5 text-muted-foreground" />
                  </div>

                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-medium text-sm flex items-center gap-2">
                        <span className="font-mono text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{event.eventType}</span>
                        {event.description}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {event.timestamp}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                      <UserAvatar userId={event.userId} className="w-4 h-4" />
                      <span>{user?.name}</span>
                      {hasChanges && (
                        <span className="ml-4 flex items-center gap-1">
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {Object.keys(event.changedFields).length} field(s) changed
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 group hover:border-destructive hover:text-destructive transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 mr-1.5 group-hover:-rotate-90 transition-transform" /> Rollback
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Rollback to this state?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This restores <span className="font-mono">{selectedEntity}</span> to its state as of{' '}
                        <span className="font-mono">{event.timestamp}</span>. Changes made after this point will be discarded.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleRollback(event.timestamp)}>
                        Rollback
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {isExpanded && hasChanges && (
                <CardContent className="bg-muted/10 border-t border-border p-4 font-mono text-xs">
                  <div className="space-y-2">
                    {Object.entries(event.changedFields).map(([field, change]) => (
                      <div key={field} className="grid grid-cols-[120px_1fr] gap-4">
                        <div className="text-muted-foreground">{field}:</div>
                        <div>
                          {(change as string).split('→').map((part: string, i: number) => (
                            <span key={i}>
                              <span className={i === 0 ? "text-red-400/80 line-through" : "text-status-green"}>{part.trim()}</span>
                              {i === 0 && <span className="text-muted-foreground mx-2">→</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

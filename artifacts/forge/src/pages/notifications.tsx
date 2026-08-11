import { Bell } from 'lucide-react';
import { NOTIFICATIONS } from '@/data/mockData';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export default function Notifications() {
  return (
    <div className="p-8 max-w-4xl mx-auto h-full flex flex-col">
      <div className="flex items-center gap-3 mb-8 shrink-0">
        <Bell className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground mt-1">Your recent alerts and activity.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-4 pb-12">
        {NOTIFICATIONS.map(notif => (
          <Card key={notif.id} className={`p-4 flex gap-4 items-start ${!notif.read ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`}>
            {!notif.read && <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />}
            <div className="flex-1">
              <div className="flex justify-between items-start mb-1">
                <span className={`font-semibold ${notif.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {notif.title}
                </span>
                <span className="text-xs text-muted-foreground ml-4 shrink-0">{notif.timestamp}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{notif.description}</p>
              <Badge variant="outline" className="text-[10px] capitalize bg-muted/50">
                {notif.category}
              </Badge>
            </div>
          </Card>
        ))}
        {NOTIFICATIONS.length === 0 && (
          <div className="text-center p-12 text-muted-foreground">
            No notifications yet.
          </div>
        )}
      </div>
    </div>
  );
}

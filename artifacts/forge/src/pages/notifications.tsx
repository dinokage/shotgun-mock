import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { Bell, CheckCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { useNotificationStore } from '@/store/notifications';
import type { Notification } from '@/data/mockData';
import { cut, stagger } from '@/lib/motion';

/**
 * Resolves a notification's entityType/entityId to a route. Falls back to
 * `actionUrl` if the type isn't one we have a dedicated detail route for,
 * and returns null if there's nowhere sensible to send the user.
 */
function resolveNotificationRoute(notif: Notification): string | null {
  const { entityType, entityId, actionUrl } = notif;
  if (entityType && entityId) {
    switch (entityType) {
      case 'shot':
        return `/shots/${entityId}`;
      case 'asset':
        return `/assets/${entityId}`;
      case 'task':
        // No per-task detail route exists yet — send to the task list.
        return '/tasks';
      case 'review':
        return '/review';
      default:
        break;
    }
  }
  return actionUrl || null;
}

export default function Notifications() {
  const notifications = useNotificationStore((s) => s.notifications);
  const preferences = useNotificationStore((s) => s.preferences);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const [, setLocation] = useLocation();

  // Preferences are enforced at generation time in the store for any dynamic source
  // (see addNotification), but since today's notifications are static mock seed data,
  // muted categories are filtered out here at render time instead.
  const visible = notifications.filter((n) => preferences[n.category]?.push !== false);
  const unreadCount = visible.filter((n) => !n.read).length;

  return (
    <div className="p-8 max-w-4xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-8 shrink-0">
        <div className="flex items-center gap-3">
          <Bell className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
            <p className="text-muted-foreground mt-1">Your recent alerts and activity.</p>
          </div>
        </div>
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={cut.transition}
            >
              <Button variant="outline" size="sm" onClick={markAllAsRead} className="gap-2">
                <CheckCheck className="w-4 h-4" /> Mark all as read
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 overflow-auto space-y-4 pb-12">
        <AnimatePresence initial={false}>
          {visible.map((notif, i) => {
            const route = resolveNotificationRoute(notif);
            const activate = () => {
              if (!notif.read) markAsRead(notif.id);
              if (route) setLocation(route);
            };
            return (
              <motion.div
                key={notif.id}
                layout
                {...stagger(i)}
                exit={{ opacity: 0, x: -8, transition: cut.transition }}
                onClick={activate}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activate();
                  }
                }}
                className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
              >
                <Card
                  className={`p-4 flex gap-4 items-start transition-colors duration-200 ${
                    !notif.read ? 'bg-primary/5 border-primary/20 hover:bg-primary/10' : 'bg-card border-border hover:bg-muted/40'
                  }`}
                >
                  <div className="w-2 mt-2 shrink-0 flex justify-center">
                    <AnimatePresence>
                      {!notif.read && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={cut.transition}
                          className="w-2 h-2 rounded-full bg-primary"
                        />
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <span className={`font-semibold transition-colors duration-200 ${notif.read ? 'text-muted-foreground' : 'text-foreground'}`}>
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
              </motion.div>
            );
          })}
        </AnimatePresence>
        {visible.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bell />
              </EmptyMedia>
              <EmptyTitle>
                {notifications.length === 0 ? 'No notifications yet' : 'All caught up'}
              </EmptyTitle>
              <EmptyDescription>
                {notifications.length === 0
                  ? "You'll see task assignments, reviews, and studio alerts here."
                  : 'All notification categories are currently muted in your preferences. Adjust them in Settings > Notifications.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
}

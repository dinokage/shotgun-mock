import { Bell, Search, Sun, Moon, User, Shield, Eye, ChevronDown, Building2, LogOut } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NOTIFICATIONS, DEPARTMENTS, ROLE_LABELS } from '@/data/mockData';
import { useUIStore } from '@/store/ui';
import { useAuthStore } from '@/store/auth';
import { Link, useLocation } from 'wouter';
import { TimeClockWidget } from '@/components/shared/TimeClockWidget';
import { USERS } from '@/data/mockData';

export function TopBar() {
  const { setTheme, theme } = useTheme();
  const { setSearchOpen, setCommandPaletteOpen, notificationPanelOpen, setNotificationPanelOpen, setCreateTaskModalOpen } = useUIStore();
  const { currentUser, logout, switchUser } = useAuthStore();
  const [, setLocation] = useLocation();
  const unreadNotifs = NOTIFICATIONS.filter(n => !n.read).length;

  if (!currentUser) return null;

  const dept = DEPARTMENTS.find(d => d.id === currentUser.departmentId);

  const handleLogout = () => {
    logout();
    setLocation('/login');
  };

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between px-4 w-full">
      
      {/* Left: Brand + Role */}
      <div className="flex items-center gap-3 shrink-0">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
            <div className="w-3.5 h-3.5 bg-card rounded-sm" />
          </div>
          <span className="font-bold text-lg tracking-tight hidden md:inline">Forge</span>
        </Link>

        <div className="h-5 w-px bg-border hidden md:block" />

        {/* Current User Role/Dept Badge */}
        <div className={`hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs shadow-sm transition-all shrink-0 ${
          ['vfx_producer', 'production_manager', 'coordinator', 'supervisor', 'lead'].includes(currentUser.role)
            ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
            : 'bg-muted/50 border-border/50 text-foreground'
        }`}>
          <Shield className={`w-3.5 h-3.5 shrink-0 ${['vfx_producer', 'production_manager', 'coordinator', 'supervisor', 'lead'].includes(currentUser.role) ? 'text-amber-500' : 'text-primary'}`} />
          <span className="font-semibold truncate">{ROLE_LABELS[currentUser.role] || currentUser.title}</span>
          {dept && (
            <>
              <span className="opacity-50 shrink-0">•</span>
              <span className="font-medium opacity-80 shrink-0">{dept.abbreviation}</span>
            </>
          )}
        </div>
      </div>

      {/* Center: Search */}
      <div className="flex-1 max-w-md relative mx-4 min-w-0 overflow-hidden hidden md:block">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/50 border border-transparent rounded-lg text-sm text-muted-foreground hover:bg-muted hover:border-border transition-all min-w-0 overflow-hidden"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="text-left flex-1 truncate min-w-0">Search projects, assets, tasks...</span>
          <kbd className="hidden lg:inline-flex shrink-0 h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0 ml-auto justify-end">
        {['vfx_producer', 'production_manager', 'coordinator', 'supervisor', 'lead'].includes(currentUser.role) && (
          <Button
            onClick={() => setCreateTaskModalOpen(true)}
            className="hidden md:flex bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-full px-5 text-xs h-8 mr-2 transition-all shadow-[0_0_15px_rgba(var(--primary),0.3)]"
          >
            Assign Task
          </Button>
        )}
        
        <TimeClockWidget />

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>

        {/* Notifications */}
        <DropdownMenu open={notificationPanelOpen} onOpenChange={setNotificationPanelOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label={`Notifications, ${unreadNotifs} unread`}>
              <Bell className="w-4 h-4" />
              {unreadNotifs > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-[10px] font-bold text-destructive-foreground rounded-full flex items-center justify-center animate-in zoom-in">
                  {unreadNotifs > 9 ? '9+' : unreadNotifs}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground">Mark all read</Button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {NOTIFICATIONS.slice(0, 10).map(notif => (
              <DropdownMenuItem key={notif.id} className="flex-col items-start gap-1 py-3 cursor-pointer">
                <div className="flex items-center gap-2 w-full">
                  {!notif.read && <div className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                  <span className={`font-medium text-sm ${notif.read ? 'text-muted-foreground' : ''}`}>{notif.title}</span>
                  <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1 capitalize">{notif.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground pl-4 line-clamp-2">{notif.description}</p>
                <span className="text-[10px] text-muted-foreground/60 pl-4">{notif.timestamp}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="justify-center text-primary">
              <Link href="/notifications">View all notifications</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full ml-1">
              <Avatar className="h-8 w-8 border border-border">
                <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
                <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{currentUser.name}</p>
                <p className="text-[10px] leading-none text-muted-foreground">{ROLE_LABELS[currentUser.role] || currentUser.title}</p>
                {dept && <p className="text-[10px] leading-none text-muted-foreground mt-1">{dept.name}</p>}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/profile">Profile</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/settings">Settings</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Demo: Switch Role</div>
            {USERS.filter(u => ['vfx_producer', 'artist'].includes(u.role)).slice(0, 3).map(u => (
              <DropdownMenuItem 
                key={u.id} 
                onClick={() => { switchUser(u.id); window.location.reload(); }}
                className={`cursor-pointer ${currentUser.id === u.id ? 'bg-primary/10' : ''}`}
              >
                {u.name} ({ROLE_LABELS[u.role] || u.role})
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-500 cursor-pointer flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

import { Bell, Search, Sun, Moon, User, Shield, Eye, ChevronDown } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { USERS, NOTIFICATIONS } from '@/data/mockData';
import { useUIStore } from '@/store/ui';
import { useWorkspaceStore } from '@/store/workspace';
import type { Role } from '@/data/mockData';
import { Link } from 'wouter';

const ROLE_CONFIG: Record<Role, { label: string; icon: typeof Shield; color: string }> = {
  manager: { label: 'Manager', icon: Shield, color: 'text-blue-500' },
  animator: { label: 'Animator', icon: User, color: 'text-green-500' },
  reviewer: { label: 'Reviewer', icon: Eye, color: 'text-purple-500' },
};

export function TopBar() {
  const { setTheme, theme } = useTheme();
  const { setSearchOpen, setCommandPaletteOpen, notificationPanelOpen, setNotificationPanelOpen } = useUIStore();
  const { currentRole, setRole } = useWorkspaceStore();
  const currentUser = USERS[0];
  const unreadNotifs = NOTIFICATIONS.filter(n => !n.read).length;
  const roleConfig = ROLE_CONFIG[currentRole];

  return (
    <div className="h-14 border-b border-border bg-card/80 backdrop-blur-md flex items-center justify-between px-4 sticky top-0 z-30">
      {/* Left: Brand + Role */}
      <div className="flex items-center gap-3 w-1/3">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
            <div className="w-3.5 h-3.5 bg-card rounded-sm" />
          </div>
          <span className="font-bold text-lg tracking-tight hidden md:inline">Forge</span>
        </Link>

        <div className="h-5 w-px bg-border hidden md:block" />

        {/* Role Switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 hidden md:flex">
              <roleConfig.icon className={`w-3.5 h-3.5 ${roleConfig.color}`} />
              <span className="text-sm">{roleConfig.label}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Switch Role</DropdownMenuLabel>
            {(Object.keys(ROLE_CONFIG) as Role[]).map(role => {
              const config = ROLE_CONFIG[role];
              return (
                <DropdownMenuItem key={role} onClick={() => setRole(role)} className="gap-2">
                  <config.icon className={`w-4 h-4 ${config.color}`} />
                  <span>{config.label}</span>
                  {role === currentRole && <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1">Active</Badge>}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Center: Search */}
      <div className="flex-1 max-w-md relative">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/50 border border-transparent rounded-lg text-sm text-muted-foreground hover:bg-muted hover:border-border transition-all"
        >
          <Search className="w-4 h-4" />
          <span className="flex-1 text-left">Search projects, assets, tasks...</span>
          <kbd className="hidden md:inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 w-1/3 justify-end">
        <Button className="hidden md:flex bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-full px-5 text-xs h-8 mr-2 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]">
          Try FORGE for free
        </Button>
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
              <Avatar className="h-8 w-8">
                <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
                <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{currentUser.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{currentUser.role}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/profile">Profile</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/settings">Settings</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

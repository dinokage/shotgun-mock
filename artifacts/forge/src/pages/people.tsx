import { useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { stagger } from '@/lib/motion';
import { useAuthStore } from '@/store/auth';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { USERS, DEPARTMENTS, ROLE_LABELS } from '@/data/mockData';
import { Search, Filter, Mail, Building2, ExternalLink, Users2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { STUDIO_LEADERSHIP_ROLES } from '@/store/permissions';

export default function People() {
  const prefersReducedMotion = useReducedMotion();
  const { currentUser } = useAuthStore();
  
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');

  const filteredUsers = useMemo(() => {
    if (!currentUser) return [];
    
    // RBAC Rules for Roster Visibility
    const isDeptLeadership = ['supervisor', 'lead'].includes(currentUser.role);
    const isArtist = ['senior_artist', 'artist', 'junior_artist'].includes(currentUser.role);
    const isClient = currentUser.role === 'client';

    return USERS.filter(u => {
      // 1. Enforce RBAC visibility
      if (isArtist && u.departmentId !== currentUser.departmentId) {
        return false; // Artists only see their own department
      }
      if (isDeptLeadership) {
        const uIsLeadership = ['vfx_producer', 'production_manager', 'supervisor', 'lead'].includes(u.role);
        if (u.departmentId !== currentUser.departmentId && !uIsLeadership) {
          return false; // Dept Leads see their dept + all other leads/producers
        }
      }
      if (isClient && !STUDIO_LEADERSHIP_ROLES.includes(u.role)) {
        return false; // Clients only see their studio points of contact, not the internal roster
      }

      // 2. Apply UI search/filters
      if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (deptFilter !== 'all' && u.departmentId !== deptFilter) return false;
      return true;
    });
  }, [search, deptFilter, currentUser]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Studio Roster</h1>
          <p className="text-muted-foreground mt-1">Directory of all {filteredUsers.length} active personnel</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name, role..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11"
          />
        </div>
        <div className="flex gap-2">
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[200px] h-11">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {DEPARTMENTS.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredUsers.length === 0 && (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users2 />
            </EmptyMedia>
            <EmptyTitle>No people found</EmptyTitle>
            <EmptyDescription>
              {search || deptFilter !== 'all'
                ? 'Try adjusting your search or department filter.'
                : "There's no one visible in your roster yet."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-6">
        {filteredUsers.map((user, i) => {
          const dept = DEPARTMENTS.find(d => d.id === user.departmentId);
          return (
            <motion.div key={user.id} {...(prefersReducedMotion ? {} : stagger(i))}>
            <Link href={`/people/${user.id}`}>
              <Card className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg group h-full">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <Avatar className="w-16 h-16 border-2 shadow-sm" style={{ borderColor: dept?.color || 'var(--border)' }}>
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <Badge variant={user.status === 'active' ? 'default' : 'secondary'} className={user.status === 'active' ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20 shadow-none text-[10px] px-1.5 py-0' : 'text-[10px] px-1.5 py-0'}>
                      {user.status}
                    </Badge>
                  </div>
                  
                  <div className="mb-4">
                    <h3 className="font-semibold text-base group-hover:text-primary transition-colors flex items-center gap-1">
                      {user.name}
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h3>
                    <div className="text-sm text-muted-foreground">{ROLE_LABELS[user.role] || user.title}</div>
                  </div>

                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5" />
                      <span className="font-medium" style={{ color: dept?.color }}>{dept?.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5" />
                      <span className="truncate">{user.email}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1">
                    {user.skills.slice(0, 3).map(skill => (
                      <span key={skill} className="px-1.5 py-0.5 bg-muted rounded-md text-[10px]">
                        {skill}
                      </span>
                    ))}
                    {user.skills.length > 3 && (
                      <span className="px-1.5 py-0.5 bg-muted rounded-md text-[10px]">
                        +{user.skills.length - 3}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
            </motion.div>
          )
        })}
      </div>
    </div>
  );
}

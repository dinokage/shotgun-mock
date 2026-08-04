import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { USERS } from '@/data/mockData';
import { cn } from '@/lib/utils';

export function UserAvatar({ userId, className }: { userId: string, className?: string }) {
  const user = USERS.find(u => u.id === userId);
  
  if (!user) {
    return (
      <Avatar className={cn("w-6 h-6", className)}>
        <AvatarFallback className="text-[10px]">?</AvatarFallback>
      </Avatar>
    );
  }

  return (
    <Avatar className={cn("w-6 h-6 border border-background", className)} title={user.name}>
      <AvatarImage src={user.avatar} alt={user.name} />
      <AvatarFallback className="text-[10px]">{user.name.charAt(0)}</AvatarFallback>
    </Avatar>
  );
}

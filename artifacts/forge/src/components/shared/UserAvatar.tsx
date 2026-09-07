import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUserStore } from "@/store/users";
import { cn } from "@/lib/utils";

export function UserAvatar({
  userId,
  className,
}: {
  userId: string;
  className?: string;
}) {
  // Reactive store, not the raw USERS array -- fetchMe() mutates USERS in
  // place with real data, which updates its *contents* but never triggers
  // a re-render for a component that already mounted before that mutation
  // (e.g. one rendered during the brief pre-login/pre-hydration window).
  const users = useUserStore((s) => s.users);
  const user = users.find((u) => u.id === userId);

  if (!user) {
    return (
      <Avatar className={cn("w-6 h-6", className)}>
        <AvatarFallback className="text-[10px]">?</AvatarFallback>
      </Avatar>
    );
  }

  return (
    <Avatar
      className={cn("w-6 h-6 border border-background", className)}
      title={user.name}
    >
      <AvatarImage src={user.avatar} alt={user.name} />
      <AvatarFallback className="text-[10px]">
        {user.name.charAt(0)}
      </AvatarFallback>
    </Avatar>
  );
}

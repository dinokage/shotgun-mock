import { Badge } from "@/components/ui/badge";

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  low: "bg-green-500/10 text-green-500 border-green-500/20",
};

export function PriorityChip({
  priority,
  className = "",
}: {
  priority: string;
  className?: string;
}) {
  const style =
    PRIORITY_STYLES[priority.toLowerCase()] || "bg-muted text-muted-foreground";
  return (
    <Badge
      className={`${style} text-[10px] font-semibold capitalize ${className}`}
    >
      {priority}
    </Badge>
  );
}

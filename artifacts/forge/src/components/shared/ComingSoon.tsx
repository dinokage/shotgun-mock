import { type LucideIcon } from "lucide-react";

/**
 * Placeholder for a feature that exists in the UI shell but isn't ready for
 * general studio use yet -- DCC integration hooks aren't built, so the
 * marketplace and integrations pages would otherwise let anyone "connect" a
 * DCC app or install a plugin that does nothing behind the button. Shown to
 * everyone except admin, who still sees and can exercise the real page while
 * the feature is finished.
 */
export function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight mb-2">{title}</h1>
      <p className="text-muted-foreground max-w-md">{description}</p>
      <div className="mt-4 px-3 py-1 rounded-full bg-muted text-xs font-medium text-muted-foreground">
        Coming soon
      </div>
    </div>
  );
}

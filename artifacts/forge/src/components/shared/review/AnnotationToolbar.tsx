import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ANNOTATION_TOOLS, type AnnotationTool } from "./types";

interface AnnotationToolbarProps {
  tool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  colors: string[];
  /** Visual variant — the client portal uses a darker/zinc palette than the internal app. */
  variant?: "internal" | "client";
  className?: string;
  disabled?: boolean;
}

/**
 * Drawing-tool + color-swatch picker shared by the internal review player and
 * the client review portal. Both pages render this inside their own floating
 * toolbar chrome, which is why layout wrappers (position, backdrop, border)
 * stay page-owned and only the controls themselves are shared here.
 */
export function AnnotationToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  colors,
  variant = "internal",
  className,
  disabled,
}: AnnotationToolbarProps) {
  const isClient = variant === "client";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex gap-1 items-center">
        {ANNOTATION_TOOLS.map(({ id, icon: Icon, label }) => (
          <Button
            key={id}
            size="icon"
            variant={tool === id ? "secondary" : "ghost"}
            disabled={disabled}
            className={cn(
              "h-8 w-8",
              isClient
                ? cn(
                    "text-zinc-300 hover:text-white hover:bg-white/10",
                    tool === id && "bg-white/10 text-emerald-400",
                  )
                : tool === id && id !== "select" && "text-primary",
            )}
            aria-label={label}
            aria-pressed={tool === id}
            onClick={() => onToolChange(id)}
          >
            <Icon className="w-4 h-4" />
          </Button>
        ))}
      </div>
      <div
        className={cn("w-px my-1", isClient ? "bg-white/10" : "bg-border")}
      />
      <div className="flex gap-1 items-center px-1">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            disabled={disabled}
            aria-label={`Select color ${c}`}
            className={cn(
              "w-5 h-5 rounded-full border-2 transition-transform",
              color === c
                ? cn(
                    "scale-125 shadow-sm hover:scale-[1.35] hover:shadow-md",
                    isClient ? "border-emerald-500" : "border-primary",
                  )
                : "border-transparent hover:scale-110",
            )}
            style={{ backgroundColor: c }}
            onClick={() => onColorChange(c)}
          />
        ))}
      </div>
    </div>
  );
}

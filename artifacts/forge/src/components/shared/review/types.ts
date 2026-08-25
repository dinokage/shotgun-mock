import type { Dispatch, SetStateAction } from "react";
import {
  MousePointer2,
  PenTool,
  ArrowUpRight,
  Square,
  Type,
  type LucideIcon,
} from "lucide-react";

/**
 * Shared types + constants for the annotation-player toolset used by both the
 * internal review page (src/pages/review.tsx) and the client-facing review
 * portal (src/pages/client-review.tsx).
 */

export type AnnotationTool = "select" | "pen" | "arrow" | "rectangle" | "text";

export interface Point {
  x: number;
  y: number;
}

export interface Annotation {
  id: string;
  frame: number;
  type: AnnotationTool;
  color: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  points?: Point[];
  text?: string;
  startFrame?: number;
  endFrame?: number;
  fontFamily?: string;
  fontSize?: number;
  backgroundColor?: string;
}

/** Element currently being dragged on the annotation canvas (or, on the
 * internal review page, a video clip being repositioned in the compositor). */
export interface DraggingElement {
  id: string;
  type: "video" | "annotation";
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
}

export interface AnnotationToolDef {
  id: AnnotationTool;
  icon: LucideIcon;
  label: string;
}

export const ANNOTATION_TOOLS: AnnotationToolDef[] = [
  { id: "select", icon: MousePointer2, label: "Select" },
  { id: "pen", icon: PenTool, label: "Draw freehand" },
  { id: "arrow", icon: ArrowUpRight, label: "Draw arrow" },
  { id: "rectangle", icon: Square, label: "Draw rectangle" },
  { id: "text", icon: Type, label: "Add text annotation" },
];

export type SetAnnotations = Dispatch<SetStateAction<Annotation[]>>;
export type SetSelectedAnnotationId = Dispatch<SetStateAction<string | null>>;
export type SetDraggingElement = Dispatch<
  SetStateAction<DraggingElement | null>
>;

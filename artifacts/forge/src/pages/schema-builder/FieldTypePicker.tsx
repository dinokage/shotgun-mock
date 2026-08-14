import { useState } from 'react';
import { motion } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { FieldType } from '@/store/schema';
import { FIELD_TYPE_META } from '@/store/schema';
import {
  Type,
  Hash,
  Calendar,
  ToggleLeft,
  ListFilter,
  CheckSquare,
  Sigma,
  ChevronDown,
} from 'lucide-react';

export const FIELD_TYPE_ICONS: Record<FieldType, typeof Type> = {
  text: Type,
  number: Hash,
  date: Calendar,
  boolean: ToggleLeft,
  single_select: ListFilter,
  multi_select: CheckSquare,
  computed: Sigma,
};

const ORDER: FieldType[] = ['text', 'number', 'date', 'boolean', 'single_select', 'multi_select', 'computed'];

export function FieldTypePicker({
  value,
  onChange,
  compact = false,
}: {
  value: FieldType;
  onChange: (type: FieldType) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const Icon = FIELD_TYPE_ICONS[value];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium hover:bg-muted/70 hover:border-primary/40 transition-colors',
            compact && 'px-2 py-1'
          )}
        >
          <Icon className="w-3.5 h-3.5 text-primary" />
          {FIELD_TYPE_META[value].label}
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </motion.button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="grid grid-cols-2 gap-1.5">
          {ORDER.map((type) => {
            const TypeIcon = FIELD_TYPE_ICONS[type];
            const isActive = type === value;
            return (
              <motion.button
                key={type}
                type="button"
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  onChange(type);
                  setOpen(false);
                }}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors',
                  isActive
                    ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                    : 'border-border hover:border-primary/40 hover:bg-muted/50'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <TypeIcon className={cn('w-3.5 h-3.5', isActive ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-xs font-semibold">{FIELD_TYPE_META[type].label}</span>
                </div>
                <span className="text-[10px] text-muted-foreground leading-snug">
                  {FIELD_TYPE_META[type].description}
                </span>
              </motion.button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

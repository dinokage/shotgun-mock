import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Plus, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { FieldTypePicker } from './FieldTypePicker';
import { slugifyKey, RESERVED_KEYS, type EntityField, type FieldType } from '@/store/schema';
import { evaluateExpression, formatExprValue } from '@/lib/expressionEvaluator';
import { EASE_DISSOLVE, DURATION } from '@/lib/motion';

function sampleScopeValue(field: EntityField): string | number | boolean {
  switch (field.type) {
    case 'number':
      return field.defaultValue ? Number(field.defaultValue) : 10;
    case 'boolean':
      return field.defaultValue === 'true';
    case 'single_select':
      return field.defaultValue || field.options?.[0] || '';
    case 'text':
      return field.defaultValue || 'Sample';
    default:
      return field.defaultValue || '';
  }
}

export function FieldRow({
  field,
  siblingFields,
  onUpdate,
  onRemove,
}: {
  field: EntityField;
  siblingFields: EntityField[];
  onUpdate: (updates: Partial<EntityField>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const [optionDraft, setOptionDraft] = useState('');

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const takenKeys = siblingFields.filter((f) => f.id !== field.id).map((f) => f.key);
  const usableFields = siblingFields.filter((f) => f.id !== field.id && f.type !== 'computed' && f.type !== 'date' && f.type !== 'multi_select');

  const handleLabelChange = (label: string) => {
    // Keep the key in sync with the label until the user has manually
    // customized the key themselves — otherwise "Insert:" chips and typed
    // expression references stay frozen on whatever the placeholder label
    // was when the field was created.
    if (field.keyManuallyEdited) {
      onUpdate({ label });
    } else {
      onUpdate({ label, key: slugifyKey(label, takenKeys) });
    }
  };

  const handleKeyChange = (rawKey: string) => {
    const cleaned = rawKey.toLowerCase().replace(/[^a-z0-9_]/g, '');
    onUpdate({ key: cleaned || 'field', keyManuallyEdited: true });
  };

  const handleTypeChange = (type: FieldType) => {
    const updates: Partial<EntityField> = { type };
    if ((type === 'single_select' || type === 'multi_select') && !field.options) {
      updates.options = ['Option A', 'Option B'];
    }
    if (type === 'computed') {
      updates.expression = field.expression ?? '';
      updates.defaultValue = undefined;
    } else if (type !== field.type) {
      // Default values are type-specific (e.g. 'true'/'false' for boolean,
      // an option string for single_select) — clear a stale default instead
      // of carrying one over in a format the new type doesn't understand.
      // Left alone, this silently broke computed-field previews elsewhere
      // (e.g. Number('true') => NaN) and left invalid values sitting in the
      // new type's control.
      updates.defaultValue = undefined;
    }
    onUpdate(updates);
  };

  const addOption = () => {
    const val = optionDraft.trim();
    if (!val) return;
    onUpdate({ options: [...(field.options ?? []), val] });
    setOptionDraft('');
  };

  const removeOption = (index: number) => {
    onUpdate({ options: (field.options ?? []).filter((_, i) => i !== index) });
  };

  const insertRef = (key: string) => {
    const current = field.expression ?? '';
    const needsSpace = current.length > 0 && !current.endsWith(' ');
    onUpdate({ expression: `${current}${needsSpace ? ' ' : ''}${key} ` });
  };

  const scope = Object.fromEntries(usableFields.map((f) => [f.key, sampleScopeValue(f)]));
  const evalResult = field.type === 'computed' ? evaluateExpression(field.expression ?? '', scope) : null;

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -12, scale: 0.97, transition: { duration: DURATION.fast, ease: EASE_DISSOLVE } }}
      transition={{ duration: DURATION.base, ease: EASE_DISSOLVE }}
      className={cn(
        'group rounded-lg border bg-card p-3 space-y-3',
        isDragging ? 'border-primary shadow-lg cursor-grabbing' : 'border-border'
      )}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-1.5 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
          aria-label="Drag to reorder field"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-start">
          <div className="space-y-1 min-w-0">
            <Input
              value={field.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              className="h-8 text-sm font-semibold border-transparent bg-transparent px-1.5 hover:border-input focus-visible:border-input focus-visible:bg-background"
              placeholder="Field label"
            />
            <div className="flex items-center gap-1 px-1.5">
              <span className="text-[10px] text-muted-foreground/70">key:</span>
              <input
                value={field.key}
                onChange={(e) => handleKeyChange(e.target.value)}
                spellCheck={false}
                className="text-[10px] font-mono bg-transparent border-none outline-none text-muted-foreground focus:text-foreground w-32"
              />
              {takenKeys.includes(field.key) && (
                <span className="text-[10px] text-red-500 flex items-center gap-0.5">
                  <AlertCircle className="w-2.5 h-2.5" /> duplicate key
                </span>
              )}
              {!takenKeys.includes(field.key) && RESERVED_KEYS.includes(field.key) && (
                <span className="text-[10px] text-red-500 flex items-center gap-0.5">
                  <AlertCircle className="w-2.5 h-2.5" /> reserved word — unusable in expressions
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <FieldTypePicker value={field.type} onChange={handleTypeChange} />
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5">
                  <span className="text-[10px] text-muted-foreground">Req</span>
                  <Switch
                    checked={field.required}
                    onCheckedChange={(checked) => onUpdate({ required: checked })}
                    className="scale-[0.8]"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>Require a value for this field</TooltipContent>
            </Tooltip>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-1.5 rounded-md text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  aria-label="Remove field"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </motion.button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete field "{field.label || 'Untitled field'}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the field from the entity type. Any computed fields referencing{' '}
                    <span className="font-mono">{field.key}</span> will break. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onRemove}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Type-specific configuration */}
      <div className="pl-6 space-y-2">
        {(field.type === 'text' || field.type === 'number' || field.type === 'date') && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground w-24 shrink-0">Default value</span>
            <Input
              type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
              value={field.defaultValue ?? ''}
              onChange={(e) => onUpdate({ defaultValue: e.target.value })}
              placeholder={field.type === 'text' ? 'Optional…' : undefined}
              className="h-7 text-xs max-w-[220px]"
            />
          </div>
        )}

        {field.type === 'boolean' && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground w-24 shrink-0">Default value</span>
            <Switch
              checked={field.defaultValue === 'true'}
              onCheckedChange={(checked) => onUpdate({ defaultValue: checked ? 'true' : 'false' })}
              className="scale-[0.8]"
            />
          </div>
        )}

        {(field.type === 'single_select' || field.type === 'multi_select') && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              {(field.options ?? []).map((opt, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="gap-1 pr-1 text-[10px] font-normal"
                >
                  {opt}
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    className="hover:text-red-500 ml-0.5"
                    aria-label={`Remove option ${opt}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </Badge>
              ))}
              <div className="flex items-center gap-1">
                <input
                  value={optionDraft}
                  onChange={(e) => setOptionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addOption();
                    }
                  }}
                  placeholder="Add option…"
                  className="h-6 text-[11px] px-2 rounded-full border border-dashed border-border bg-transparent outline-none focus:border-primary w-24"
                />
                <button
                  type="button"
                  onClick={addOption}
                  className="text-muted-foreground hover:text-primary"
                  aria-label="Add option"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {field.type === 'computed' && (
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Expression</span>
            <Textarea
              value={field.expression ?? ''}
              onChange={(e) => onUpdate({ expression: e.target.value })}
              placeholder="e.g. complexity_score * screen_time_minutes * 12"
              className="font-mono text-xs min-h-[52px]"
              spellCheck={false}
            />
            {usableFields.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-muted-foreground/70 mr-0.5">Insert:</span>
                {usableFields.map((f) => (
                  <motion.button
                    key={f.id}
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => insertRef(f.key)}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    {f.key}
                  </motion.button>
                ))}
              </div>
            )}
            {field.expression?.trim() && (
              <div
                className={cn(
                  'flex items-center gap-1.5 text-[11px] rounded-md px-2 py-1 w-fit',
                  evalResult?.error
                    ? 'text-red-500 bg-red-500/10'
                    : 'text-emerald-500 bg-emerald-500/10'
                )}
              >
                {evalResult?.error ? (
                  <>
                    <AlertCircle className="w-3 h-3" /> {evalResult.error}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3" /> Preview: {formatExprValue(evalResult?.value ?? null)}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {field.description !== undefined && (
          <Input
            value={field.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Helper text shown to artists filling this out (optional)"
            className="h-7 text-[11px] text-muted-foreground border-dashed max-w-md"
          />
        )}
        {field.description === undefined && (
          <button
            type="button"
            onClick={() => onUpdate({ description: '' })}
            className="text-[10px] text-muted-foreground/60 hover:text-primary transition-colors"
          >
            + add helper text
          </button>
        )}
      </div>
    </motion.div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Wand2, Sigma, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EntityField, EntityTypeDef } from '@/store/schema';
import { evaluateExpression, formatExprValue, type ExprValue } from '@/lib/expressionEvaluator';
import { FIELD_TYPE_ICONS } from './FieldTypePicker';
import { DURATION, EASE_CUT } from '@/lib/motion';

const SAMPLE_TEXT_POOL = ['Nova Prime', 'Kestrel Rig', 'Onyx Sequence', 'Aurora Set', 'Vantage Shot', 'Ember Build'];

function defaultRawValue(field: EntityField): string {
  switch (field.type) {
    case 'boolean':
      return field.defaultValue === 'true' ? 'true' : 'false';
    case 'single_select':
      return field.defaultValue || field.options?.[0] || '';
    case 'multi_select':
      return field.defaultValue || '';
    default:
      return field.defaultValue ?? '';
  }
}

function randomRawValue(field: EntityField): string {
  switch (field.type) {
    case 'text':
      return SAMPLE_TEXT_POOL[Math.floor(Math.random() * SAMPLE_TEXT_POOL.length)];
    case 'number':
      return String(Math.floor(Math.random() * 40) + 1);
    case 'date': {
      const d = new Date(Date.now() + Math.floor(Math.random() * 60) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    case 'boolean':
      return Math.random() > 0.5 ? 'true' : 'false';
    case 'single_select':
      return field.options?.[Math.floor(Math.random() * (field.options?.length || 1))] ?? '';
    case 'multi_select': {
      const opts = field.options ?? [];
      const picked = opts.filter(() => Math.random() > 0.5);
      return (picked.length > 0 ? picked : opts.slice(0, 1)).join(',');
    }
    default:
      return '';
  }
}

function coerceForScope(field: EntityField, raw: string): ExprValue {
  if (field.type === 'number') return raw === '' ? 0 : Number(raw);
  if (field.type === 'boolean') return raw === 'true';
  return raw;
}

export function LivePreview({ entityType }: { entityType: EntityTypeDef }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Full reset when switching between entity types entirely.
  useEffect(() => {
    const initial: Record<string, string> = {};
    entityType.fields.forEach((f) => {
      initial[f.id] = defaultRawValue(f);
    });
    setValues(initial);
    setTouched({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType.id]);

  // Keep untouched fields synced to their (possibly just-edited) default, and
  // seed any newly-added fields, without clobbering values the user typed
  // into the preview.
  const fieldSignature = entityType.fields
    .map((f) => `${f.id}:${f.type}:${f.defaultValue ?? ''}:${(f.options ?? []).join(',')}`)
    .join('|');

  useEffect(() => {
    setValues((prev) => {
      const next = { ...prev };
      let changed = false;
      entityType.fields.forEach((f) => {
        if (touched[f.id]) return;
        const d = defaultRawValue(f);
        if (next[f.id] !== d) {
          next[f.id] = d;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldSignature]);

  const setValue = (fieldId: string, raw: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: raw }));
    setTouched((prev) => ({ ...prev, [fieldId]: true }));
  };

  const toggleMultiOption = (field: EntityField, option: string) => {
    const current = (values[field.id] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
    setValue(field.id, next.join(','));
  };

  const randomize = () => {
    const next: Record<string, string> = {};
    const nextTouched: Record<string, boolean> = {};
    entityType.fields.forEach((f) => {
      if (f.type === 'computed') return;
      next[f.id] = randomRawValue(f);
      nextTouched[f.id] = true;
    });
    setValues((prev) => ({ ...prev, ...next }));
    setTouched((prev) => ({ ...prev, ...nextTouched }));
  };

  const scope = useMemo(() => {
    const s: Record<string, ExprValue> = {};
    entityType.fields.forEach((f) => {
      if (f.type === 'computed' || f.type === 'date' || f.type === 'multi_select') return;
      s[f.key] = coerceForScope(f, values[f.id] ?? '');
    });
    return s;
  }, [entityType.fields, values]);

  return (
    <Card className="sticky top-4 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Live Preview
            </CardTitle>
            <CardDescription className="text-xs">
              What artists see when creating a new {entityType.name || 'Entity'}
            </CardDescription>
          </div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={randomize}>
              <Wand2 className="w-3 h-3" /> Randomize
            </Button>
          </motion.div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {entityType.fields.length === 0 && (
          <div className="text-center py-10 text-xs text-muted-foreground border-2 border-dashed border-border rounded-lg">
            Add a field to see the live preview form appear here.
          </div>
        )}
        <AnimatePresence initial={false} mode="popLayout">
          {entityType.fields.map((field) => {
            const Icon = FIELD_TYPE_ICONS[field.type];
            const raw = values[field.id] ?? '';

            return (
              <motion.div
                key={field.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: DURATION.base, ease: EASE_CUT }}
                className="space-y-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3 h-3 text-muted-foreground" />
                  <label className="text-xs font-medium text-foreground/90">
                    {field.label || 'Untitled field'}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  {field.description && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3 h-3 text-muted-foreground/50" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[220px] text-xs">{field.description}</TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {field.type === 'text' && (
                  <Input
                    value={raw}
                    onChange={(e) => setValue(field.id, e.target.value)}
                    className="h-8 text-sm"
                    placeholder="—"
                  />
                )}
                {field.type === 'number' && (
                  <Input
                    type="number"
                    value={raw}
                    onChange={(e) => setValue(field.id, e.target.value)}
                    className="h-8 text-sm"
                  />
                )}
                {field.type === 'date' && (
                  <Input
                    type="date"
                    value={raw}
                    onChange={(e) => setValue(field.id, e.target.value)}
                    className="h-8 text-sm"
                  />
                )}
                {field.type === 'boolean' && (
                  <Switch checked={raw === 'true'} onCheckedChange={(c) => setValue(field.id, c ? 'true' : 'false')} />
                )}
                {field.type === 'single_select' && (
                  <Select value={raw} onValueChange={(v) => setValue(field.id, v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.options ?? []).map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {field.type === 'multi_select' && (
                  <div className="flex flex-wrap gap-1.5">
                    {(field.options ?? []).length === 0 && (
                      <span className="text-[11px] text-muted-foreground">No options defined yet.</span>
                    )}
                    {(field.options ?? []).map((opt) => {
                      const selected = raw.split(',').map((s) => s.trim()).includes(opt);
                      return (
                        <motion.button
                          key={opt}
                          type="button"
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => toggleMultiOption(field, opt)}
                          className={cn(
                            'text-[11px] px-2 py-1 rounded-full border transition-colors',
                            selected
                              ? 'bg-primary/15 border-primary/50 text-primary font-medium'
                              : 'border-border text-muted-foreground hover:border-primary/30'
                          )}
                        >
                          {opt}
                        </motion.button>
                      );
                    })}
                  </div>
                )}
                {field.type === 'computed' && (
                  <ComputedPreviewValue field={field} scope={scope} />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

function ComputedPreviewValue({ field, scope }: { field: EntityField; scope: Record<string, ExprValue> }) {
  const result = evaluateExpression(field.expression ?? '', scope);
  const display = formatExprValue(result.value);

  return (
    <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Sigma className="w-3 h-3 text-primary/70" />
        <span className="font-mono truncate max-w-[140px]">{field.expression || '—'}</span>
      </div>
      <AnimatePresence mode="wait">
        {result.error ? (
          <motion.span
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[11px] text-red-500"
          >
            error
          </motion.span>
        ) : (
          <motion.span
            key={display}
            initial={{ opacity: 0, scale: 1.15 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DURATION.fast, ease: EASE_CUT }}
            className="text-sm font-semibold text-primary tabular-nums"
          >
            {display}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

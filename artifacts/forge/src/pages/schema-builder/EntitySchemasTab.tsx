import { useMemo, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Plus,
  MoreVertical,
  Copy,
  Trash2,
  Boxes,
  PawPrint,
  Layers,
  Box,
  Film,
  Sparkles as SparklesIcon,
  Mountain,
  Rocket,
  Gem,
  Shield,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSchemaStore, type FieldType } from '@/store/schema';
import { FieldRow } from './FieldRow';
import { LivePreview } from './LivePreview';
import { useToast } from '@/hooks/use-toast';
import { stagger, DURATION, EASE_DISSOLVE } from '@/lib/motion';

const ICON_OPTIONS = [
  { name: 'Boxes', Icon: Boxes },
  { name: 'PawPrint', Icon: PawPrint },
  { name: 'Layers', Icon: Layers },
  { name: 'Box', Icon: Box },
  { name: 'Film', Icon: Film },
  { name: 'Sparkles', Icon: SparklesIcon },
  { name: 'Mountain', Icon: Mountain },
  { name: 'Rocket', Icon: Rocket },
  { name: 'Gem', Icon: Gem },
  { name: 'Shield', Icon: Shield },
] as const;

const ICON_MAP: Record<string, typeof Boxes> = Object.fromEntries(ICON_OPTIONS.map((o) => [o.name, o.Icon]));

const COLOR_OPTIONS = [
  '#4facfe', '#a55eea', '#4ecdc4', '#fdcb6e', '#fd79a8',
  '#0984e3', '#ff6b6b', '#ff9f43', '#00b894', '#6c5ce7',
];

function EntityIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Boxes;
  return <Icon className={className} />;
}

export function EntitySchemasTab() {
  const entityTypes = useSchemaStore((s) => s.entityTypes);
  const addEntityType = useSchemaStore((s) => s.addEntityType);
  const updateEntityType = useSchemaStore((s) => s.updateEntityType);
  const deleteEntityType = useSchemaStore((s) => s.deleteEntityType);
  const duplicateEntityType = useSchemaStore((s) => s.duplicateEntityType);
  const addField = useSchemaStore((s) => s.addField);
  const updateField = useSchemaStore((s) => s.updateField);
  const removeField = useSchemaStore((s) => s.removeField);
  const reorderFields = useSchemaStore((s) => s.reorderFields);

  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(entityTypes[0]?.id ?? null);

  const selected = useMemo(
    () => entityTypes.find((e) => e.id === selectedId) ?? null,
    [entityTypes, selectedId]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleCreate = () => {
    const id = addEntityType({ name: 'New Entity Type' });
    setSelectedId(id);
  };

  const handleDelete = (id: string) => {
    const wasSelected = id === selectedId;
    deleteEntityType(id);
    if (wasSelected) {
      const remaining = entityTypes.filter((e) => e.id !== id);
      setSelectedId(remaining[0]?.id ?? null);
    }
    toast({ title: 'Entity type deleted' });
  };

  const handleDuplicate = (id: string) => {
    const newId = duplicateEntityType(id);
    if (newId) setSelectedId(newId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!selected) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = selected.fields.map((f) => f.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    reorderFields(selected.id, arrayMove(ids, oldIndex, newIndex));
  };

  const handleAddField = (type: FieldType = 'text') => {
    if (!selected) return;
    addField(selected.id, { label: 'New Field', type });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
      {/* Entity type list */}
      <div className="space-y-3">
        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Button onClick={handleCreate} className="w-full gap-2 justify-start" variant="outline">
            <Plus className="w-4 h-4" /> New Entity Type
          </Button>
        </motion.div>

        <LayoutGroup>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {entityTypes.map((entity, i) => (
                <motion.div key={entity.id} layout {...stagger(i, 0.03)} exit={{ opacity: 0, x: -8 }}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(entity.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(entity.id);
                      }
                    }}
                    className={cn(
                      'w-full text-left rounded-lg border p-3 transition-colors group relative cursor-pointer',
                      entity.id === selectedId
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20 hover:bg-primary/10'
                        : 'border-border hover:border-primary/30 hover:bg-muted/30'
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${entity.color}22`, color: entity.color }}
                      >
                        <EntityIcon name={entity.icon} className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate pr-5">{entity.name || 'Untitled'}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {entity.fields.length} field{entity.fields.length === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>

                    <div
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 rounded hover:bg-muted text-muted-foreground">
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => handleDuplicate(entity.id)} className="gap-2">
                            <Copy className="w-3.5 h-3.5" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => handleDelete(entity.id)}
                            className="gap-2 text-red-500 focus:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </LayoutGroup>

        {entityTypes.length === 0 && (
          <div className="text-center py-10 text-xs text-muted-foreground border-2 border-dashed border-border rounded-lg">
            No entity types yet. Create your first one.
          </div>
        )}
      </div>

      {/* Builder */}
      <div>
        {!selected ? (
          <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center text-muted-foreground border-2 border-dashed border-border rounded-lg gap-2">
            <Boxes className="w-8 h-8 opacity-40" />
            <p className="text-sm">Select or create an entity type to start building its schema.</p>
          </div>
        ) : (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.base, ease: EASE_DISSOLVE }}
            className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start"
          >
            <div className="space-y-4">
              {/* Meta card */}
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <Popover>
                      <PopoverTrigger asChild>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 border border-border"
                          style={{ backgroundColor: `${selected.color}22`, color: selected.color }}
                        >
                          <EntityIcon name={selected.icon} className="w-5 h-5" />
                        </motion.button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 space-y-3" align="start">
                        <div>
                          <div className="text-[11px] font-medium text-muted-foreground mb-1.5">Icon</div>
                          <div className="grid grid-cols-5 gap-1.5">
                            {ICON_OPTIONS.map(({ name, Icon }) => (
                              <motion.button
                                key={name}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => updateEntityType(selected.id, { icon: name })}
                                className={cn(
                                  'aspect-square rounded-md flex items-center justify-center border',
                                  selected.icon === name ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                                )}
                              >
                                <Icon className="w-4 h-4" />
                              </motion.button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-medium text-muted-foreground mb-1.5">Color</div>
                          <div className="grid grid-cols-5 gap-1.5">
                            {COLOR_OPTIONS.map((c) => (
                              <motion.button
                                key={c}
                                whileHover={{ scale: 1.15 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => updateEntityType(selected.id, { color: c })}
                                className={cn(
                                  'aspect-square rounded-md border-2',
                                  selected.color === c ? 'border-foreground' : 'border-transparent'
                                )}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    <div className="flex-1 space-y-2">
                      <Input
                        value={selected.name}
                        onChange={(e) => updateEntityType(selected.id, { name: e.target.value })}
                        className="text-lg font-bold h-9 border-transparent bg-transparent px-1.5 -ml-1.5 hover:border-input focus-visible:border-input focus-visible:bg-background"
                        placeholder="Entity type name (e.g. Creature, Prop Vehicle)"
                      />
                      <Textarea
                        value={selected.description}
                        onChange={(e) => updateEntityType(selected.id, { description: e.target.value })}
                        placeholder="What is this entity type used for?"
                        className="text-xs min-h-[44px] resize-none border-transparent bg-transparent px-1.5 -ml-1.5 hover:border-input focus-visible:border-input focus-visible:bg-background"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Fields */}
              <Card>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Fields</h3>
                    <div className="flex items-center gap-1.5">
                      {selected.fields.some((f) => f.type === 'computed') && (
                        <Badge variant="outline" className="text-[10px] gap-1 text-primary border-primary/30">
                          <Wand2 className="w-2.5 h-2.5" /> has computed field
                        </Badge>
                      )}
                      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => handleAddField('text')}>
                          <Plus className="w-3 h-3" /> Add Field
                        </Button>
                      </motion.div>
                    </div>
                  </div>

                  {selected.fields.length === 0 ? (
                    <div className="text-center py-10 text-xs text-muted-foreground border-2 border-dashed border-border rounded-lg">
                      No fields yet — add your first field to start shaping this entity's form.
                    </div>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={selected.fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          <AnimatePresence initial={false}>
                            {selected.fields.map((field) => (
                              <FieldRow
                                key={field.id}
                                field={field}
                                siblingFields={selected.fields}
                                onUpdate={(updates) => updateField(selected.id, field.id, updates)}
                                onRemove={() => removeField(selected.id, field.id)}
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </CardContent>
              </Card>
            </div>

            <LivePreview entityType={selected} />
          </motion.div>
        )}
      </div>
    </div>
  );
}

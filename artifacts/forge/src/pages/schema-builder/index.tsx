import { useState } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Boxes, ClipboardList, Sparkles } from 'lucide-react';
import { EntitySchemasTab } from './EntitySchemasTab';
import { TaskTemplatesTab } from './TaskTemplatesTab';
import { fadeInUp } from '@/lib/motion';

export default function SchemaBuilder() {
  const [tab, setTab] = useState<'entities' | 'templates'>('entities');

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <motion.div {...fadeInUp} className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">Schema Builder</h1>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
              <Sparkles className="w-3 h-3" /> No-Code
            </span>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Design custom entity types with real field logic and reusable task template bundles —
            directly in the product, no API or config file required.
          </p>
        </div>
      </motion.div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
        <TabsList>
          <TabsTrigger value="entities" className="gap-2">
            <Boxes className="w-4 h-4" /> Entity Schemas
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <ClipboardList className="w-4 h-4" /> Task Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="entities" className="mt-6 animate-in fade-in">
          <EntitySchemasTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-6 animate-in fade-in">
          <TaskTemplatesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

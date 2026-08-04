import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { GripVertical, Trash2, Plus, ArrowRight, Save, Database, AlignLeft, Hash, Calendar, ListFilter, User, Link as LinkIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const FIELD_ICONS: Record<string, any> = {
  text: AlignLeft,
  number: Hash,
  date: Calendar,
  select: ListFilter,
  'user-ref': User,
  'entity-ref': LinkIcon
};

export default function SchemaBuilder() {
  const [step, setStep] = useState(1);
  const [fields, setFields] = useState([
    { id: '1', name: 'Vendor Code', type: 'text', required: true },
    { id: '2', name: 'Delivery Date', type: 'date', required: false },
    { id: '3', name: 'Complexity', type: 'select', required: true },
  ]);
  const { toast } = useToast();

  const addField = () => {
    setFields([...fields, { id: Math.random().toString(), name: 'New Field', type: 'text', required: false }]);
  };

  const removeField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const updateField = (id: string, key: string, val: any) => {
    setFields(fields.map(f => f.id === id ? { ...f, [key]: val } : f));
  };

  return (
    <div className="flex flex-col h-full bg-background relative max-w-[1400px] mx-auto w-full p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Entity Schema Builder</h1>
        <div className="flex items-center gap-2">
          {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>}
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} className="gap-2">Next <ArrowRight className="w-4 h-4"/></Button>
          ) : (
            <Button onClick={() => toast({ title: 'Schema saved', description: 'New entity schema registered.' })} className="gap-2"><Save className="w-4 h-4"/> Save Schema</Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-8 max-w-2xl mx-auto w-full">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex-1 flex items-center gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {s}
            </div>
            <div className={`h-1 flex-1 rounded ${step > s ? 'bg-primary' : 'bg-muted'}`} />
          </div>
        ))}
      </div>

      <div className="flex-1 bg-card border border-border rounded-xl shadow-sm overflow-hidden p-8 max-w-4xl mx-auto w-full relative">
        {step === 1 && (
          <div className="space-y-8 animate-in slide-in-from-right-8">
            <div>
              <h2 className="text-xl font-semibold mb-1">Entity Information</h2>
              <p className="text-muted-foreground text-sm">Define the basic identity of this new entity type.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Entity Name</label>
                <Input defaultValue="Outsource Batch" className="max-w-md" />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Color Theme</label>
                <div className="flex gap-3">
                  {['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500'].map((c, i) => (
                    <div key={i} className={`w-8 h-8 rounded-full cursor-pointer ${c} ${i === 4 ? 'ring-2 ring-offset-2 ring-offset-background ring-primary' : ''}`} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in slide-in-from-right-8 h-full flex flex-col">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold mb-1">Define Fields</h2>
                <p className="text-muted-foreground text-sm">Add custom metadata fields for this entity.</p>
              </div>
              <Button onClick={addField} size="sm" variant="outline"><Plus className="w-4 h-4 mr-1"/> Add Field</Button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3">
              {fields.map(f => {
                const Icon = FIELD_ICONS[f.type] || AlignLeft;
                return (
                  <div key={f.id} className="flex items-center gap-3 p-3 border border-border rounded-lg bg-muted/20">
                    <GripVertical className="w-5 h-5 text-muted-foreground cursor-grab" />
                    <Input value={f.name} onChange={e => updateField(f.id, 'name', e.target.value)} className="w-64" />
                    <Select value={f.type} onValueChange={v => updateField(f.id, 'type', v)}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text String</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="select">Dropdown</SelectItem>
                        <SelectItem value="user-ref">User Reference</SelectItem>
                        <SelectItem value="entity-ref">Entity Link</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2 ml-4">
                      <Switch checked={f.required} onCheckedChange={v => updateField(f.id, 'required', v)} />
                      <span className="text-sm text-muted-foreground">Required</span>
                    </div>
                    <Button variant="ghost" size="icon" className="ml-auto text-destructive hover:bg-destructive/10" onClick={() => removeField(f.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-8 animate-in slide-in-from-right-8">
            <div>
              <h2 className="text-xl font-semibold mb-1">Relationships & Preview</h2>
              <p className="text-muted-foreground text-sm">How does this connect to other entities, and what will the form look like?</p>
            </div>
            
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="font-medium">Relationships</h3>
                <div className="space-y-3 bg-muted/20 p-4 rounded-lg border border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Belongs to Project</span>
                    <Switch checked={true} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Contains Tasks</span>
                    <Switch checked={true} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Links to Assets</span>
                    <Switch checked={false} />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-medium">Form UI Preview</h3>
                <Card className="bg-background">
                  <CardContent className="p-4 space-y-4">
                    {fields.map(f => (
                      <div key={f.id}>
                        <label className="text-xs font-medium mb-1 block">
                          {f.name} {f.required && <span className="text-destructive">*</span>}
                        </label>
                        {f.type === 'select' ? (
                          <div className="h-9 w-full bg-muted/50 rounded border border-border px-3 flex items-center text-sm text-muted-foreground">Select option...</div>
                        ) : (
                          <div className="h-9 w-full bg-muted/50 rounded border border-border px-3 flex items-center text-sm text-muted-foreground">Input value...</div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

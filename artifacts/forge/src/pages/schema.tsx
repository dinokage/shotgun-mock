import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database, Plus, Search, Layers, GitBranch, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export default function SchemaBuilder() {
  const { toast } = useToast();

  const handleAction = (msg: string) => {
    toast({ title: "Schema updated", description: msg });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Schema Builder</h1>
          <p className="text-muted-foreground mt-1">Design and manage your production data models.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><GitBranch className="w-4 h-4 mr-2" /> New Branch</Button>
          <Button onClick={() => handleAction("Deployed schema changes to production")}><Database className="w-4 h-4 mr-2" /> Deploy Schema</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="w-4 h-4" /> Entities
            </CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search entities..." className="pl-8" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {['Project', 'Sequence', 'Shot', 'Asset', 'Task', 'Version', 'Playlist', 'Note'].map(ent => (
              <div key={ent} className="p-2 rounded-md hover:bg-muted cursor-pointer flex items-center justify-between group">
                <span className="text-sm font-medium">{ent}</span>
                <Badge variant="secondary" className="opacity-0 group-hover:opacity-100 transition-opacity">Edit</Badge>
              </div>
            ))}
            <Button variant="ghost" className="w-full mt-4" onClick={() => handleAction("Create new entity modal opened")}><Plus className="w-4 h-4 mr-2" /> Add Entity</Button>
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Asset Entity</span>
              <Badge variant="outline" className="font-mono bg-blue-500/10 text-blue-500 border-blue-500/20">Production</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground">
                    <th className="h-10 px-4 text-left font-medium">Field Name</th>
                    <th className="h-10 px-4 text-left font-medium">Type</th>
                    <th className="h-10 px-4 text-left font-medium">Required</th>
                    <th className="h-10 px-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: 'code', type: 'String', req: true },
                    { name: 'description', type: 'Text', req: false },
                    { name: 'asset_type', type: 'List', req: true },
                    { name: 'sg_status_list', type: 'StatusList', req: true },
                    { name: 'project', type: 'Entity (Project)', req: true },
                    { name: 'tasks', type: 'MultiEntity (Task)', req: false },
                  ].map(f => (
                    <tr key={f.name} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="p-4 font-medium font-mono">{f.name}</td>
                      <td className="p-4 text-muted-foreground">{f.type}</td>
                      <td className="p-4">{f.req ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <span className="text-muted-foreground">-</span>}</td>
                      <td className="p-4 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleAction(`Edit field ${f.name}`)}>Edit</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button className="mt-4 w-full" variant="secondary" onClick={() => handleAction("Add field modal opened")}>
              <Plus className="w-4 h-4 mr-2" /> Add Field
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CheckCircle2(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
}

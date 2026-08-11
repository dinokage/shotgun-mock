import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { USERS } from '@/data/mockData';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { Building2, Cloud, UploadCloud, Key, Plus, Bell, Shield, Code, Terminal, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Settings() {
  const { toast } = useToast();
  
  const handleSave = () => {
    toast({ title: 'Settings saved', description: 'Your studio profile has been updated.' });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="profile">Studio Profile</TabsTrigger>
          <TabsTrigger value="security">Security & SSO</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="developer">API & Developer</TabsTrigger>
          <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="licenses">Licenses</TabsTrigger>
          <TabsTrigger value="deployment">Deployment</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6 animate-in fade-in">
          <Card>
            <CardHeader>
              <CardTitle>General Information</CardTitle>
              <CardDescription>Basic details about your studio.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-6 items-start">
                <div className="w-24 h-24 rounded-lg bg-muted border border-border flex items-center justify-center flex-col gap-2 text-muted-foreground cursor-pointer hover:bg-muted/80">
                  <UploadCloud className="w-6 h-6" />
                  <span className="text-xs">Logo</span>
                </div>
                <div className="flex-1 space-y-4">
                  <div className="space-y-2">
                    <Label>Studio Name</Label>
                    <Input defaultValue="Nebula Animation Co." className="max-w-md" />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Select defaultValue="animation">
                      <SelectTrigger className="max-w-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vfx">Visual Effects</SelectItem>
                        <SelectItem value="animation">Feature Animation</SelectItem>
                        <SelectItem value="games">Game Development</SelectItem>
                        <SelectItem value="commercial">Commercial / Ad</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t border-border">
                <Label>Timezone</Label>
                <Select defaultValue="pst">
                  <SelectTrigger className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pst">Pacific Time (US & Canada)</SelectItem>
                    <SelectItem value="est">Eastern Time (US & Canada)</SelectItem>
                    <SelectItem value="gmt">Greenwich Mean Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4 flex justify-end">
                <Button onClick={handleSave}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6 animate-in fade-in">
          <Card>
            <CardHeader>
              <CardTitle>Authentication & SSO</CardTitle>
              <CardDescription>Configure enterprise Single Sign-On and security policies.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/10">
                <div className="flex items-center gap-3">
                  <Shield className="w-8 h-8 text-blue-500" />
                  <div>
                    <h4 className="font-semibold text-sm">Okta SAML 2.0 Integration</h4>
                    <p className="text-xs text-muted-foreground">Force users to log in using your Okta directory.</p>
                  </div>
                </div>
                <Button variant="outline">Configure</Button>
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/10">
                <div className="flex items-center gap-3">
                  <Key className="w-8 h-8 text-amber-500" />
                  <div>
                    <h4 className="font-semibold text-sm">Enforce 2FA</h4>
                    <p className="text-xs text-muted-foreground">Require two-factor authentication for all studio members.</p>
                  </div>
                </div>
                <Switch />
              </div>
              <div className="space-y-2">
                <Label>IP Allowlist (CIDR notation)</Label>
                <Input placeholder="e.g. 192.168.1.0/24, 10.0.0.0/8" className="max-w-xl" />
                <p className="text-xs text-muted-foreground">Restrict access to Forge to specific office or VPN IP ranges.</p>
              </div>
              <div className="pt-4 flex justify-end">
                <Button onClick={handleSave}>Save Security Settings</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6 animate-in fade-in">
          <Card>
            <CardHeader>
              <CardTitle>Email & Push Notifications</CardTitle>
              <CardDescription>Control when Forge sends you alerts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { title: 'Task Assignments', desc: 'When you are assigned a new task.' },
                { title: 'Status Changes', desc: 'When a task you follow changes status.' },
                { title: 'Mentions (@)', desc: 'When someone tags you in a comment or review.' },
                { title: 'Review Approvals', desc: 'When your submission is approved by a Lead or Manager.' },
                { title: 'Daily Digest', desc: 'A morning summary of what needs your attention today.' },
              ].map((notif, i) => (
                <div key={i} className="flex items-center justify-between p-3 border-b border-border last:border-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <h4 className="font-medium text-sm">{notif.title}</h4>
                      <p className="text-xs text-muted-foreground">{notif.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Email</Label>
                      <Switch defaultChecked={i !== 4} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Push</Label>
                      <Switch defaultChecked={true} />
                    </div>
                  </div>
                </div>
              ))}
              <div className="pt-6 flex justify-end">
                <Button onClick={handleSave}>Save Notification Preferences</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipelines" className="animate-in fade-in">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline Customization</CardTitle>
              <CardDescription>Modify pipeline stages for various departments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {['VFX', '3D', '2D'].map((dept) => (
                <div key={dept} className="space-y-3">
                  <h3 className="font-semibold text-lg">{dept} Pipeline Stages</h3>
                  <div className="flex flex-wrap gap-2">
                    {dept === 'VFX' && ['Tracking', 'Roto', 'Paint', 'Compositing', 'Client Review', 'Final'].map(s => <Badge key={s} variant="secondary">{s}</Badge>)}
                    {dept === '3D' && ['Modeling', 'Rigging', 'Layout', 'Animation', 'Lighting', 'Rendering', 'Client Review'].map(s => <Badge key={s} variant="secondary">{s}</Badge>)}
                    {dept === '2D' && ['Storyboarding', 'Layout', 'Rough Anim', 'Clean Up', 'Color', 'Comp', 'Client Review'].map(s => <Badge key={s} variant="secondary">{s}</Badge>)}
                    <Button variant="outline" size="sm" className="h-6 text-xs px-2 rounded-full border-dashed">
                      <Plus className="w-3 h-3 mr-1" /> Add Stage
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="animate-in fade-in">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
              <div>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>Manage access and roles.</CardDescription>
              </div>
              <Button size="sm">Invite Member</Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    <th className="p-4 text-left font-medium text-muted-foreground">User</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Role</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Email</th>
                    <th className="p-4 text-center font-medium text-muted-foreground w-20">Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {USERS.map((user, i) => (
                    <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                      <td className="p-4 flex items-center gap-3">
                        <UserAvatar userId={user.id} />
                        <span className="font-medium">{user.name}</span>
                      </td>
                      <td className="p-4 text-muted-foreground">{user.role}</td>
                      <td className="p-4 text-muted-foreground">{user.email}</td>
                      <td className="p-4 text-center">
                        <Switch defaultChecked={i === 0 || i === 5} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="licenses" className="animate-in fade-in">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
              <div>
                <CardTitle>License Management</CardTitle>
                <CardDescription>Manage your studio's software licenses and seat allocation.</CardDescription>
              </div>
              <Button size="sm" className="gap-2"><Key className="w-4 h-4" /> Add License Server</Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    <th className="p-4 text-left font-medium text-muted-foreground">Software</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Type</th>
                    <th className="p-4 text-center font-medium text-muted-foreground">Seats Used</th>
                    <th className="p-4 text-center font-medium text-muted-foreground">Seats Owned</th>
                    <th className="p-4 text-center font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: 'Autodesk Maya', type: 'Floating', used: 22, owned: 30 },
                    { name: 'The Foundry Nuke', type: 'Node-locked', used: 15, owned: 15 },
                    { name: 'SideFX Houdini', type: 'Floating', used: 28, owned: 40 },
                    { name: 'Arnold Render', type: 'Render Node', used: 28, owned: 50 },
                    { name: 'Unreal Engine', type: 'Enterprise', used: 27, owned: 30 },
                    { name: 'Substance Painter', type: 'Floating', used: 30, owned: 30 },
                  ].map((lic, i) => {
                    const ratio = lic.used / lic.owned;
                    const status = ratio >= 1 ? 'critical' : ratio > 0.8 ? 'warning' : 'healthy';
                    return (
                      <tr key={lic.name} className="border-b border-border last:border-0 hover:bg-muted/10">
                        <td className="p-4 font-medium">{lic.name}</td>
                        <td className="p-4 text-muted-foreground">{lic.type}</td>
                        <td className="p-4 text-center">{lic.used}</td>
                        <td className="p-4 text-center">{lic.owned}</td>
                        <td className="p-4 text-center">
                          <Badge variant="outline" className={`text-[10px] ${status === 'critical' ? 'text-red-500 border-red-500' : status === 'warning' ? 'text-yellow-500 border-yellow-500' : 'text-green-500 border-green-500'}`}>
                            {status === 'critical' ? 'Maxed Out' : status === 'warning' ? 'Near Limit' : 'Available'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deployment" className="space-y-6 animate-in fade-in">
          <Card className="border-primary ring-1 ring-primary/20">
            <CardHeader>
              <div className="flex items-center gap-3 mb-1">
                <Cloud className="w-6 h-6 text-primary" />
                <CardTitle className="text-2xl text-primary">SaaS Managed</CardTitle>
              </div>
              <CardDescription>Your instance is fully managed by Forge.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg text-sm text-foreground/90 space-y-2">
                <p><strong>Current Region:</strong> AWS us-west-2 (Oregon)</p>
                <p><strong>Database:</strong> Multi-AZ High Availability</p>
                <p><strong>Storage:</strong> S3 with Transfer Acceleration</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-6 opacity-60">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-1">
                  <Building2 className="w-6 h-6" />
                  <CardTitle>On-Premises</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Deploy Forge inside your studio's firewall. Requires Enterprise license.
                <div className="mt-4"><Button variant="outline" size="sm" disabled>Contact Sales</Button></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-1">
                  <Cloud className="w-6 h-6" />
                  <CardTitle>Hybrid Connect</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                SaaS control plane with on-premise asset storage mounts.
                <div className="mt-4"><Button variant="outline" size="sm" disabled>Contact Sales</Button></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="developer" className="space-y-6 animate-in fade-in">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
              <div>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>Manage personal access tokens for API requests.</CardDescription>
              </div>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Generate New Token</Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    <th className="p-4 text-left font-medium text-muted-foreground">Token Name</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Last Used</th>
                    <th className="p-4 text-left font-medium text-muted-foreground">Expires</th>
                    <th className="p-4 text-center font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border hover:bg-muted/10">
                    <td className="p-4 font-medium flex items-center gap-2"><Key className="w-4 h-4 text-primary" /> Python Pipeline Script</td>
                    <td className="p-4 text-muted-foreground">2 mins ago</td>
                    <td className="p-4 text-muted-foreground">Never</td>
                    <td className="p-4 text-center"><Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-500/10">Revoke</Button></td>
                  </tr>
                  <tr className="hover:bg-muted/10">
                    <td className="p-4 font-medium flex items-center gap-2"><Key className="w-4 h-4 text-muted-foreground" /> Maya Integration</td>
                    <td className="p-4 text-muted-foreground">14 days ago</td>
                    <td className="p-4 text-muted-foreground">Dec 31, 2025</td>
                    <td className="p-4 text-center"><Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-500/10">Revoke</Button></td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Python SDK Quickstart</CardTitle>
              <CardDescription>Initialize the Forge Python API to fetch project data.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative group">
                <div className="absolute top-2 right-2 p-1.5 bg-muted rounded cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted-foreground/20" onClick={() => toast({ title: 'Copied to clipboard' })}>
                  <Copy className="w-4 h-4 text-muted-foreground" />
                </div>
                <pre className="bg-card border border-border p-4 rounded-md text-sm font-mono text-muted-foreground overflow-x-auto">
                  <span className="text-blue-400">import</span> forge_api<br/><br/>
                  <span className="text-green-500"># Connect to your workspace</span><br/>
                  session <span className="text-blue-400">=</span> forge_api.Session(<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;server_url<span className="text-blue-400">=</span><span className="text-orange-300">"https://nebula.forge.studio"</span>,<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;api_key<span className="text-blue-400">=</span><span className="text-orange-300">"YOUR_API_KEY"</span><br/>
                  )<br/><br/>
                  <span className="text-green-500"># Fetch shots needing review</span><br/>
                  shots <span className="text-blue-400">=</span> session.query(<span className="text-orange-300">'Shot where status is "manager-review"'</span>)<br/>
                  <span className="text-blue-400">print</span>(<span className="text-orange-300">f"Found {'{'}len(shots){'}'} shots for review"</span>)
                </pre>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
              <div>
                <CardTitle>Webhooks</CardTitle>
                <CardDescription>Listen to real-time events across your studio.</CardDescription>
              </div>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add Endpoint</Button>
            </CardHeader>
            <CardContent className="pt-6">
               <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-lg">
                 <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                 <p className="text-sm">No webhook endpoints configured.</p>
                 <p className="text-xs mt-1">Add an endpoint to receive events like <code>task.status.changed</code> or <code>version.published</code>.</p>
               </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

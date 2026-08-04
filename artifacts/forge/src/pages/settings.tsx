import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { USERS } from '@/data/mockData';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { Building2, Cloud, UploadCloud } from 'lucide-react';
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
          <TabsTrigger value="members">Members</TabsTrigger>
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
              <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg text-sm text-primary-foreground/90 space-y-2">
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
      </Tabs>
    </div>
  );
}

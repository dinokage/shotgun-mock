import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store/auth';
import { DEPARTMENTS, USERS, MESSAGES as MOCK_MESSAGES, ChatMessage } from '@/data/mockData';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Hash, Send, Paperclip, Image as ImageIcon, Video, Shield, User as UserIcon, Plus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

export default function Chat() {
  const { currentUser } = useAuthStore();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const [inputText, setInputText] = useState('');
  
  // A user can see all departments if they are top leadership, otherwise just their own.
  const isTopLeadership = currentUser && ['vfx_producer', 'production_manager', 'coordinator'].includes(currentUser.role);
  
  const visibleDepartments = useMemo(() => {
    const everyoneDept = { id: 'everyone', name: 'Everyone', headId: '' };
    if (isTopLeadership) return [everyoneDept, ...DEPARTMENTS];
    return [everyoneDept, ...DEPARTMENTS.filter(d => d.id === currentUser?.departmentId)];
  }, [currentUser, isTopLeadership]);

  const [activeDeptId, setActiveDeptId] = useState<string>(visibleDepartments[0]?.id || '');
  
  const activeDept = useMemo(() => DEPARTMENTS.find(d => d.id === activeDeptId), [activeDeptId]);
  
  const deptUsers = useMemo(() => {
    return USERS.filter(u => u.departmentId === activeDeptId).sort((a, b) => {
      // Sort leadership to top
      const aIsLead = ['supervisor', 'lead'].includes(a.role);
      const bIsLead = ['supervisor', 'lead'].includes(b.role);
      if (aIsLead && !bIsLead) return -1;
      if (!aIsLead && bIsLead) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [activeDeptId]);

  const deptMessages = useMemo(() => {
    return messages.filter(m => m.departmentId === activeDeptId).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [messages, activeDeptId]);

  const handleSend = () => {
    if (!inputText.trim() || !currentUser) return;
    const newMsg: ChatMessage = {
      id: `m_${Date.now()}`,
      departmentId: activeDeptId,
      userId: currentUser.id,
      text: inputText,
      attachments: [],
      timestamp: new Date().toISOString()
    };
    setMessages([...messages, newMsg]);
    setInputText('');
  };

  const handleSimulateAttachment = (type: 'image' | 'video' | 'file') => {
    if (!currentUser) return;
    
    // Simulate AI scanning the file for production review
    toast({
      title: "File Uploaded & Scanned",
      description: "AI has successfully analyzed the attachment and logged it for Main Production review.",
    });

    const newMsg: ChatMessage = {
      id: `m_${Date.now()}`,
      departmentId: activeDeptId,
      userId: currentUser.id,
      text: '',
      attachments: [{
        id: `att_${Date.now()}`,
        name: type === 'image' ? 'concept_v4.png' : type === 'video' ? 'anim_playblast.mp4' : 'scene_v01.usd',
        type: type,
        url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop'
      }],
      timestamp: new Date().toISOString()
    };
    setMessages([...messages, newMsg]);
  };

  if (!currentUser) return null;

  return (
    <div className="flex h-full w-full bg-background border border-border rounded-xl overflow-hidden shadow-sm">
      
      {/* Channels Sidebar */}
      <div className="w-64 bg-sidebar/50 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">Team Chat</h2>
          <Button variant="ghost" size="icon" className="w-6 h-6 hover:bg-muted" title="Create Group" onClick={() => toast({title: "Create Group", description: "Opening group creation dialog..."})}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground mb-2 px-2 uppercase tracking-wider">Channels</div>
            {visibleDepartments.map(dept => (
              <button
                key={dept.id}
                onClick={() => setActiveDeptId(dept.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  activeDeptId === dept.id 
                    ? 'bg-primary/10 text-primary font-medium' 
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Hash className="w-4 h-4 opacity-70" />
                {dept.name}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-card">
        {/* Chat Header */}
        <div className="h-14 border-b border-border flex items-center px-6 shrink-0 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-bold text-lg">{activeDept?.name}</h2>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            {deptMessages.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                <Hash className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Welcome to the {activeDept?.name} channel!</p>
                <p className="text-sm">This is the start of the conversation.</p>
              </div>
            ) : (
              deptMessages.map((msg, i) => {
                const user = USERS.find(u => u.id === msg.userId);
                const showHeader = i === 0 || deptMessages[i-1].userId !== msg.userId || (new Date(msg.timestamp).getTime() - new Date(deptMessages[i-1].timestamp).getTime() > 300000);
                
                return (
                  <div key={msg.id} className={`flex gap-3 max-w-3xl ${showHeader ? 'mt-6' : 'mt-1'}`}>
                    {showHeader ? (
                      <Avatar className="w-10 h-10 border border-border shadow-sm shrink-0">
                        <AvatarImage src={user?.avatar} />
                        <AvatarFallback>{user?.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-10 shrink-0" /> // Spacer for alignment
                    )}
                    
                    <div className="flex-1 min-w-0">
                      {showHeader && (
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-semibold text-[15px]">{user?.name}</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(msg.timestamp), 'h:mm a')}</span>
                          {['supervisor', 'lead'].includes(user?.role || '') && (
                            <span className="text-[10px] uppercase font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded ml-1">Lead</span>
                          )}
                        </div>
                      )}
                      
                      <div className="text-[15px] text-foreground/90 leading-relaxed whitespace-pre-wrap">
                        {msg.text}
                      </div>
                      
                      {msg.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {msg.attachments.map((att, idx) => (
                            <div key={idx} className="relative rounded-lg overflow-hidden border border-border group cursor-pointer max-w-sm">
                              {att.type === 'image' ? (
                                <img src={att.url} alt={att.name} className="w-full h-auto max-h-64 object-cover" />
                              ) : (
                                <div className="bg-black/90 w-full aspect-video flex items-center justify-center relative">
                                  <Video className="w-12 h-12 text-white/50 absolute" />
                                  <video src={att.url} className="w-full h-full opacity-50 object-cover" />
                                </div>
                              )}
                              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-xs text-white truncate block">{att.name}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 bg-card/50 backdrop-blur-sm shrink-0">
          <div className="relative flex items-end gap-2 bg-muted/30 border border-border rounded-xl p-2 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all shadow-sm">
            <div className="flex gap-1 pb-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0" title="Attach Image" onClick={() => handleSimulateAttachment('image')}>
                <ImageIcon className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0" title="Attach Video" onClick={() => handleSimulateAttachment('video')}>
                <Video className="w-4 h-4" />
              </Button>
            </div>
            
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={`Message #${activeDept?.name}...`}
              className="flex-1 max-h-32 min-h-[40px] bg-transparent border-0 focus:ring-0 p-2 resize-none text-[15px]"
              rows={1}
            />
            
            <Button 
              onClick={handleSend} 
              disabled={!inputText.trim()}
              size="icon" 
              className={`h-9 w-9 shrink-0 rounded-lg mb-0.5 ${inputText.trim() ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground'}`}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground text-center mt-2">
            <strong>Pro Tip:</strong> Click the image/video icons to test media attachments.
          </div>
        </div>
      </div>

      {/* Roster Sidebar (Right) */}
      <div className="w-64 bg-sidebar/30 border-l border-border flex flex-col hidden lg:flex">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-sm">Department Members — {deptUsers.length}</h2>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {/* Leadership Group */}
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Shield className="w-3 h-3" /> Leadership
              </div>
              <div className="space-y-1">
                {deptUsers.filter(u => ['supervisor', 'lead'].includes(u.role)).map(u => (
                  <div key={u.id} className="flex items-center gap-2.5 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                    <Avatar className="w-7 h-7 border shadow-sm relative">
                      <AvatarImage src={u.avatar} />
                      <AvatarFallback>{u.name.charAt(0)}</AvatarFallback>
                      <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border border-white rounded-full"></div>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{u.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{u.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Artists Group */}
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 mt-2 flex items-center gap-1.5">
                <UserIcon className="w-3 h-3" /> Artists
              </div>
              <div className="space-y-1">
                {deptUsers.filter(u => !['supervisor', 'lead'].includes(u.role)).map(u => (
                  <div key={u.id} className="flex items-center gap-2.5 p-1.5 rounded hover:bg-muted/50 cursor-pointer opacity-80 hover:opacity-100">
                    <Avatar className="w-7 h-7">
                      <AvatarImage src={u.avatar} />
                      <AvatarFallback>{u.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{u.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{u.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

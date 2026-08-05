import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { USERS, PROJECTS, TASKS, SHOTS, ASSETS, AI_SUGGESTIONS, WORKFLOWS } from '@/data/mockData';
import { Send, Sparkles, Package, Film, ListTodo, FolderOpen, Workflow, ArrowRight, Brain, Zap, Clock, AlertTriangle, ChevronRight, Bot } from 'lucide-react';
import { Link } from 'wouter';

const INITIAL_MESSAGES = [
  { role: 'user', content: 'What is blocking SEQ_020_SH_040?' },
  { role: 'assistant', content: 'SEQ_020_SH_040 is blocked because its dependency ENV_SpaceStation (assigned to Yuki Tanaka) is at 75% completion and Yuki is currently at 112% capacity. Based on current velocity, ENV_SpaceStation is estimated to complete in 4-5 business days.', sources: ['ENV_SpaceStation status', 'Yuki Tanaka capacity data'], refs: [{ type: 'asset', id: 'asset8', name: 'Space Station' }, { type: 'shot', id: 'sh2', name: 'SEQ_020_SH_040' }] },
  { role: 'user', content: 'How many shots are at risk in Starfall?' },
  { role: 'assistant', content: '14 shots in Starfall are currently marked AT_RISK or BLOCKED — 9 in SEQ_020 and 5 in SEQ_030. The most critical are those depending on ENV_SpaceStation and FX_MagicBlast. Recommend reassigning 2 tasks from overloaded artists.', sources: ['Starfall shot statuses', 'Dependency graph'], refs: [{ type: 'project', id: 'p1', name: 'Starfall' }] },
  { role: 'user', content: 'When is Starfall projected to complete?' },
  { role: 'assistant', content: 'Based on current velocity (68% complete, 4.2 shots/week), Starfall is projected to complete by:\n\n• **P50**: Nov 18, 2025\n• **P80**: Nov 28, 2025\n• **P95**: Dec 9, 2025\n\nThe critical path runs through SEQ_030 Climax which has 3 blocked shots. Recommending overtime allocation for Yuki Tanaka and Priya Nair.', sources: ['Velocity calculations', 'Critical path analysis'], refs: [] },
];

interface Message {
  role: string;
  content: string;
  sources?: string[];
  refs?: { type: string; id: string; name: string }[];
}

export default function AIWorkspace() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    const q = input;
    setInput('');
    setIsStreaming(true);

    const fullResponse = `I've analyzed your query regarding "${q}". Based on the current pipeline data and knowledge graph, here's what I found:\n\n• The relevant entities are connected through 3 dependency chains\n• Current velocity suggests completion within the planned timeline\n• No critical blockers detected for this specific query\n\nWould you like me to create a workflow automation for this, or should I drill deeper into any specific area?`;
    const sources = ['Pipeline analytics', 'Knowledge graph'];
    const refs = [{ type: 'project', id: 'p1', name: 'Starfall' }];

    // Add empty assistant message
    const assistantMsg: Message = { role: 'assistant', content: '', sources, refs };
    setMessages(prev => [...prev, assistantMsg]);

    // Stream characters
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setMessages(prev => {
        const updated = [...prev];
        const last = { ...updated[updated.length - 1] };
        last.content = fullResponse.slice(0, i);
        updated[updated.length - 1] = last;
        return updated;
      });
      if (i >= fullResponse.length) {
        clearInterval(interval);
        setIsStreaming(false);
      }
    }, 18);
  };

  const contextProject = PROJECTS[0];
  const contextTasks = TASKS.filter(t => t.projectId === 'p1' && (t.status === 'blocked' || t.priority === 'critical')).slice(0, 4);
  const contextAssets = ASSETS.filter(a => a.projectId === 'p1' && a.status !== 'complete').slice(0, 5);
  const contextShots = SHOTS.filter(s => s.projectId === 'p1' && s.status !== 'complete').slice(0, 5);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Brain className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold">Forge AI Workspace</h2>
              <p className="text-[10px] text-muted-foreground">Context: Starfall · Pipeline Analytics · Knowledge Graph</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-xs gap-1"><Zap className="w-3 h-3" /> Live Context</Badge>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-6">
          <div className="max-w-3xl mx-auto space-y-6 pb-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-start gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div className={`p-4 rounded-xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}>
                    {msg.content.split('\n').map((line, j) => <p key={j} className={j > 0 ? 'mt-1.5' : ''}>{line}</p>)}
                  </div>
                </div>

                {msg.sources && (
                  <div className={`flex flex-wrap gap-1 ${msg.role === 'user' ? 'mr-2' : 'ml-11'}`}>
                    {msg.sources.map((src, j) => (
                      <Badge key={j} variant="outline" className="text-[9px] h-4 px-1.5 opacity-60">{src}</Badge>
                    ))}
                  </div>
                )}

                {msg.refs && msg.refs.length > 0 && (
                  <div className={`flex flex-wrap gap-1.5 ${msg.role === 'user' ? 'mr-2' : 'ml-11'}`}>
                    {msg.refs.map((ref, j) => (
                      <Link key={j} href={ref.type === 'project' ? `/projects/${ref.id}` : ref.type === 'asset' ? `/assets/${ref.id}` : `/shots/${ref.id}`}>
                        <Badge variant="secondary" className="text-[10px] cursor-pointer hover:bg-secondary/80 gap-1">
                          {ref.type === 'project' ? <FolderOpen className="w-2.5 h-2.5" /> : ref.type === 'asset' ? <Package className="w-2.5 h-2.5" /> : <Film className="w-2.5 h-2.5" />}
                          {ref.name}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Suggested Actions */}
        <div className="border-t border-border bg-card/50 px-6 py-3">
          <div className="max-w-3xl mx-auto">
            <div className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Suggested Actions</div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {[
                { label: 'Reassign blocked tasks', icon: Zap },
                { label: 'Generate risk report', icon: AlertTriangle },
                { label: 'Create review session', icon: Clock },
                { label: 'Build automation workflow', icon: Workflow },
              ].map((action, i) => (
                <Button key={i} variant="outline" size="sm" className="text-xs whitespace-nowrap gap-1.5 shrink-0" onClick={() => setInput(action.label)}>
                  <action.icon className="w-3 h-3" /> {action.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-border bg-card px-6 py-4">
          {isStreaming && (
            <div className="max-w-3xl mx-auto mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Analyzing pipeline data...
            </div>
          )}
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2">
            <Input value={input} onChange={e => setInput(e.target.value)} placeholder={isStreaming ? 'Waiting for response...' : 'Ask about your production pipeline...'} className="flex-1" disabled={isStreaming} />
            <Button type="submit" size="icon" disabled={!input.trim() || isStreaming}><Send className="w-4 h-4" /></Button>
          </form>
        </div>
      </div>

      {/* Right: Context Panel */}
      <div className="w-80 border-l border-border bg-card flex flex-col shrink-0 overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-sm">Project Context</h3>
          <div className="mt-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg shrink-0" style={{ background: contextProject.thumbnail }} />
            <div>
              <div className="font-medium text-sm">{contextProject.name}</div>
              <div className="text-xs text-muted-foreground">{contextProject.progress}% complete</div>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* Critical Tasks */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-1">
                <ListTodo className="w-3 h-3" /> Critical Tasks
              </div>
              <div className="space-y-1.5">
                {contextTasks.map(t => (
                  <div key={t.id} className="p-2 rounded-md border border-border bg-muted/20 text-xs hover:bg-muted/40 transition-colors cursor-pointer">
                    <div className="font-medium truncate">{t.title}</div>
                    <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1">{t.status}</Badge>
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1">{t.priority}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Referenced Assets */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-1">
                <Package className="w-3 h-3" /> Referenced Assets
              </div>
              <div className="space-y-1.5">
                {contextAssets.map(a => (
                  <Link key={a.id} href={`/assets/${a.id}`}>
                    <div className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/40 transition-colors text-xs cursor-pointer">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium truncate">{a.name}</span>
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1 ml-auto">{a.status}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Referenced Shots */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-1">
                <Film className="w-3 h-3" /> Referenced Shots
              </div>
              <div className="space-y-1.5">
                {contextShots.map(s => (
                  <Link key={s.id} href={`/shots/${s.id}`}>
                    <div className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/40 transition-colors text-xs cursor-pointer">
                      <Film className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium truncate">{s.name}</span>
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1 ml-auto">{s.status}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* AI Suggestions */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Workflow Suggestions
              </div>
              <div className="space-y-1.5">
                {WORKFLOWS.slice(0, 3).map(wf => (
                  <div key={wf.id} className="p-2 rounded-md border border-purple-500/20 bg-purple-500/5 text-xs cursor-pointer hover:bg-purple-500/10 transition-colors">
                    <div className="font-medium">{wf.name}</div>
                    <div className="text-muted-foreground mt-0.5">{wf.description}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Knowledge Graph Refs */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-1">
                <Brain className="w-3 h-3" /> Graph References
              </div>
              <Button variant="outline" size="sm" className="w-full text-xs gap-1" asChild>
                <Link href="/impact"><Brain className="w-3 h-3" /> Open Knowledge Graph <ArrowRight className="w-3 h-3 ml-auto" /></Link>
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

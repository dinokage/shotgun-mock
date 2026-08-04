import { X, Send, Sparkles, AlertCircle, Calendar } from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

const INITIAL_MESSAGES = [
  {
    role: 'user',
    content: 'What is blocking SEQ_020_SH_040?'
  },
  {
    role: 'assistant',
    content: 'SEQ_020_SH_040 is blocked because its dependency ENV_SpaceStation (assigned to Yuki Tanaka) is at 75% completion and Yuki is currently at 112% capacity. Based on current velocity, ENV_SpaceStation is estimated to complete in 4-5 business days.',
    sources: ['ENV_SpaceStation status', 'Yuki Tanaka capacity data']
  },
  {
    role: 'user',
    content: 'How many shots are at risk in Starfall?'
  },
  {
    role: 'assistant',
    content: '14 shots in Starfall are currently marked AT_RISK or BLOCKED — 9 in SEQ_020 Descent and 5 in SEQ_030 Climax. The most critical are those depending on ENV_SpaceStation and FX_MagicBlast.',
    sources: ['Starfall shot statuses', 'Task #dependency graph']
  },
  {
    role: 'user',
    content: 'When is Starfall projected to complete?'
  },
  {
    role: 'assistant',
    content: 'Based on current velocity (68% complete, 4.2 shots/week), Starfall is projected to complete by P50=Nov 18, P80=Nov 28, P95=Dec 9. The critical path runs through SEQ_030 Climax which has 3 blocked shots.',
    sources: ['Starfall progress data', 'Scheduling velocity calculations']
  }
];

export function AiAssistant() {
  const { aiAssistantOpen, setAiAssistantOpen } = useUIStore();
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');

  if (!aiAssistantOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setMessages([...messages, { role: 'user', content: input }]);
    const query = input;
    setInput('');

    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `I've analyzed your query regarding "${query}". Based on the current pipeline data, this looks to be on track, but I'll keep monitoring it.`,
        sources: ['Pipeline generic heuristic', 'Studio velocity avg']
      }]);
    }, 600);
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-background/50 backdrop-blur-sm z-40 transition-opacity"
        onClick={() => setAiAssistantOpen(false)}
      />
      <div className="fixed inset-y-0 right-0 w-[420px] bg-card border-l border-border shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-purple-500/10 flex items-center justify-center text-purple-500">
              <BotIcon className="w-5 h-5" />
            </div>
            <h2 className="font-semibold text-lg tracking-tight">Forge AI</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setAiAssistantOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-6 pb-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col gap-2 max-w-[90%] ${msg.role === 'user' ? 'ml-auto' : ''}`}>
                <div className={`p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}>
                  {msg.content}
                </div>
                {msg.sources && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {msg.sources.map((src, j) => (
                      <Badge key={j} variant="outline" className="text-[10px] h-5 py-0 px-1.5 opacity-70">
                        {src}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border bg-card/50">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about shots, schedules, or risks..." 
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={!input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <Badge variant="secondary" className="whitespace-nowrap cursor-pointer hover:bg-secondary/80 text-xs" onClick={() => setInput("Show me critical path risks")}>
              <AlertCircle className="w-3 h-3 mr-1" /> Critical Risks
            </Badge>
            <Badge variant="secondary" className="whitespace-nowrap cursor-pointer hover:bg-secondary/80 text-xs" onClick={() => setInput("Who is over capacity?")}>
              <Calendar className="w-3 h-3 mr-1" /> Capacity
            </Badge>
          </div>
        </div>
      </div>
    </>
  );
}

function BotIcon({ className }: { className?: string }) {
  return <Bot className={className} />;
}

import { Bot } from 'lucide-react';

import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { AiAssistant } from './AiAssistant';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto relative bg-background/50">
          {children}
        </main>
      </div>
      <AiAssistant />
    </div>
  );
}

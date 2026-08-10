import React from 'react';
import { CheckCircle2, Circle, Clock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PIPELINE_ORDER, Task } from '@/data/mockData';

interface PipelineVisualizerProps {
  tasks: Task[];
  entityType: 'asset' | 'shot';
}

export function PipelineVisualizer({ tasks, entityType }: PipelineVisualizerProps) {
  // Sort tasks by pipeline order based on department
  const sortedTasks = [...tasks].sort((a, b) => {
    const aOrder = PIPELINE_ORDER.find(d => d.name === a.department)?.pipelineOrder || 99;
    const bOrder = PIPELINE_ORDER.find(d => d.name === b.department)?.pipelineOrder || 99;
    return aOrder - bOrder;
  });

  return (
    <div className="w-full py-4 overflow-x-auto">
      <div className="flex items-center min-w-max px-2">
        {sortedTasks.map((task, index) => {
          const isComplete = task.status === 'approved';
          const isInProgress = task.status === 'in-progress' || task.status === 'lead-review' || task.status === 'manager-review';
          const isBottleneck = task.status === 'bottleneck';
          
          return (
            <React.Fragment key={task.id}>
              {/* Node */}
              <div className="flex flex-col items-center gap-2 group relative w-24">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors z-10",
                  isComplete ? "bg-green-500/20 border-green-500 text-green-500" :
                  isInProgress ? "bg-blue-500/20 border-blue-500 text-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]" :
                  isBottleneck ? "bg-red-500/20 border-red-500 text-red-500" :
                  "bg-muted border-border text-muted-foreground"
                )}>
                  {isComplete ? <CheckCircle2 className="w-4 h-4" /> :
                   isInProgress ? <Clock className="w-4 h-4" /> :
                   <Circle className="w-4 h-4" />}
                </div>
                
                <div className="text-center">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
                    {task.department}
                  </div>
                  <div className={cn(
                    "text-xs font-medium truncate w-full px-1",
                    isInProgress ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {task.status.replace('-', ' ')}
                  </div>
                </div>

                {/* Tooltip on hover */}
                <div className="absolute top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-popover text-popover-foreground text-xs p-2 rounded shadow-md z-50 pointer-events-none min-w-[120px] text-center border border-border">
                  <div className="font-semibold">{task.title}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">Assignee: {task.assigneeId}</div>
                </div>
              </div>

              {/* Connector Line */}
              {index < sortedTasks.length - 1 && (
                <div className="flex-1 w-8 flex items-center justify-center -mt-6">
                  <div className={cn(
                    "h-0.5 w-full",
                    isComplete ? "bg-green-500/50" : "bg-border"
                  )} />
                  <ArrowRight className={cn(
                    "w-3 h-3 -ml-2",
                    isComplete ? "text-green-500/50" : "text-border"
                  )} />
                </div>
              )}
            </React.Fragment>
          );
        })}
        {sortedTasks.length === 0 && (
          <div className="text-sm text-muted-foreground w-full text-center py-4">
            No pipeline tasks scheduled yet.
          </div>
        )}
      </div>
    </div>
  );
}

import re

with open('src/data/mockData.ts', 'r') as f:
    content = f.read()

# We need to split out:
# 1. Types (into types.ts)
# 2. STUDIOS (into studios.ts)
# 3. USERS (into users.ts)
# 4. DEPARTMENTS (into departments.ts)
# 5. PROJECTS (into projects.ts)
# 6. EPISODES (into episodes.ts)
# 7. SEQUENCES (into sequences.ts)
# 8. SHOTS (into shots.ts)
# 9. ASSETS (into assets.ts)
# 10. TASKS (into tasks.ts)
# 11. REVIEWS (into reviews.ts)
# 12. VERSIONS (into versions.ts)
# 13. PUBLISH_LOGS (into publish_logs.ts)
# 14. WORKFLOW_RUNS (into workflow_runs.ts)
# 15. AUDIT_EVENTS (into audit_events.ts)
# 16. CHAT_MESSAGES (into chat_messages.ts)
# 17. NOTIFICATIONS (into notifications.ts)
# 18. PLUGINS (into plugins.ts)
# 19. RECENT_ACTIVITY (into activity.ts)
# 20. MILESTONES (into milestones.ts)

# Let's extract everything from the start to the end of types
types_match = re.search(r'(// --- Types ---.*?)(?=// --- Data ---|export const STUDIOS)', content, re.DOTALL)
types_content = types_match.group(1) if types_match else ""

with open('src/data/types.ts', 'w') as f:
    f.write(types_content)

def extract_and_write(regex, filename, imports=""):
    match = re.search(regex, content, re.DOTALL)
    if match:
        with open(f'src/data/{filename}', 'w') as f:
            if imports:
                f.write(imports + "\n\n")
            f.write(match.group(1))

extract_and_write(r'(export const STUDIOS: Studio\[\] = \[.*?\];)', 'studios.ts', "import { Studio } from './types';")
extract_and_write(r'(export const USERS: User\[\] = \[.*?\];)', 'users.ts', "import { User } from './types';")
extract_and_write(r'(export const DEPARTMENTS: Department\[\] = \[.*?\];.*?export function getNextDepartment[^\n]*\n[^\n]*\n[^\n]*\n\})', 'departments.ts', "import { Department } from './types';")
extract_and_write(r'(export const PIPELINE_ORDER: Record<string, number> = \{.*?\};)', 'pipeline.ts', "")

extract_and_write(r'(export const PROJECTS: Project\[\] = \[.*?\];)', 'projects.ts', "import { Project } from './types';")
extract_and_write(r'(export const EPISODES: Episode\[\] = \[.*?\];)', 'episodes.ts', "import { Episode } from './types';")
extract_and_write(r'(export const SEQUENCES: Sequence\[\] = \[.*?\];)', 'sequences.ts', "import { Sequence } from './types';")
extract_and_write(r'(export const SHOTS: Shot\[\] = \[.*?\];)', 'shots.ts', "import { Shot } from './types';")
extract_and_write(r'(export const ASSETS: Asset\[\] = \[.*?\];)', 'assets.ts', "import { Asset } from './types';")
extract_and_write(r'(export const TASKS: Task\[\] = \[.*?\];)', 'tasks.ts', "import { Task } from './types';")
extract_and_write(r'(export const REVIEWS: Review\[\] = \[.*?\];)', 'reviews.ts', "import { Review } from './types';")
extract_and_write(r'(export const VERSIONS: Version\[\] = \[.*?\];)', 'versions.ts', "import { Version } from './types';")
extract_and_write(r'(export const PUBLISH_LOGS: PublishLog\[\] = \[.*?\];)', 'publish_logs.ts', "import { PublishLog } from './types';")
extract_and_write(r'(export const WORKFLOW_RUNS: WorkflowRun\[\] = \[.*?\];)', 'workflow_runs.ts', "import { WorkflowRun } from './types';")
extract_and_write(r'(export const AUDIT_EVENTS: AuditEvent\[\] = \[.*?\];)', 'audit_events.ts', "import { AuditEvent } from './types';")
extract_and_write(r'(export const CHAT_MESSAGES: ChatMessage\[\] = \[.*?\];)', 'chat_messages.ts', "import { ChatMessage } from './types';")
extract_and_write(r'(export const NOTIFICATIONS: Notification\[\] = \[.*?\];)', 'notifications.ts', "import { Notification } from './types';")
extract_and_write(r'(export const PLUGINS: Plugin\[\] = \[.*?\];)', 'plugins.ts', "import { Plugin } from './types';")
extract_and_write(r'(export const RECENT_ACTIVITY: Activity\[\] = \[.*?\];)', 'activity.ts', "import { Activity } from './types';")
extract_and_write(r'(export const MILESTONES: Milestone\[\] = \[.*?\];)', 'milestones.ts', "import { Milestone } from './types';")

print("Splitting complete")

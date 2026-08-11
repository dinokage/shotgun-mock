import re

with open('src/data/mockData.ts', 'r') as f:
    content = f.read()

types_content = re.search(r'(// --- Types ---.*?)(?=// --- Studios ---)', content, re.DOTALL).group(1)
with open('src/data/types.ts', 'w') as f:
    f.write(types_content)

studios_content = re.search(r'(// --- Studios ---.*?)(?=// --- Departments)', content, re.DOTALL).group(1)
with open('src/data/studios.ts', 'w') as f:
    f.write("import { Studio } from './types';\n" + studios_content)

depts_content = re.search(r'(// --- Departments.*?)(?=// --- Users)', content, re.DOTALL).group(1)
with open('src/data/departments.ts', 'w') as f:
    f.write("import { Department } from './types';\n" + depts_content)

users_content = re.search(r'(// --- Users.*?)(?=// --- Projects)', content, re.DOTALL).group(1)
with open('src/data/users.ts', 'w') as f:
    f.write("import { User, Role } from './types';\nimport { DEPARTMENTS } from './departments';\nimport { STUDIOS } from './studios';\n" + users_content)

projects_content = re.search(r'(// --- Projects.*?)(?=// --- Episodes)', content, re.DOTALL).group(1)
with open('src/data/projects.ts', 'w') as f:
    f.write("import { Project } from './types';\nimport { STUDIOS } from './studios';\n" + projects_content)

episodes_content = re.search(r'(// --- Episodes.*?)(?=// --- Sequences)', content, re.DOTALL).group(1)
with open('src/data/episodes.ts', 'w') as f:
    f.write("import { Episode } from './types';\nimport { PROJECTS } from './projects';\n" + episodes_content)

sequences_content = re.search(r'(// --- Sequences.*?)(?=// --- Shots)', content, re.DOTALL).group(1)
with open('src/data/sequences.ts', 'w') as f:
    f.write("import { Sequence } from './types';\nimport { PROJECTS } from './projects';\nimport { EPISODES } from './episodes';\n" + sequences_content)

shots_content = re.search(r'(// --- Shots.*?)(?=// --- Assets)', content, re.DOTALL).group(1)
with open('src/data/shots.ts', 'w') as f:
    f.write("import { Shot } from './types';\nimport { PROJECTS } from './projects';\nimport { EPISODES } from './episodes';\nimport { SEQUENCES } from './sequences';\nimport { USERS } from './users';\n" + shots_content)

assets_content = re.search(r'(// --- Assets.*?)(?=// --- Tasks)', content, re.DOTALL).group(1)
with open('src/data/assets.ts', 'w') as f:
    f.write("import { Asset } from './types';\nimport { PROJECTS } from './projects';\nimport { USERS } from './users';\n" + assets_content)

tasks_content = re.search(r'(// --- Tasks.*?)(?=// --- Versions)', content, re.DOTALL).group(1)
with open('src/data/tasks.ts', 'w') as f:
    f.write("import { Task } from './types';\nimport { PROJECTS } from './projects';\nimport { SHOTS } from './shots';\nimport { ASSETS } from './assets';\nimport { USERS } from './users';\nimport { DEPARTMENTS } from './departments';\n" + tasks_content)

versions_content = re.search(r'(// --- Versions.*?)(?=// --- Reviews)', content, re.DOTALL).group(1)
with open('src/data/versions.ts', 'w') as f:
    f.write("import { Version } from './types';\nimport { SHOTS } from './shots';\nimport { ASSETS } from './assets';\nimport { USERS } from './users';\n" + versions_content)

reviews_content = re.search(r'(// --- Reviews.*?)(?=// --- Publish Logs)', content, re.DOTALL).group(1)
with open('src/data/reviews.ts', 'w') as f:
    f.write("import { Review } from './types';\nimport { SHOTS } from './shots';\nimport { VERSIONS } from './versions';\nimport { USERS } from './users';\n" + reviews_content)

publish_logs_content = re.search(r'(// --- Publish Logs.*?)(?=// --- Workflow Runs)', content, re.DOTALL).group(1)
with open('src/data/publish_logs.ts', 'w') as f:
    f.write("import { PublishLog } from './types';\nimport { ASSETS } from './assets';\nimport { VERSIONS } from './versions';\nimport { USERS } from './users';\n" + publish_logs_content)

workflow_runs_content = re.search(r'(// --- Workflow Runs.*?)(?=// --- Audit Events)', content, re.DOTALL).group(1)
with open('src/data/workflow_runs.ts', 'w') as f:
    f.write("import { WorkflowRun, Workflow } from './types';\n" + workflow_runs_content)

audit_events_content = re.search(r'(// --- Audit Events.*?)(?=// --- Notifications)', content, re.DOTALL).group(1)
with open('src/data/audit_events.ts', 'w') as f:
    f.write("import { AuditEvent } from './types';\nimport { USERS } from './users';\nimport { SHOTS } from './shots';\nimport { ASSETS } from './assets';\n" + audit_events_content)

notifications_content = re.search(r'(// --- Notifications.*?)(?=// --- AISuggestions)', content, re.DOTALL).group(1)
with open('src/data/notifications.ts', 'w') as f:
    f.write("import { Notification } from './types';\nimport { USERS } from './users';\nimport { SHOTS } from './shots';\nimport { ASSETS } from './assets';\n" + notifications_content)

ai_content = re.search(r'(// --- AISuggestions.*?)(?=// --- Milestones)', content, re.DOTALL).group(1)
with open('src/data/ai_suggestions.ts', 'w') as f:
    f.write("import { AISuggestion } from './types';\nimport { PROJECTS } from './projects';\nimport { DEPARTMENTS } from './departments';\nimport { USERS } from './users';\n" + ai_content)

milestones_content = re.search(r'(// --- Milestones.*?)(?=// --- Plugins)', content, re.DOTALL).group(1)
with open('src/data/milestones.ts', 'w') as f:
    f.write("import { Milestone } from './types';\nimport { PROJECTS } from './projects';\n" + milestones_content)

plugins_content = re.search(r'(// --- Plugins.*?)(?=// --- Chat Messages)', content, re.DOTALL).group(1)
with open('src/data/plugins.ts', 'w') as f:
    f.write("import { Plugin } from './types';\n" + plugins_content)

chat_content = re.search(r'(// --- Chat Messages.*?)$', content, re.DOTALL).group(1)
with open('src/data/chat_messages.ts', 'w') as f:
    f.write("import { ChatMessage, TimeLog } from './types';\nimport { USERS } from './users';\n" + chat_content)

print("Split success")

import http from "http";
import fs from "fs";
import path from "path";
import os from "os";

const PORT = 3000;
const BRAIN_DIR = path.join(
  os.homedir(),
  ".gemini",
  "antigravity-cli",
  "brain",
);

function getAgents() {
  if (!fs.existsSync(BRAIN_DIR)) return [];
  const agents = [];
  const dirs = fs.readdirSync(BRAIN_DIR);

  for (const dir of dirs) {
    if (dir.startsWith(".")) continue; // skip hidden
    const logPath = path.join(
      BRAIN_DIR,
      dir,
      ".system_generated",
      "logs",
      "transcript.jsonl",
    );

    let lastActivity = "Unknown";
    let status = "idle";

    if (fs.existsSync(logPath)) {
      try {
        const fileContent = fs.readFileSync(logPath, "utf-8").trim();
        const lines = fileContent.split("\n");
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1];
          try {
            const parsed = JSON.parse(lastLine);
            lastActivity = parsed.content || parsed.type;

            // Basic heuristic for status
            if (
              parsed.type === "PLANNER_RESPONSE" &&
              parsed.tool_calls &&
              parsed.tool_calls.length > 0
            ) {
              status = "running";
            } else if (parsed.type === "USER_INPUT") {
              status = "running";
            } else if (
              parsed.type === "PLANNER_RESPONSE" &&
              (!parsed.tool_calls || parsed.tool_calls.length === 0)
            ) {
              status = "idle";
            }
          } catch (e) {
            lastActivity = lastLine.substring(0, 50);
          }
        }
      } catch (e) {
        lastActivity = "Error reading log";
      }
    }

    agents.push({
      id: dir,
      status,
      lastActivity,
      updatedAt: fs.statSync(path.join(BRAIN_DIR, dir)).mtime,
    });
  }

  return agents.sort((a, b) => b.updatedAt - a.updatedAt);
}

const server = http.createServer((req, res) => {
  if (req.url === "/api/agents") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getAgents()));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Antigravity Agent Monitor</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, system-ui, sans-serif; background: #0a0a0a; color: #fff; margin: 0; padding: 2rem; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1rem; }
        .card { background: #1a1a1a; border: 1px solid #333; padding: 1.5rem; border-radius: 8px; }
        .card h3 { margin: 0 0 0.5rem 0; font-size: 1.1rem; color: #fff; }
        .id { font-family: monospace; color: #888; font-size: 0.8rem; margin-bottom: 1rem; }
        .status { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.8rem; font-weight: 600; margin-bottom: 1rem; text-transform: uppercase;}
        .status.running { background: #166534; color: #4ade80; }
        .status.idle { background: #1e3a8a; color: #60a5fa; }
        .activity { font-size: 0.9rem; color: #ccc; line-height: 1.4; max-height: 100px; overflow-y: auto; background: #000; padding: 0.75rem; border-radius: 4px; border: 1px solid #222;}
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
        .header h1 { margin: 0; }
        .refresh { background: #2563eb; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
        .refresh:hover { background: #1d4ed8; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Agent Control Center</h1>
        <button class="refresh" onclick="fetchAgents()">Refresh Now</button>
      </div>
      <div class="grid" id="grid">Loading...</div>
      
      <script>
        async function fetchAgents() {
          const res = await fetch('/api/agents');
          const agents = await res.json();
          const grid = document.getElementById('grid');
          
          if (agents.length === 0) {
            grid.innerHTML = '<p>No agents found in brain directory.</p>';
            return;
          }
          
          grid.innerHTML = agents.map(a => 
            '<div class="card">' +
              '<h3>Agent Session</h3>' +
              '<div class="id">' + a.id + '</div>' +
              '<div class="status ' + a.status + '">' + a.status + '</div>' +
              '<div class="activity"><strong>Last Activity:</strong><br/>' + (a.lastActivity.length > 200 ? a.lastActivity.substring(0,200) + '...' : a.lastActivity) + '</div>' +
            '</div>'
          ).join('');
        }
        
        fetchAgents();
        setInterval(fetchAgents, 3000);
      </script>
    </body>
    </html>
  `);
});

server.listen(PORT, () => {
  console.log(`[Agent Monitor] Started locally at http://localhost:${PORT}`);
  console.log(`[Agent Monitor] Reading agent data from ${BRAIN_DIR}`);
});

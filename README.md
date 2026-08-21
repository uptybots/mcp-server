# UptyBots MCP Server

Connect AI assistants like **Claude**, **Cursor**, and other MCP-compatible tools to your [UptyBots](https://uptybots.com) uptime monitors.

## What is this?

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives AI assistants access to your UptyBots monitoring data. Ask your AI to check monitor status, review incidents, create new monitors, and more - through natural conversation.

## You probably want the hosted server instead

There is now a remote server that needs no install and no API key:

```
https://mcp.uptybots.com/mcp
```

Add that URL to your client and it opens a browser for you to sign in and approve
access. If you do not have an UptyBots account yet, you can create one at that step.

With Claude Code:

```bash
claude mcp add --transport http uptybots https://mcp.uptybots.com/mcp
```

then run `/mcp`, pick **uptybots** and authenticate.

**This package is the local alternative.** It runs on your own machine and
authenticates with an API key instead of a browser sign-in - the right choice for
MCP clients that cannot talk to remote servers, and for offline or self-contained
setups. It exposes the same 15 tools and is not going away.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- A [UptyBots](https://uptybots.com) account
- An API key from [Account → API Keys](https://uptybots.com/account/api-keys)

## Setup

### 1. Configure your AI client

No install step needed: `npx` fetches the published package on first run.

Add to your MCP client configuration:

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "uptybots": {
      "command": "npx",
      "args": ["-y", "uptybots-mcp-server"],
      "env": {
        "UPTYBOTS_API_URL": "https://uptybots.com",
        "UPTYBOTS_API_KEY": "upty_your_api_key_here"
      }
    }
  }
}
```

**Claude Code** (`~/.claude/settings.json`) and **Cursor** (`.cursor/mcp.json`) use the same format.

### 2. Restart your AI client

The MCP tools will be available immediately.

### Running from source (optional)

To run a local checkout instead of the npm package:

```bash
git clone https://github.com/uptybots/mcp-server.git
cd mcp-server
npm install
```

Then point the client at the checkout:

```json
{
  "mcpServers": {
    "uptybots": {
      "command": "node",
      "args": ["/path/to/mcp-server/index.js"],
      "env": {
        "UPTYBOTS_API_URL": "https://uptybots.com",
        "UPTYBOTS_API_KEY": "upty_your_api_key_here"
      }
    }
  }
}
```

## Available Tools (15)

### Read
| Tool | Description |
|------|-------------|
| `list_monitors` | List all monitors with filters (type, status) |
| `get_monitor` | Get monitor details by ID |
| `get_incidents` | Get downtime incidents for a monitor |
| `get_stats_hourly` | Hourly performance stats |
| `get_stats_daily` | Daily performance stats |
| `get_notifications` | Notification history |

### Create
| Tool | Description |
|------|-------------|
| `create_http_monitor` | Create HTTP/HTTPS monitor |
| `create_api_monitor` | Create API endpoint monitor |
| `create_ping_monitor` | Create ICMP ping monitor |
| `create_port_monitor` | Create TCP port monitor |
| `create_ssl_monitor` | Create SSL certificate monitor |
| `create_domain_monitor` | Create domain expiration monitor |

### Manage
| Tool | Description |
|------|-------------|
| `pause_monitor` | Pause a monitor |
| `resume_monitor` | Resume a paused monitor |
| `delete_monitor` | Delete a monitor |

## Prompts (5)

Starting sentences an assistant can offer instead of asking you to phrase the request
yourself. Each one is a wording of something the tools above already do; none adds
capability. The hosted server offers exactly the same five.

| Prompt | Argument | What it asks for |
|--------|----------|------------------|
| `status_check` | none | What is failing right now, and since when |
| `uptime_report` | `days` (optional, default 7) | Uptime and response times over a period, worst first |
| `incident_review` | `monitor` | The failure pattern of one monitor: outage, flapping, or degradation |
| `expiry_audit` | none | SSL certificates and domains by how soon they expire |
| `setup_monitor` | `target` | The right monitor type for a target, then create it |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `UPTYBOTS_API_URL` | No | API base URL (default: `https://uptybots.com`) |
| `UPTYBOTS_API_KEY` | Yes | Your API key (starts with `upty_`) |

## Documentation

- [MCP Server Docs](https://uptybots.com/docs/mcp) - full setup guide and tool reference, covering both the hosted server and this one
- [REST API Reference](https://uptybots.com/docs/api) - the API that powers the MCP server
- [Account → Connected Applications](https://uptybots.com/account/connected-apps) - review and revoke access granted through the hosted server

## License

MIT

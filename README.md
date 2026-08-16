# UptyBots MCP Server

Connect AI assistants like **Claude**, **Cursor**, and other MCP-compatible tools to your [UptyBots](https://uptybots.com) uptime monitors.

## What is this?

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives AI assistants access to your UptyBots monitoring data. Ask your AI to check monitor status, review incidents, create new monitors, and more — through natural conversation.

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

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `UPTYBOTS_API_URL` | No | API base URL (default: `https://uptybots.com`) |
| `UPTYBOTS_API_KEY` | Yes | Your API key (starts with `upty_`) |

## Documentation

- [MCP Server Docs](https://uptybots.com/docs/mcp) — full setup guide and tool reference
- [REST API Reference](https://uptybots.com/docs/api) — the API that powers the MCP server

## License

MIT

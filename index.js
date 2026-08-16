#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  listMonitors,
  getMonitor,
  createMonitor,
  toggleMonitor,
  deleteMonitor,
  updateMonitor,
  getIncidents,
  getStatsHourly,
  getStatsDaily,
  getNotifications,
  getUserIri,
} from './lib/api.js';

const server = new McpServer({
  name: 'uptybots',
  version: '1.0.5',
});

// Helper: format tool result
function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function err(e) {
  return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
}

// ─── LIST MONITORS ───────────────────────────────────────────────

server.tool(
  'list_monitors',
  'List all uptime monitors. Returns name, url, type, status, frequency for each.',
  {
    type: z.enum(['PING', 'HTTP', 'API', 'SSL', 'DOMAIN', 'PORT']).optional()
      .describe('Filter by monitor type'),
    status: z.enum(['up', 'down', 'paused', 'pending']).optional()
      .describe('Filter by status'),
    page: z.number().int().positive().optional()
      .describe('Page number (default 1)'),
  },
  async ({ type, status, page }) => {
    try {
      return ok(await listMonitors({ type, status, page }));
    } catch (e) { return err(e); }
  }
);

// ─── GET MONITOR ─────────────────────────────────────────────────

server.tool(
  'get_monitor',
  'Get detailed information about a specific monitor including its configuration and current status.',
  {
    id: z.number().int().positive().describe('Monitor ID'),
  },
  async ({ id }) => {
    try {
      return ok(await getMonitor(id));
    } catch (e) { return err(e); }
  }
);

// ─── CREATE HTTP MONITOR ─────────────────────────────────────────

server.tool(
  'create_http_monitor',
  'Create a new HTTP/HTTPS uptime monitor. Checks if a website URL returns expected status codes.',
  {
    name: z.string().max(50).describe('Monitor name (max 50 chars)'),
    url: z.string().describe('Full URL to monitor (e.g. https://example.com)'),
    frequency: z.number().int().min(1).max(1440).optional()
      .describe('Check frequency in minutes (1-1440, default 5)'),
    requestTimeout: z.number().int().min(1).max(60).optional()
      .describe('Request timeout in seconds (1-60, default 30)'),
    isActive: z.boolean().optional().describe('Start monitoring immediately (default true)'),
  },
  async ({ name, url, frequency, requestTimeout, isActive }) => {
    try {
      const userIri = await getUserIri();
      const body = { name, url, type: 'HTTP', user: userIri, isActive: isActive ?? true };
      if (frequency !== undefined) body.frequency = frequency;
      if (requestTimeout !== undefined) body.requestTimeout = requestTimeout;
      return ok(await createMonitor('', body));
    } catch (e) { return err(e); }
  }
);

// ─── CREATE API MONITOR ──────────────────────────────────────────

server.tool(
  'create_api_monitor',
  'Create a new API endpoint monitor. Checks if an API returns expected status codes and responses.',
  {
    name: z.string().max(50).describe('Monitor name (max 50 chars)'),
    url: z.string().describe('API endpoint URL'),
    frequency: z.number().int().min(1).max(1440).optional()
      .describe('Check frequency in minutes (1-1440, default 5)'),
    requestTimeout: z.number().int().min(1).max(60).optional()
      .describe('Request timeout in seconds (1-60, default 30)'),
    isActive: z.boolean().optional().describe('Start monitoring immediately (default true)'),
  },
  async ({ name, url, frequency, requestTimeout, isActive }) => {
    try {
      const userIri = await getUserIri();
      const body = { name, url, type: 'API', user: userIri, isActive: isActive ?? true };
      if (frequency !== undefined) body.frequency = frequency;
      if (requestTimeout !== undefined) body.requestTimeout = requestTimeout;
      return ok(await createMonitor('', body));
    } catch (e) { return err(e); }
  }
);

// ─── CREATE PING MONITOR ─────────────────────────────────────────

server.tool(
  'create_ping_monitor',
  'Create a new PING monitor. Checks if a host responds to ICMP ping. URL should be a hostname or IP (e.g. example.com, 192.168.1.1).',
  {
    name: z.string().max(50).describe('Monitor name (max 50 chars)'),
    url: z.string().describe('Hostname or IP to ping (e.g. example.com, 1.2.3.4)'),
    frequency: z.number().int().min(1).max(1440).optional()
      .describe('Check frequency in minutes (1-1440, default 5)'),
    isActive: z.boolean().optional().describe('Start monitoring immediately (default true)'),
  },
  async ({ name, url, frequency, isActive }) => {
    try {
      const userIri = await getUserIri();
      const body = { name, url, type: 'PING', user: userIri, isActive: isActive ?? true };
      if (frequency !== undefined) body.frequency = frequency;
      return ok(await createMonitor('/type_ping', body));
    } catch (e) { return err(e); }
  }
);

// ─── CREATE PORT MONITOR ─────────────────────────────────────────

server.tool(
  'create_port_monitor',
  'Create a new PORT monitor. Checks if a specific port is open on a host. URL must include port (e.g. example.com:443, 192.168.1.1:3306).',
  {
    name: z.string().max(50).describe('Monitor name (max 50 chars)'),
    url: z.string().describe('Host:port to check (e.g. example.com:443)'),
    frequency: z.number().int().min(1).max(1440).optional()
      .describe('Check frequency in minutes (1-1440, default 5)'),
    isActive: z.boolean().optional().describe('Start monitoring immediately (default true)'),
  },
  async ({ name, url, frequency, isActive }) => {
    try {
      const userIri = await getUserIri();
      const body = { name, url, type: 'PORT', user: userIri, isActive: isActive ?? true };
      if (frequency !== undefined) body.frequency = frequency;
      return ok(await createMonitor('/type_port', body));
    } catch (e) { return err(e); }
  }
);

// ─── CREATE SSL MONITOR ──────────────────────────────────────────

server.tool(
  'create_ssl_monitor',
  'Create a new SSL certificate monitor. Checks certificate validity and expiration. URL should be a domain (e.g. example.com).',
  {
    name: z.string().max(50).describe('Monitor name (max 50 chars)'),
    url: z.string().describe('Domain to check SSL for (e.g. example.com)'),
    isActive: z.boolean().optional().describe('Start monitoring immediately (default true)'),
  },
  async ({ name, url, isActive }) => {
    try {
      const userIri = await getUserIri();
      const body = { name, url, type: 'SSL', user: userIri, isActive: isActive ?? true };
      return ok(await createMonitor('/type_ssl', body));
    } catch (e) { return err(e); }
  }
);

// ─── CREATE DOMAIN MONITOR ───────────────────────────────────────

server.tool(
  'create_domain_monitor',
  'Create a new domain expiration monitor. Checks when a domain registration expires. URL should be a domain (e.g. example.com).',
  {
    name: z.string().max(50).describe('Monitor name (max 50 chars)'),
    url: z.string().describe('Domain to monitor expiry (e.g. example.com)'),
    isActive: z.boolean().optional().describe('Start monitoring immediately (default true)'),
  },
  async ({ name, url, isActive }) => {
    try {
      const userIri = await getUserIri();
      const body = { name, url, type: 'DOMAIN', user: userIri, isActive: isActive ?? true };
      return ok(await createMonitor('/type_domain', body));
    } catch (e) { return err(e); }
  }
);

// ─── PAUSE MONITOR ───────────────────────────────────────────────

server.tool(
  'pause_monitor',
  'Pause a monitor (stop checking). The monitor will show as "paused" status.',
  {
    id: z.number().int().positive().describe('Monitor ID to pause'),
  },
  async ({ id }) => {
    try {
      return ok(await toggleMonitor(id, false));
    } catch (e) { return err(e); }
  }
);

// ─── RESUME MONITOR ──────────────────────────────────────────────

server.tool(
  'resume_monitor',
  'Resume a paused monitor (start checking again).',
  {
    id: z.number().int().positive().describe('Monitor ID to resume'),
  },
  async ({ id }) => {
    try {
      return ok(await toggleMonitor(id, true));
    } catch (e) { return err(e); }
  }
);

// ─── DELETE MONITOR ──────────────────────────────────────────────

server.tool(
  'delete_monitor',
  'Permanently delete a monitor and all its history. This action cannot be undone.',
  {
    id: z.number().int().positive().describe('Monitor ID to delete'),
  },
  async ({ id }) => {
    try {
      await deleteMonitor(id);
      return ok({ success: true, message: `Monitor ${id} deleted` });
    } catch (e) { return err(e); }
  }
);

// ─── GET INCIDENTS ───────────────────────────────────────────────

server.tool(
  'get_incidents',
  'Get downtime incidents for a monitor. Shows when the monitor went down and came back up.',
  {
    monitorId: z.number().int().positive().describe('Monitor ID'),
    page: z.number().int().positive().optional().describe('Page number'),
  },
  async ({ monitorId, page }) => {
    try {
      return ok(await getIncidents({ monitorId, page }));
    } catch (e) { return err(e); }
  }
);

// ─── GET HOURLY STATS ────────────────────────────────────────────

server.tool(
  'get_stats_hourly',
  'Get hourly performance statistics for a monitor (response times, uptime/downtime duration per hour).',
  {
    monitorId: z.number().int().positive().describe('Monitor ID'),
    dateFrom: z.string().optional().describe('Start date (YYYY-MM-DD)'),
    dateTo: z.string().optional().describe('End date (YYYY-MM-DD)'),
    page: z.number().int().positive().optional().describe('Page number'),
  },
  async ({ monitorId, dateFrom, dateTo, page }) => {
    try {
      return ok(await getStatsHourly({ monitorId, dateFrom, dateTo, page }));
    } catch (e) { return err(e); }
  }
);

// ─── GET DAILY STATS ─────────────────────────────────────────────

server.tool(
  'get_stats_daily',
  'Get daily performance statistics for a monitor (response times, uptime/downtime duration per day).',
  {
    monitorId: z.number().int().positive().describe('Monitor ID'),
    dateFrom: z.string().optional().describe('Start date (YYYY-MM-DD)'),
    dateTo: z.string().optional().describe('End date (YYYY-MM-DD)'),
    page: z.number().int().positive().optional().describe('Page number'),
  },
  async ({ monitorId, dateFrom, dateTo, page }) => {
    try {
      return ok(await getStatsDaily({ monitorId, dateFrom, dateTo, page }));
    } catch (e) { return err(e); }
  }
);

// ─── GET NOTIFICATIONS ───────────────────────────────────────────

server.tool(
  'get_notifications',
  'Get notification history (alerts sent via email, Telegram, webhook, or web).',
  {
    channel: z.enum(['email', 'telegram', 'webhook', 'web']).optional()
      .describe('Filter by notification channel'),
    status: z.string().optional().describe('Filter by status'),
    page: z.number().int().positive().optional().describe('Page number'),
  },
  async ({ channel, status, page }) => {
    try {
      return ok(await getNotifications({ channel, status, page }));
    } catch (e) { return err(e); }
  }
);

// ─── START ────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

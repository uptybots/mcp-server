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

// Tool titles, descriptions and annotations here are the same text as in the
// remote server's app/src/Service/Mcp/ToolRegistry.php. The two servers must
// expose the same tools with the same names, arguments and defaults, or an
// assistant switching between them silently changes behaviour. Edit one, edit
// the other in the same change.
const server = new McpServer({
  name: 'uptybots',
  title: 'UptyBots',
  version: '1.3.1',
});

// Behaviour hints. openWorldHint is true throughout: every tool reaches the
// UptyBots API rather than a closed local dataset.
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const CREATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const MUTATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };

// Output schemas. Declaring one obliges the tool to return structuredContent
// as well as the text block; the SDK does that from the value we return.
// Deliberately loose about the monitor object: the API gains fields as the
// product grows, and a strict schema would start rejecting valid answers.
const monitorObject = {
  id: z.number().int().describe('Monitor id, used by every other tool.'),
  name: z.string().optional(),
  url: z.string().optional(),
  type: z.enum(['PING', 'HTTP', 'API', 'SSL', 'DOMAIN', 'PORT']).optional(),
  statusSummary: z.string().optional().describe('Current state, for example GOOD or ERROR.'),
  frequency: z.number().int().optional().describe('Check interval in minutes.'),
  isActive: z.boolean().optional().describe('False while the monitor is paused.'),
};
const collectionOutput = {
  items: z.array(z.object({}).passthrough()).describe('The rows on this page.'),
  totalItems: z.number().int().nullable().optional().describe('Total across all pages, not just this one.'),
};
const deletedOutput = {
  success: z.boolean(),
  message: z.string().optional(),
};

const monitorName = z.string().max(50)
  .describe('Label shown in the dashboard and in alerts, up to 50 characters. Something recognisable months later beats the bare hostname.');
const frequency = z.number().int().min(1).max(1440).optional()
  .describe('Check frequency in minutes (1-1440, default 5)');
const requestTimeout = z.number().int().min(1).max(60).optional()
  .describe('Request timeout in seconds (1-60, default 30)');
const isActiveArg = z.boolean().optional()
  .describe('Start monitoring immediately (default true)');
const page = z.number().int().positive().optional()
  .describe('Page number, 1-based. Defaults to 1.');
const monitorId = z.number().int().positive()
  .describe('Monitor id, as returned by list_monitors.');
const dateFrom = z.string().optional()
  .describe('First day to include, as YYYY-MM-DD. Defaults to the start of available history.');
const dateTo = z.string().optional()
  .describe('Last day to include, as YYYY-MM-DD. Defaults to today.');

// Helper: format tool result.
// Every tool declares an outputSchema, and the spec then requires the same
// payload as structuredContent; the text block stays for clients older than
// 2025-06-18, which know nothing else.
function ok(data) {
  const result = { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    result.structuredContent = data;
  }
  return result;
}
function err(e) {
  return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
}

// ─── LIST MONITORS ───────────────────────────────────────────────

server.registerTool(
  'list_monitors',
  {
    title: 'List monitors',
    description: 'List the monitors on the account, newest first, 30 per page. '
      + 'Each entry carries the id needed by every other tool, plus name, url, type, '
      + 'current status, check frequency and the uptime percentage over the last 24 hours. '
      + 'Start here when the request names a monitor by name rather than by id, and when '
      + 'asked what is broken - filtering by status "down" answers that in one call. '
      + 'Returns an empty list rather than an error when nothing matches.',
    annotations: READ_ONLY,
    outputSchema: collectionOutput,
    inputSchema: {
      type: z.enum(['PING', 'HTTP', 'API', 'SSL', 'DOMAIN', 'PORT']).optional()
        .describe('Return only monitors of this type. Omit for all types.'),
      status: z.enum(['up', 'down', 'paused', 'pending']).optional()
        .describe('Return only monitors in this state. "pending" means created but not yet checked; "paused" means checking is switched off, so it is neither up nor down.'),
      page,
    },
  },
  async ({ type, status, page }) => {
    try {
      return ok(await listMonitors({ type, status, page }));
    } catch (e) { return err(e); }
  }
);

// ─── GET MONITOR ─────────────────────────────────────────────────

server.registerTool(
  'get_monitor',
  {
    title: 'Get one monitor',
    description: 'Read one monitor in full: its configuration, current status, and the '
      + 'type-specific detail the list view omits - expected status codes for HTTP, port and '
      + 'protocol for PORT, certificate or registration expiry date for SSL and DOMAIN. '
      + 'Use it after list_monitors when the answer depends on how the check is configured, '
      + 'for instance whether a timeout is too tight or which port is actually being watched.',
    annotations: READ_ONLY,
    outputSchema: monitorObject,
    inputSchema: { id: monitorId },
  },
  async ({ id }) => {
    try {
      return ok(await getMonitor(id));
    } catch (e) { return err(e); }
  }
);

// ─── CREATE HTTP MONITOR ─────────────────────────────────────────

server.registerTool(
  'create_http_monitor',
  {
    title: 'Create HTTP monitor',
    description: 'Watch a web page or endpoint over HTTP/HTTPS and treat an unexpected status '
      + 'code, a timeout or a connection failure as downtime. This is the right type for '
      + 'anything a browser would open. Choose create_api_monitor instead when the response '
      + 'body matters as well as the status code. Checks run from probes in several countries. '
      + 'Call list_monitors first so you do not create a duplicate of an existing url.',
    annotations: CREATE,
    outputSchema: monitorObject,
    inputSchema: {
      name: monitorName,
      url: z.string().describe('Full URL including scheme, for example https://example.com/health. A bare hostname is not accepted here - use create_ping_monitor for that.'),
      frequency,
      requestTimeout,
      isActive: isActiveArg,
    },
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

server.registerTool(
  'create_api_monitor',
  {
    title: 'Create API monitor',
    description: 'Watch a JSON or REST endpoint where the response itself matters, not only '
      + 'that the host answered. Use it for health endpoints, webhooks and any API whose '
      + 'failure would be invisible to a plain page check. For an ordinary web page, '
      + 'create_http_monitor is lighter and enough.',
    annotations: CREATE,
    outputSchema: monitorObject,
    inputSchema: {
      name: monitorName,
      url: z.string().describe('Full endpoint URL including scheme, for example https://api.example.com/v1/status.'),
      frequency,
      requestTimeout,
      isActive: isActiveArg,
    },
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

server.registerTool(
  'create_ping_monitor',
  {
    title: 'Create ping monitor',
    description: 'Watch a host with ICMP ping: it answers whether the machine is reachable at '
      + 'all, and reports round-trip time and packet loss. Use it for servers, routers and '
      + 'anything with no web service on top. It says nothing about whether a site or service '
      + 'on that host is working - a box can ping perfectly while its web server is down. '
      + 'Some hosting providers block ICMP, in which case the monitor will read as down.',
    annotations: CREATE,
    outputSchema: monitorObject,
    inputSchema: {
      name: monitorName,
      url: z.string().describe('Hostname or IP address, with no scheme and no port, for example example.com or 1.2.3.4.'),
      frequency,
      isActive: isActiveArg,
    },
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

server.registerTool(
  'create_port_monitor',
  {
    title: 'Create port monitor',
    description: 'Watch one TCP or UDP port on a host and report it up only when the service '
      + 'behind it actually answers. This is the type for game servers, databases, mail and '
      + 'anything else that speaks its own protocol rather than HTTP - Minecraft, Rust, CS2, '
      + 'FiveM, Postgres, Redis, SMTP. The port must be given as part of the url. '
      + 'Set protocol to UDP for game servers; most of them do not answer on TCP at all.',
    annotations: CREATE,
    outputSchema: monitorObject,
    inputSchema: {
      name: monitorName,
      url: z.string().describe('Host and port separated by a colon, for example example.com:443 or 1.2.3.4:25565. The port is required; without it the monitor cannot be created.'),
      protocol: z.enum(['TCP', 'UDP']).optional()
        .describe('TCP is the default and fits most services. Use UDP for game servers and anything else that does not answer on TCP; on UDP the port counts as up only when the server actually replies.'),
      frequency,
      isActive: isActiveArg,
    },
  },
  async ({ name, url, protocol, frequency, isActive }) => {
    try {
      const userIri = await getUserIri();
      const body = { name, url, type: 'PORT', user: userIri, isActive: isActive ?? true };
      if (frequency !== undefined) body.frequency = frequency;
      // portInfo надсилаємо завжди: без нього target_port не створюється взагалі,
      // і монітор мовчки лишається мертвим — бот такі цілі пропускає
      body.portInfo = { isAllowIp4: true, isAllowIp6: true, portProtocol: protocol ?? 'TCP' };
      return ok(await createMonitor('/type_port', body));
    } catch (e) { return err(e); }
  }
);

// ─── CREATE SSL MONITOR ──────────────────────────────────────────

server.registerTool(
  'create_ssl_monitor',
  {
    title: 'Create SSL certificate monitor',
    description: 'Watch a TLS certificate: whether it is valid, who issued it, and how many '
      + 'days remain before it expires. This is about the certificate, not about the site '
      + 'being reachable - pair it with create_http_monitor when you want both. Note that '
      + 'such a monitor carries two independent states, one for reachability and one for '
      + 'expiry, so a certificate can be days from expiring while the check still reads up.',
    annotations: CREATE,
    outputSchema: monitorObject,
    inputSchema: {
      name: monitorName,
      url: z.string().describe('Domain whose certificate to inspect, for example example.com. No scheme, no path.'),
      isActive: isActiveArg,
    },
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

server.registerTool(
  'create_domain_monitor',
  {
    title: 'Create domain expiry monitor',
    description: 'Watch a domain registration and report how long is left before it lapses, '
      + 'read from WHOIS. This catches the failure no uptime check can see: everything works '
      + 'perfectly right up to the day the domain expires. Distinct from create_ssl_monitor, '
      + 'which watches the certificate rather than the registration; the two expire on '
      + 'different dates and both are worth watching.',
    annotations: CREATE,
    outputSchema: monitorObject,
    inputSchema: {
      name: monitorName,
      url: z.string().describe('Registrable domain, for example example.com. Use the registered domain rather than a subdomain: a subdomain has no registration date of its own.'),
      isActive: isActiveArg,
    },
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

server.registerTool(
  'pause_monitor',
  {
    title: 'Pause monitor',
    description: 'Stop checking a monitor without deleting it. History and configuration '
      + 'survive, and resume_monitor puts it back to work. Use this around planned '
      + 'maintenance so the downtime does not land in the uptime figures or fire alerts. '
      + 'A paused monitor reports neither up nor down, so it is easy to forget one is off.',
    annotations: MUTATE,
    outputSchema: monitorObject,
    inputSchema: { id: z.number().int().positive().describe('Monitor id to pause, as returned by list_monitors.') },
  },
  async ({ id }) => {
    try {
      return ok(await toggleMonitor(id, false));
    } catch (e) { return err(e); }
  }
);

// ─── RESUME MONITOR ──────────────────────────────────────────────

server.registerTool(
  'resume_monitor',
  {
    title: 'Resume monitor',
    description: 'Start checking a paused monitor again, with the configuration it had '
      + 'before. The first check runs immediately rather than after the usual interval, so '
      + 'the current state is known within moments. Safe to call on a monitor that is '
      + 'already running.',
    annotations: MUTATE,
    outputSchema: monitorObject,
    inputSchema: { id: z.number().int().positive().describe('Monitor id to resume, as returned by list_monitors.') },
  },
  async ({ id }) => {
    try {
      return ok(await toggleMonitor(id, true));
    } catch (e) { return err(e); }
  }
);

// ─── DELETE MONITOR ──────────────────────────────────────────────

server.registerTool(
  'delete_monitor',
  {
    title: 'Delete monitor',
    description: 'Permanently delete a monitor together with its entire check history, '
      + 'incidents and statistics. This cannot be undone and there is no trash to restore '
      + 'from. Confirm with the user before calling it, and prefer pause_monitor whenever '
      + 'the intent is only to stop the checking for a while.',
    annotations: DESTRUCTIVE,
    outputSchema: deletedOutput,
    inputSchema: { id: z.number().int().positive().describe('Monitor id to delete, as returned by list_monitors. Deletion is irreversible.') },
  },
  async ({ id }) => {
    try {
      await deleteMonitor(id);
      return ok({ success: true, message: `Monitor ${id} deleted` });
    } catch (e) { return err(e); }
  }
);

// ─── GET INCIDENTS ───────────────────────────────────────────────

server.registerTool(
  'get_incidents',
  {
    title: 'Get incidents',
    description: 'Read the downtime history of one monitor: when each outage began, when it '
      + 'ended, how long it lasted and what the failure actually was - HTTP status, error '
      + 'text, and which probe saw it. This is the tool for "what happened" and "how often '
      + 'does this break". For the shape of response times around an outage, follow up with '
      + 'get_stats_hourly.',
    annotations: READ_ONLY,
    outputSchema: collectionOutput,
    inputSchema: { monitorId, page },
  },
  async ({ monitorId, page }) => {
    try {
      return ok(await getIncidents({ monitorId, page }));
    } catch (e) { return err(e); }
  }
);

// ─── GET HOURLY STATS ────────────────────────────────────────────

server.registerTool(
  'get_stats_hourly',
  {
    title: 'Get hourly statistics',
    description: 'Response time and uptime for one monitor broken down by hour, with min, '
      + 'max, average and p95 per bucket. Use it to see the shape of a problem: whether a '
      + 'service degrades before it fails, whether outages cluster at a particular time of '
      + 'day, or how long a single incident really lasted. Best over hours or days; for '
      + 'weeks and months use get_stats_daily instead, which returns far fewer rows.',
    annotations: READ_ONLY,
    outputSchema: collectionOutput,
    inputSchema: { monitorId, dateFrom, dateTo, page },
  },
  async ({ monitorId, dateFrom, dateTo, page }) => {
    try {
      return ok(await getStatsHourly({ monitorId, dateFrom, dateTo, page }));
    } catch (e) { return err(e); }
  }
);

// ─── GET DAILY STATS ─────────────────────────────────────────────

server.registerTool(
  'get_stats_daily',
  {
    title: 'Get daily statistics',
    description: 'Response time and uptime for one monitor aggregated per day, with min, '
      + 'max, average and p95. This is the tool for reports and trends over weeks or months, '
      + 'and for comparing one monitor against another over the same window. When a single '
      + 'day looks wrong, zoom into it with get_stats_hourly.',
    annotations: READ_ONLY,
    outputSchema: collectionOutput,
    inputSchema: { monitorId, dateFrom, dateTo, page },
  },
  async ({ monitorId, dateFrom, dateTo, page }) => {
    try {
      return ok(await getStatsDaily({ monitorId, dateFrom, dateTo, page }));
    } catch (e) { return err(e); }
  }
);

// ─── GET NOTIFICATIONS ───────────────────────────────────────────

server.registerTool(
  'get_notifications',
  {
    title: 'Get notification history',
    description: 'Read the alerts this account has sent, across email, Telegram, webhook and '
      + 'the web interface, with the delivery outcome of each. Use it to answer "was I '
      + 'actually told about this outage" and to find a channel that is silently failing - '
      + 'a monitor can be detecting downtime correctly while its webhook has been rejecting '
      + 'every delivery. Covers the whole account, not one monitor.',
    annotations: READ_ONLY,
    outputSchema: collectionOutput,
    inputSchema: {
      channel: z.enum(['email', 'telegram', 'webhook', 'web']).optional()
        .describe('Return only alerts sent through this channel. Omit for all channels.'),
      status: z.string().optional().describe('Return only alerts with this delivery status.'),
      page,
    },
  },
  async ({ channel, status, page }) => {
    try {
      return ok(await getNotifications({ channel, status, page }));
    } catch (e) { return err(e); }
  }
);

// ─── PROMPTS ──────────────────────────────────────────────────────
//
// The same five templates as the remote server's app/src/Service/Mcp/PromptRegistry.php,
// word for word, for the same reason the tool text is shared: an assistant that switches
// between the hosted server and this one must get the same starting sentence.
//
// None of them is a capability of its own. Each is a phrasing of something the 15 tools
// above already do, worded the way those tools actually answer it - naming the tool and
// the arguments that matter.

// Each description is used twice, in the listing and in the expansion, so it lives in one
// place. prompts/get carries it because the spec allows it and the remote server sends it.
const PROMPT_DESCRIPTIONS = {
  status_check: 'Check every monitor for current failures and summarise what is broken.',
  uptime_report: 'Summarise uptime and response times over a period, worst performers first.',
  incident_review: 'Dig into the recent failures of one monitor and characterise the pattern.',
  expiry_audit: 'List SSL certificates and domains by how soon they expire.',
  setup_monitor: 'Pick the right monitor type for a target and create it.',
};

// {{placeholders}} are filled from the arguments the client passed. An optional argument
// left out falls back to the default named in its own description; anything still
// unreplaced is blanked, because a literal brace would read as text to the model.
const fill = (lines, values = {}) => {
  let text = lines.join('\n');
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && String(value) !== '') {
      text = text.split(`{{${key}}}`).join(String(value));
    }
  }
  return text.replace(/\{\{[a-z_]+\}\}/g, '');
};

const expand = (name, lines, values) => ({
  description: PROMPT_DESCRIPTIONS[name],
  messages: [{ role: 'user', content: { type: 'text', text: fill(lines, values) } }],
});

server.registerPrompt(
  'status_check',
  {
    title: 'What is down right now',
    description: PROMPT_DESCRIPTIONS.status_check,
  },
  () => expand('status_check', [
    'Check the current state of my UptyBots monitors.',
    '',
    'Call list_monitors with status "down" to see what is failing, then',
    'list_monitors with no filter so you know how many monitors exist in',
    'total. For each failing monitor, call get_incidents to find when the',
    'failure started and what the error was.',
    '',
    'Answer with the failures first: monitor name, what broke, and since',
    'when. If nothing is down, say so in one line and give the total number',
    'of monitors being watched.',
  ])
);

server.registerPrompt(
  'uptime_report',
  {
    title: 'Uptime report',
    description: PROMPT_DESCRIPTIONS.uptime_report,
    argsSchema: {
      days: z.string().optional().describe('How many days back to report on. Defaults to 7.'),
    },
  },
  ({ days }) => expand('uptime_report', [
    'Build an uptime report for my UptyBots monitors covering the last',
    '{{days}} days.',
    '',
    'Call list_monitors to get the monitors, then get_stats_daily for each',
    'one over that period. Where a monitor looks unstable, call',
    'get_stats_hourly on it to see whether the failures cluster at a',
    'particular time of day.',
    '',
    'Lead with the worst uptime percentage, not with a list in alphabetical',
    'order. Include average and p95 response time where it explains the',
    'number. Say plainly if a monitor has too little history to judge.',
  ], { days: days ?? '7' })
);

server.registerPrompt(
  'incident_review',
  {
    title: 'Investigate an incident',
    description: PROMPT_DESCRIPTIONS.incident_review,
    argsSchema: {
      monitor: z.string().describe('Name or id of the monitor to investigate.'),
    },
  },
  ({ monitor }) => expand('incident_review', [
    'Investigate the recent failures of the UptyBots monitor "{{monitor}}".',
    '',
    'Find it with list_monitors, then get_monitor for its configuration and',
    'get_incidents for its failure history. Use get_stats_hourly around the',
    'incidents to see how long each one lasted and whether response times',
    'degraded before the monitor went down.',
    '',
    'Tell me what the pattern is: a single outage, a flapping check, or a',
    'slow degradation. Quote the error codes rather than paraphrasing them.',
    'If the incidents line up with the check frequency or the timeout in the',
    "monitor's own configuration, say so - that points at the check rather",
    'than at the service.',
  ], { monitor })
);

server.registerPrompt(
  'expiry_audit',
  {
    title: 'Certificate and domain expiry',
    description: PROMPT_DESCRIPTIONS.expiry_audit,
  },
  () => expand('expiry_audit', [
    'Audit what is about to expire in my UptyBots account.',
    '',
    'Call list_monitors twice, once with type "SSL" and once with type',
    '"DOMAIN", then get_monitor on each result to read the expiry date it',
    'reports.',
    '',
    'Sort by days remaining, soonest first, and mark anything under 30 days.',
    'Note separately any monitor of those two types that is paused or has',
    'never completed a check, because it is reporting nothing at all rather',
    'than reporting that it is fine.',
  ])
);

server.registerPrompt(
  'setup_monitor',
  {
    title: 'Set up a new monitor',
    description: PROMPT_DESCRIPTIONS.setup_monitor,
    argsSchema: {
      target: z.string().describe('What to watch: a URL, hostname, or host:port.'),
    },
  },
  ({ target }) => expand('setup_monitor', [
    'Set up UptyBots monitoring for {{target}}.',
    '',
    'Work out which type fits before creating anything. A web page or an',
    'endpoint that must return a particular status is create_http_monitor;',
    'a JSON API whose response body matters is create_api_monitor; a host',
    'that only needs to answer at all is create_ping_monitor; a game or',
    'database server on a specific port is create_port_monitor; a',
    'certificate is create_ssl_monitor and a domain registration is',
    'create_domain_monitor.',
    '',
    'Check list_monitors first so you do not create a duplicate. Tell me',
    'which type you chose and why before you call the create tool, and',
    'leave the check frequency at the default unless I asked for something',
    'specific.',
  ], { target })
);

// ─── START ────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

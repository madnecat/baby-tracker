import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer, OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server';
import { requireBearerAuth } from '@modelcontextprotocol/express';
import * as z from 'zod/v4';
import { hashToken } from './apiTokens.js';
import { findHouseholdByTokenHash, getHouseholdDb } from './households.js';
import { createEvent, deleteEvent, listEvents, updateEvent } from './eventsService.js';
import {
  createGrowthMeasurement,
  deleteGrowthMeasurement,
  listGrowthMeasurements,
  updateGrowthMeasurement,
} from './growthService.js';
import { getChild, setChild } from './childService.js';
import { getMilestoneCompletions, setMilestoneCompletion } from './milestonesService.js';

const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60;

const tokenVerifier = {
  async verifyAccessToken(token) {
    const found = findHouseholdByTokenHash(hashToken(token));
    if (!found) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'Unknown or revoked token');
    }
    found.db.prepare(`UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?`).run(
      found.result.tokenId
    );
    return {
      token,
      clientId: 'baby-tracker-assistant',
      scopes: ['mcp'],
      expiresAt: Math.floor(Date.now() / 1000) + TEN_YEARS_SECONDS,
      extra: { userId: found.result.id, displayName: found.result.displayName, householdSlug: found.slug },
    };
  },
};

function nowIso() {
  return new Date().toISOString();
}

function textResult(text) {
  return { content: [{ type: 'text', text }] };
}

function buildServer(ctx) {
  const server = new McpServer({ name: 'baby-tracker', version: '1.0.0' });
  const userId = ctx.authInfo?.extra?.userId;
  const displayName = ctx.authInfo?.extra?.displayName ?? 'unknown';
  // Every tool below is scoped to exactly this one household's database —
  // resolved once from the bearer token, never from anything the caller sends.
  const db = getHouseholdDb(ctx.authInfo?.extra?.householdSlug);

  server.registerTool(
    'get_current_time',
    {
      description:
        "Returns the current date/time (ISO 8601, UTC) and who is authenticated. Call this first when the user gives a relative time ('20 minutes ago', 'this afternoon') so you can compute an accurate timestamp.",
      inputSchema: z.object({}),
    },
    async () => textResult(JSON.stringify({ nowUtc: nowIso(), timezone: 'Europe/London', authenticatedAs: displayName }))
  );

  server.registerTool(
    'log_diaper',
    {
      description:
        'Log a nappy/diaper change. wet and dirty are both required — if the user has not said which, ASK before calling this tool. Do not guess or assume false for either.',
      inputSchema: z.object({
        wet: z.boolean(),
        dirty: z.boolean(),
        consistency: z.enum(['watery', 'soft', 'normal', 'hard']).optional(),
        at: z.string().datetime().optional().describe('ISO 8601 timestamp; defaults to now'),
      }),
    },
    async ({ wet, dirty, consistency, at }) => {
      const when = at || nowIso();
      const event = createEvent(db, {
        type: 'diaper',
        startedAt: when,
        endedAt: when,
        details: { wet, dirty, consistency: dirty ? consistency ?? null : null },
        createdBy: userId,
      });
      return textResult(`Logged diaper change (id ${event.id}) at ${when}.`);
    }
  );

  server.registerTool(
    'log_bottle',
    {
      description:
        'Log a bottle feed. volumeMl and contents are both required — if the user has not said what was in the bottle, ASK before calling this tool. Do not default to formula.',
      inputSchema: z.object({
        volumeMl: z.number().positive(),
        contents: z.enum(['formula', 'breast_milk', 'mixed']),
        at: z.string().datetime().optional().describe('ISO 8601 timestamp; defaults to now'),
      }),
    },
    async ({ volumeMl, contents, at }) => {
      const when = at || nowIso();
      const event = createEvent(db, {
        type: 'bottle',
        startedAt: when,
        endedAt: when,
        details: { volumeMl, contents },
        createdBy: userId,
      });
      return textResult(`Logged ${volumeMl}mL bottle (${contents}, id ${event.id}) at ${when}.`);
    }
  );

  server.registerTool(
    'log_breastfeeding',
    {
      description:
        'Log a completed breastfeeding session (use for retroactive/past feeds). side is required — if the user has not said which side, ASK before calling this tool. Do not guess.',
      inputSchema: z.object({
        side: z.enum(['left', 'right', 'both']),
        startedAt: z.string().datetime().describe('ISO 8601 timestamp the feed started'),
        endedAt: z.string().datetime().describe('ISO 8601 timestamp the feed ended'),
      }),
    },
    async ({ side, startedAt, endedAt }) => {
      const event = createEvent(db, {
        type: 'breastfeeding',
        startedAt,
        endedAt,
        details: { side },
        createdBy: userId,
      });
      return textResult(`Logged breastfeeding (${side}, id ${event.id}) from ${startedAt} to ${endedAt}.`);
    }
  );

  server.registerTool(
    'log_sleep',
    {
      description: 'Log a completed sleep session for the baby (use for retroactive/past sleeps).',
      inputSchema: z.object({
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime(),
      }),
    },
    async ({ startedAt, endedAt }) => {
      const event = createEvent(db, { type: 'sleep', startedAt, endedAt, details: {}, createdBy: userId });
      return textResult(`Logged sleep (id ${event.id}) from ${startedAt} to ${endedAt}.`);
    }
  );

  server.registerTool(
    'log_contraction',
    {
      description: 'Log a contraction.',
      inputSchema: z.object({
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime().optional(),
        intensity: z.enum(['mild', 'moderate', 'strong']).optional(),
      }),
    },
    async ({ startedAt, endedAt, intensity }) => {
      const event = createEvent(db, {
        type: 'contraction',
        startedAt,
        endedAt: endedAt || null,
        details: { intensity: intensity ?? null },
        createdBy: userId,
      });
      return textResult(`Logged contraction (id ${event.id}) at ${startedAt}.`);
    }
  );

  server.registerTool(
    'log_outing',
    {
      description: 'Log an outing with the baby.',
      inputSchema: z.object({
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime().optional(),
        location: z.string().optional(),
      }),
    },
    async ({ startedAt, endedAt, location }) => {
      const event = createEvent(db, {
        type: 'outing',
        startedAt,
        endedAt: endedAt || null,
        details: { location: location ?? null, notes: null },
        createdBy: userId,
      });
      return textResult(`Logged outing (id ${event.id}) starting ${startedAt}.`);
    }
  );

  server.registerTool(
    'log_temperature',
    {
      description:
        'Log a temperature reading for the baby or the mum. who is required — if the user has not said which, ASK before calling this tool. Do not guess.',
      inputSchema: z.object({
        who: z.enum(['baby', 'mom']),
        valueC: z.number(),
        at: z.string().datetime().optional(),
        notes: z.string().optional(),
      }),
    },
    async ({ who, valueC, at, notes }) => {
      const when = at || nowIso();
      const event = createEvent(db, {
        type: 'temperature',
        startedAt: when,
        endedAt: when,
        details: { who, valueC, notes: notes ?? null },
        createdBy: userId,
      });
      return textResult(`Logged temperature (${who}, ${valueC}°C, id ${event.id}) at ${when}.`);
    }
  );

  server.registerTool(
    'log_medication',
    {
      description:
        'Log a medication dose taken by mum. name is required — ask if unclear. For intervalHours, use the correct standard spacing if you know the medication (e.g. paracetamol 4h, ibuprofen 6h) rather than the generic 6h default — and if you are not confident of the correct interval, ask the user instead of guessing, since this drives the "safe to take again" timing shown in the app.',
      inputSchema: z.object({
        name: z.string(),
        doseAmount: z.number().optional(),
        doseUnit: z.string().optional(),
        intervalHours: z.number().positive().default(6).describe('Minimum hours before the next dose — see tool description'),
        at: z.string().datetime().optional(),
      }),
    },
    async ({ name, doseAmount, doseUnit, intervalHours, at }) => {
      const when = at || nowIso();
      const event = createEvent(db, {
        type: 'medication',
        startedAt: when,
        endedAt: when,
        details: { name, doseAmount: doseAmount ?? null, doseUnit: doseUnit ?? null, intervalHours },
        createdBy: userId,
      });
      return textResult(`Logged ${name} dose (id ${event.id}) at ${when}. Next safe dose from ${new Date(new Date(when).getTime() + intervalHours * 3600000).toISOString()}.`);
    }
  );

  server.registerTool(
    'list_recent_events',
    {
      description:
        'List recent logged events, optionally filtered by type, to check context before logging (e.g. "when did she last feed?").',
      inputSchema: z.object({
        type: z
          .enum(['diaper', 'bottle', 'breastfeeding', 'contraction', 'outing', 'temperature', 'medication', 'sleep'])
          .optional(),
        limit: z.number().int().positive().max(50).default(10),
      }),
    },
    async ({ type, limit }) => {
      const events = listEvents(db, { type }).slice(0, limit);
      return textResult(JSON.stringify(events, null, 2));
    }
  );

  server.registerTool(
    'update_event',
    {
      description:
        'Correct a previously logged event of any type (e.g. fix a wrong time, or change a detail like volume or side). Use list_recent_events first to find the id.',
      inputSchema: z.object({
        id: z.number().int(),
        startedAt: z.string().datetime().optional(),
        endedAt: z.string().datetime().nullable().optional(),
        details: z.record(z.string(), z.unknown()).optional().describe('Full replacement details object for this event type'),
      }),
    },
    async ({ id, startedAt, endedAt, details }) => {
      const event = updateEvent(db, id, { startedAt, endedAt, details });
      return textResult(`Updated event ${event.id}.`);
    }
  );

  server.registerTool(
    'delete_event',
    {
      description: 'Delete a previously logged event by id (e.g. a duplicate or mistaken entry).',
      inputSchema: z.object({ id: z.number().int() }),
    },
    async ({ id }) => {
      deleteEvent(db, id);
      return textResult(`Deleted event ${id}.`);
    }
  );

  server.registerTool(
    'log_growth_measurement',
    {
      description: "Log the baby's weight/height/head circumference from a check-up (not a daily event — periodic).",
      inputSchema: z.object({
        measuredAt: z.string().describe('Date (YYYY-MM-DD) the measurement was taken'),
        weightKg: z.number().optional(),
        heightCm: z.number().optional(),
        headCircumferenceCm: z.number().optional(),
        notes: z.string().optional(),
      }),
    },
    async (args) => {
      const entry = createGrowthMeasurement(db, { ...args, createdBy: userId });
      return textResult(`Logged growth measurement (id ${entry.id}) for ${entry.measuredAt}.`);
    }
  );

  server.registerTool(
    'list_growth_measurements',
    {
      description: "List all of the baby's logged growth measurements, oldest first.",
      inputSchema: z.object({}),
    },
    async () => textResult(JSON.stringify(listGrowthMeasurements(db), null, 2))
  );

  server.registerTool(
    'update_growth_measurement',
    {
      description: 'Correct a previously logged growth measurement.',
      inputSchema: z.object({
        id: z.number().int(),
        measuredAt: z.string().optional(),
        weightKg: z.number().optional(),
        heightCm: z.number().optional(),
        headCircumferenceCm: z.number().optional(),
        notes: z.string().optional(),
      }),
    },
    async ({ id, ...rest }) => {
      const entry = updateGrowthMeasurement(db, id, rest);
      return textResult(`Updated growth measurement ${entry.id}.`);
    }
  );

  server.registerTool(
    'delete_growth_measurement',
    {
      description: 'Delete a previously logged growth measurement by id.',
      inputSchema: z.object({ id: z.number().int() }),
    },
    async ({ id }) => {
      deleteGrowthMeasurement(db, id);
      return textResult(`Deleted growth measurement ${id}.`);
    }
  );

  server.registerTool(
    'get_child_profile',
    {
      description: "Get the baby's name, date of birth, and sex (needed for WHO growth percentile charts).",
      inputSchema: z.object({}),
    },
    async () => textResult(JSON.stringify(getChild(db)))
  );

  server.registerTool(
    'set_child_profile',
    {
      description: "Set or update the baby's name, date of birth, and sex.",
      inputSchema: z.object({
        name: z.string(),
        dateOfBirth: z.string().describe('YYYY-MM-DD'),
        sex: z.enum(['male', 'female']),
      }),
    },
    async (args) => {
      const child = setChild(db, args);
      return textResult(`Child profile set: ${JSON.stringify(child)}`);
    }
  );

  server.registerTool(
    'list_milestone_completions',
    {
      description:
        "List which of the app's Calendar milestones (identified by their key, e.g. 'register-birth', 'vaccines-8w') have been marked done, and when.",
      inputSchema: z.object({}),
    },
    async () => textResult(JSON.stringify(getMilestoneCompletions(db)))
  );

  server.registerTool(
    'set_milestone_completion',
    {
      description:
        "Mark a Calendar milestone as done or not done, by its key (see list_milestone_completions or ask the user to check the Calendar tab for exact keys).",
      inputSchema: z.object({
        key: z.string(),
        completed: z.boolean(),
      }),
    },
    async ({ key, completed }) => {
      setMilestoneCompletion(db, key, completed);
      return textResult(`Marked milestone '${key}' as ${completed ? 'done' : 'not done'}.`);
    }
  );

  return server;
}

const handler = createMcpHandler(buildServer);
const auth = requireBearerAuth({ verifier: tokenVerifier, requiredScopes: ['mcp'] });
const node = toNodeHandler(handler);

export function mountMcp(app) {
  app.all('/mcp', auth, (req, res) => void node(req, res, req.body));
}

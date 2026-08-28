import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapAdditionalHouseholds, bootstrapFirstHousehold } from './bootstrap.js';
import {
  migrateLegacySingleHouseholdDb,
  purgeExpiredSessionsEverywhere,
  runMigrationsForAllHouseholds,
} from './households.js';
import { runMigrations } from './migrations.js';
import { authRouter } from './routes/auth.js';
import { eventsRouter } from './routes/events.js';
import { growthRouter } from './routes/growth.js';
import { childRouter } from './routes/child.js';
import { milestonesRouter } from './routes/milestones.js';
import { apiTokensRouter } from './routes/apiTokens.js';
import { mountMcp } from './mcp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8099;

migrateLegacySingleHouseholdDb();
bootstrapFirstHousehold();
bootstrapAdditionalHouseholds();
runMigrationsForAllHouseholds(runMigrations);
purgeExpiredSessionsEverywhere();
setInterval(purgeExpiredSessionsEverywhere, 24 * 60 * 60 * 1000).unref();

const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);
app.use('/api/growth', growthRouter);
app.use('/api/child', childRouter);
app.use('/api/milestones', milestonesRouter);
app.use('/api/tokens', apiTokensRouter);
mountMcp(app);

const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
app.use(express.static(webDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(webDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Baby Tracker listening on port ${PORT}`);
});

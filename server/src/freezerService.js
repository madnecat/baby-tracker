import {
  DEFAULT_SHELF_LIFE_MONTHS,
  addMonths,
  daysBetween,
  isValidDate,
  todayInHousehold,
} from './freezerDates.js';
import { MAX_TARGET_ML, planThaw } from './freezerPlanner.js';

export const MAX_BAG_ML = 500;
export const MAX_THAW_BAGS = 50;
export const MAX_NOTES_LENGTH = 200;
/** A thaw can be undone for this long (it is for a mistaken tap, not for refreezing milk). */
export const UNDO_WINDOW_MS = 60 * 60 * 1000;
const CLOSED_HISTORY_LIMIT = 30;

/** Error with a stable `code` (the web app translates by code) and the HTTP status to send. */
export class FreezerError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function serialize(row, today) {
  return {
    id: row.id,
    reference: row.reference,
    quantityMl: row.quantity_ml,
    frozenOn: row.frozen_on,
    expiresOn: row.expires_on,
    status: row.status,
    usedAt: row.used_at,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    // Whole days left in the freezer (negative once past), for frozen bags only.
    daysLeft: row.status === 'frozen' ? daysBetween(today, row.expires_on) : null,
  };
}

function getRow(db, id) {
  const row = db.prepare(`SELECT * FROM freezer_bags WHERE id = ?`).get(id);
  if (!row) throw new FreezerError('Freezer bag not found', 'FREEZER_BAG_NOT_FOUND', 404);
  return row;
}

function parseId(value) {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(id) || id <= 0) throw new FreezerError('Freezer bag not found', 'FREEZER_BAG_NOT_FOUND', 404);
  return id;
}

function checkQuantity(value) {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_BAG_ML) {
    throw new FreezerError(
      `quantityMl must be a whole number between 1 and ${MAX_BAG_ML}`,
      'FREEZER_QUANTITY_INVALID'
    );
  }
  return value;
}

function checkDate(value, name) {
  if (!isValidDate(value)) throw new FreezerError(`${name} must be a date (YYYY-MM-DD)`, 'FREEZER_DATE_INVALID');
  return value;
}

function checkReference(value) {
  if (!Number.isInteger(value) || value <= 0 || value > 1000000) {
    throw new FreezerError('reference must be a positive whole number', 'FREEZER_REFERENCE_INVALID');
  }
  return value;
}

// A typo like 5000 would push every later number up for good, so a typed number may only be a
// little above the current highest one; and a number is never given twice, even once its bag is used.
const MAX_REFERENCE_JUMP = 10;
function checkReferenceFree(db, reference, selfId = null) {
  const highest = nextReference(db) - 1;
  if (reference > highest + MAX_REFERENCE_JUMP) {
    throw new FreezerError(
      `reference cannot be more than ${MAX_REFERENCE_JUMP} above the highest number in use (${highest})`,
      'FREEZER_REFERENCE_INVALID'
    );
  }
  const clash = db.prepare(`SELECT id FROM freezer_bags WHERE reference = ? AND id IS NOT ?`).get(reference, selfId);
  if (clash) throw new FreezerError('This bag number has already been used', 'FREEZER_REFERENCE_TAKEN', 409);
  return reference;
}

function checkNotExpired(expiresOn, today) {
  if (expiresOn < today) {
    throw new FreezerError('expiresOn is already in the past', 'FREEZER_EXPIRY_PAST');
  }
}

function checkNotes(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > MAX_NOTES_LENGTH) {
    throw new FreezerError(`notes must be text of at most ${MAX_NOTES_LENGTH} characters`, 'FREEZER_NOTES_INVALID');
  }
  return value.trim() || null;
}

function isUniqueViolation(e) {
  return typeof e?.code === 'string' && e.code.startsWith('SQLITE_CONSTRAINT');
}

/** Bags past their date can no longer be used: they leave the freezer list on their own. */
export function expireOverdue(db, today = todayInHousehold()) {
  return db
    .prepare(`UPDATE freezer_bags SET status = 'expired' WHERE status = 'frozen' AND expires_on < ?`)
    .run(today).changes;
}

/** The number the next bag will get: one more than any bag ever logged (numbers are never reused). */
export function nextReference(db) {
  return (db.prepare(`SELECT MAX(reference) AS ref FROM freezer_bags`).get().ref ?? 0) + 1;
}

/**
 * Everything the freezer screen needs: the bags in the freezer (soonest to expire first), the most
 * recent used/expired ones, and the number the next bag will get.
 */
export function getFreezer(db, now = new Date()) {
  const today = todayInHousehold(now);
  expireOverdue(db, today);
  const frozen = db
    .prepare(`SELECT * FROM freezer_bags WHERE status = 'frozen' ORDER BY expires_on ASC, id ASC`)
    .all();
  const closed = db
    .prepare(
      `SELECT * FROM freezer_bags WHERE status <> 'frozen' ORDER BY COALESCE(used_at, created_at) DESC, id DESC LIMIT ?`
    )
    .all(CLOSED_HISTORY_LIMIT);
  return {
    today,
    nextReference: nextReference(db),
    bags: frozen.map((r) => serialize(r, today)),
    closed: closed.map((r) => serialize(r, today)),
  };
}

export function createBag(
  db,
  { quantityMl, frozenOn, expiresOn, reference, notes, createdBy },
  now = new Date()
) {
  const today = todayInHousehold(now);
  checkQuantity(quantityMl);
  const frozen = frozenOn == null ? today : checkDate(frozenOn, 'frozenOn');
  const expires = expiresOn == null ? addMonths(frozen, DEFAULT_SHELF_LIFE_MONTHS) : checkDate(expiresOn, 'expiresOn');
  if (expires < frozen) {
    throw new FreezerError('expiresOn cannot be before frozenOn', 'FREEZER_DATE_INVALID');
  }
  checkNotExpired(expires, today);
  const ref = reference == null ? nextReference(db) : checkReferenceFree(db, checkReference(reference));
  const noteText = checkNotes(notes);
  try {
    const result = db
      .prepare(
        `INSERT INTO freezer_bags (reference, quantity_ml, frozen_on, expires_on, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(ref, quantityMl, frozen, expires, noteText, createdBy ?? null);
    return serialize(getRow(db, result.lastInsertRowid), today);
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new FreezerError('Another bag in the freezer already has this number', 'FREEZER_REFERENCE_TAKEN', 409);
    }
    throw e;
  }
}

/** Edits a bag that is still in the freezer (anything already used or expired is history). */
export function updateBag(db, rawId, patch = {}, now = new Date()) {
  const today = todayInHousehold(now);
  const id = parseId(rawId);
  const existing = getRow(db, id);
  if (existing.status !== 'frozen') {
    throw new FreezerError('Only bags in the freezer can be edited', 'FREEZER_BAG_NOT_FROZEN', 409);
  }
  const quantityMl = patch.quantityMl === undefined ? existing.quantity_ml : checkQuantity(patch.quantityMl);
  const frozenOn = patch.frozenOn === undefined ? existing.frozen_on : checkDate(patch.frozenOn, 'frozenOn');
  // Moving the freezing date moves the expiry with it, unless an expiry is given explicitly.
  const expiresOn =
    patch.expiresOn !== undefined
      ? checkDate(patch.expiresOn, 'expiresOn')
      : patch.frozenOn !== undefined
        ? addMonths(frozenOn, DEFAULT_SHELF_LIFE_MONTHS)
        : existing.expires_on;
  if (expiresOn < frozenOn) throw new FreezerError('expiresOn cannot be before frozenOn', 'FREEZER_DATE_INVALID');
  if (expiresOn !== existing.expires_on) checkNotExpired(expiresOn, today);
  const reference =
    patch.reference === undefined || patch.reference === existing.reference
      ? existing.reference
      : checkReferenceFree(db, checkReference(patch.reference), id);
  const notes = patch.notes === undefined ? existing.notes : checkNotes(patch.notes);
  try {
    db.prepare(
      `UPDATE freezer_bags SET quantity_ml = ?, frozen_on = ?, expires_on = ?, reference = ?, notes = ? WHERE id = ?`
    ).run(quantityMl, frozenOn, expiresOn, reference, notes, id);
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new FreezerError('Another bag in the freezer already has this number', 'FREEZER_REFERENCE_TAKEN', 409);
    }
    throw e;
  }
  return serialize(getRow(db, id), today);
}

/** Throws a bag away (or records that it spoiled): it leaves the freezer as "expired". */
export function discardBag(db, rawId, now = new Date()) {
  const id = parseId(rawId);
  getRow(db, id);
  const changed = db
    .prepare(`UPDATE freezer_bags SET status = 'expired' WHERE id = ? AND status = 'frozen'`)
    .run(id).changes;
  if (changed !== 1) throw new FreezerError('Only bags in the freezer can be thrown away', 'FREEZER_BAG_NOT_FROZEN', 409);
  return serialize(getRow(db, id), todayInHousehold(now));
}

/** Read-only: which bags to thaw for `targetMl`. */
export function planFor(db, targetMl, now = new Date()) {
  const today = todayInHousehold(now);
  expireOverdue(db, today);
  if (!Number.isInteger(targetMl) || targetMl <= 0 || targetMl > MAX_TARGET_ML) {
    throw new FreezerError(
      `targetMl must be a whole number between 1 and ${MAX_TARGET_ML}`,
      'FREEZER_TARGET_INVALID'
    );
  }
  const rows = db
    .prepare(`SELECT id, reference, quantity_ml, expires_on FROM freezer_bags WHERE status = 'frozen'`)
    .all()
    .map((r) => ({ id: r.id, reference: r.reference, quantityMl: r.quantity_ml, expiresOn: r.expires_on }));
  return planThaw(rows, targetMl, today);
}

/**
 * Marks bags as thawed ("used"). All or nothing: if any bag is no longer in the freezer (a second
 * parent thawed it a moment ago, or it expired), nothing changes and the caller gets a conflict, so
 * a suggestion that has become stale is never half-applied.
 */
export function thawBags(db, rawIds, now = new Date()) {
  if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > MAX_THAW_BAGS) {
    throw new FreezerError(`bagIds must list between 1 and ${MAX_THAW_BAGS} bags`, 'FREEZER_BAG_IDS_INVALID');
  }
  const ids = rawIds.map((v) => (Number.isInteger(v) && v > 0 ? v : NaN));
  if (ids.some(Number.isNaN) || new Set(ids).size !== ids.length) {
    throw new FreezerError('bagIds must be distinct positive whole numbers', 'FREEZER_BAG_IDS_INVALID');
  }
  const today = todayInHousehold(now);
  const usedAt = now.toISOString();
  const run = db.transaction(() => {
    const placeholders = ids.map(() => '?').join(',');
    const changed = db
      .prepare(
        `UPDATE freezer_bags SET status = 'used', used_at = ?
         WHERE id IN (${placeholders}) AND status = 'frozen' AND expires_on >= ?`
      )
      .run(usedAt, ...ids, today).changes;
    if (changed !== ids.length) {
      throw new FreezerError('Some of these bags are no longer in the freezer', 'FREEZER_BAG_CONFLICT', 409);
    }
    return db
      .prepare(`SELECT * FROM freezer_bags WHERE id IN (${placeholders}) ORDER BY reference ASC`)
      .all(...ids);
  });
  return run().map((r) => serialize(r, today));
}

/** Puts a just-thawed bag back as "in the freezer" — only within UNDO_WINDOW_MS of the thaw. */
export function undoThaw(db, rawId, now = new Date()) {
  return undoThawMany(db, [parseId(rawId)], now)[0];
}

/**
 * Undoes the thaw of several bags at once, all or nothing (so a failure half-way never leaves some
 * bags back in the freezer and others not). A bag whose last day has passed can't come back.
 */
export function undoThawMany(db, rawIds, now = new Date()) {
  if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > MAX_THAW_BAGS) {
    throw new FreezerError(`bagIds must list between 1 and ${MAX_THAW_BAGS} bags`, 'FREEZER_BAG_IDS_INVALID');
  }
  const ids = rawIds.map((v) => (Number.isInteger(v) && v > 0 ? v : NaN));
  if (ids.some(Number.isNaN) || new Set(ids).size !== ids.length) {
    throw new FreezerError('bagIds must be distinct positive whole numbers', 'FREEZER_BAG_IDS_INVALID');
  }
  const today = todayInHousehold(now);
  const run = db.transaction(() => {
    for (const id of ids) {
      const row = getRow(db, id);
      const usedMs = row.used_at ? Date.parse(row.used_at) : NaN;
      if (row.status !== 'used' || Number.isNaN(usedMs)) {
        throw new FreezerError('This bag has not been thawed', 'FREEZER_BAG_NOT_USED', 409);
      }
      if (now.getTime() - usedMs > UNDO_WINDOW_MS || row.expires_on < today) {
        throw new FreezerError('It is too late to undo this thaw', 'FREEZER_UNDO_EXPIRED', 409);
      }
      try {
        db.prepare(`UPDATE freezer_bags SET status = 'frozen', used_at = NULL WHERE id = ? AND status = 'used'`).run(id);
      } catch (e) {
        if (isUniqueViolation(e)) {
          throw new FreezerError('Another bag in the freezer now has this number', 'FREEZER_REFERENCE_TAKEN', 409);
        }
        throw e;
      }
    }
    return ids.map((id) => getRow(db, id));
  });
  return run().map((r) => serialize(r, today));
}

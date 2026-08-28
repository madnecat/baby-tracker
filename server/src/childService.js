import { db } from './db.js';

function serialize(row) {
  if (!row) return null;
  return { name: row.name, dateOfBirth: row.date_of_birth, sex: row.sex };
}

export function getChild() {
  return serialize(db.prepare(`SELECT * FROM child WHERE id = 1`).get());
}

export function setChild({ name, dateOfBirth, sex }) {
  if (!name || !dateOfBirth || !['male', 'female'].includes(sex)) {
    throw new Error('name, dateOfBirth and sex (male|female) are required');
  }
  db.prepare(
    `INSERT INTO child (id, name, date_of_birth, sex) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name,
       date_of_birth = excluded.date_of_birth, sex = excluded.sex`
  ).run(name, dateOfBirth, sex);
  return getChild();
}

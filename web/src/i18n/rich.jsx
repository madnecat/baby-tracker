import { Fragment } from 'react';
import { PLACEHOLDER_PATTERN } from './core.js';
import { t } from './index.js';

/**
 * Like t(), but the values may be React nodes — for a message with markup inside it, e.g.
 *   'settings.signedInAs': 'Signed in as {name}'  ->  tRich('settings.signedInAs', { name: <strong>{n}</strong> })
 * The message stays one translatable sentence (word order is the translator's), and nothing is
 * ever injected as HTML.
 */
export function tRich(key, values) {
  const message = t(key);
  const parts = [];
  let last = 0;
  let index = 0;
  for (const match of message.matchAll(PLACEHOLDER_PATTERN)) {
    if (match.index > last) parts.push(message.slice(last, match.index));
    const value = values?.[match[1]];
    parts.push(value === undefined ? match[0] : <Fragment key={`${match[1]}-${index++}`}>{value}</Fragment>);
    last = match.index + match[0].length;
  }
  if (last < message.length) parts.push(message.slice(last));
  return parts;
}

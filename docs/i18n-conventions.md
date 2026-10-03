# i18n conventions (English + French)

Everything a person reads goes through `t()`. Read this before touching any text.

## The API

```js
import { t, tOr, formatNumber, dateFnsLocale, intlLocale, getLocale } from '../i18n/index.js';
import { tRich } from '../i18n/rich.jsx';        // message with React nodes inside it
```

* `t('area.key', { name, count })` — `{placeholders}`; with `count` (a number) the plural form is
  chosen: define `area.key_one` and `area.key_other` (French treats 0 and 1 as *one*).
* `tOr('side', value)` — label for a **stored value** (`side.left`…); falls back to the raw value.
* `tRich('settings.signedInAs', { name: <strong>{n}</strong> })` — one sentence, markup inside.
* The language lives in a module slot; `I18nProvider` re-mounts the whole app when it changes, so
  components do **not** need a hook — just call `t()` while rendering.
* **Never call `t()` at module load time** (top level of a file). It would freeze in the first
  language. A constant that holds labels holds **keys** (`labelKey: 'feed.tag.efficient'`) and is
  resolved at render: `t(item.labelKey)`.
* `useMemo` that bakes text into data is fine (the app re-mounts on a language change), but
  prefer returning numbers/ids from the memo and formatting at render.

## Catalogs

* One file per area: `web/src/i18n/en/<area>.js` and `web/src/i18n/fr/<area>.js`, each
  `export default { 'area.key': 'text', … }` (flat, full keys). Files are merged automatically.
* **Own your files**: only edit the catalog files of your area. Shared words live in
  `common.js` (`common.save`, `common.saving`, `common.cancel`, `common.delete`, `common.edit`,
  `common.close`, `common.back`, `common.skip`, `common.ok`, `common.loading`, `common.sending`,
  `side.left|right|both`) — reuse them, do not redefine. Needing another shared word? Define it
  in your own area under your own prefix; we de-duplicate at the end.
* A key may exist in only one file per language. `npm test` (in `web/`) enforces: same files and
  same keys in `en` and `fr`, same `{placeholders}`, complete plural pairs, no empty values,
  no plain space before `: ; ! ?` in French, and every literal `t('…')` in the source exists.
* Key names: `<area>.<what>`; lower camelCase after the dot; for stored values
  `<area>.<set>.<value>` (e.g. `feed.tag.efficient`).

## Rules

1. **Stored values are identifiers — never translate or change them**: event types, `left/right/both`,
   `baby/mom`, tags, `consistency`, `contents`, `intensity`, medication **preset names** in
   `details.name` (`Paracetamol`…), percentile ids (`3rd`…), milestone keys, category keys.
   Translate only what is *displayed*, through a label map keyed by the stored value.
   User-typed text (custom medication names, outing locations, notes) is shown as typed.
2. **No concatenation, no word-order tricks.** One whole sentence per key with placeholders:
   `'feed.lastFeed': 'Last feed: {sides} · {ago} ago'`. No `toUpperCase()/toLowerCase()/slice` to
   build display text; no `+` and no template literals around translated fragments.
3. **Plurals** via `key_one`/`key_other` + `count`. Never `${n} thing${n === 1 ? '' : 's'}`.
4. **French grammar**: avoid gendered/elided constructions around `{name}` (“de {name}” fails
   before a vowel) — put names at the start or after a colon. Do not assume the child's sex or the
   reader's: use neutral wording instead of “she/her”.
5. **French typography**: put a no-break space (U+00A0) before `:` and `;` `!` `?`, inside « », and
   between a number and its unit (`37,5 °C`, `120 mL`, `5 min`). Use real `’` or `'` consistently
   (ASCII `'` is fine). The test rejects a plain space before `: ; ! ?`.
6. **Dates/times/numbers**: English = British (24 h), French = French. Use
   `format(date, pattern, { locale: dateFnsLocale() })` or `Intl` with `intlLocale()`; never
   `toLocaleTimeString([])` (that follows the browser) and never a locale-less `format()`.
   `'yyyy-MM-dd'` day keys are identifiers — leave them alone. Decimals shown to people go through
   `formatNumber` (French shows `2,5`). Durations/“ago” use the shared helpers in `lib/dateUtils.js`.
7. **Numbers typed by people**: keep the **raw string** in component state and call
   `parseDecimal()` (`lib/parseDecimal.js`) only on submit (accepts `2,5` and `2.5`). Use
   `<input type="text" inputMode="decimal">`, enforce min/max/required in JS, show a translated
   “invalid number” message, and send real numbers (points) to the server. Prefill edit fields
   with `String(value)`.
8. **Server errors**: the server returns `{ error: '<English>', code: 'SOME_CODE' }`; the client shows
   `tOr('errors', code)` and falls back to the English message. Keep `error` English (MCP/API clients).
9. **Dev-only / not translated**: `sleepScenarios.js`, `sleepFixtures.js`, MCP tool texts, ops logs.
   The brand “Baby Tracker” stays as is.
10. **Tests that assert English text**: `import '../i18n/testSetup.js'` first (it loads the catalogs
    under node); use `withLocale('fr', () => …)` to check French. Update assertions rather than
    deleting them.

## French glossary (keep consistent; flagged ones are for the owner's review)

Baby = Bébé · Mum = Maman · Diaper = Couche · Wet/Dirty = Pipi/Selles · Feeding (generic) = Repas ·
Breastfeeding = Allaitement (a single feed: tétée) · Bottle = Biberon · Sleep = Sommeil ·
Outing = Sortie · Medication = Médicament · Temperature = Température · Growth = Croissance ·
Contraction = Contraction · Milestones = Étapes · Charts = Graphiques · History = Historique ·
Settings = Paramètres · Quick log = Saisie rapide · Log (nav) = Saisie · Calendar = Calendrier ·
Left/Right/Both = Gauche/Droite/Les deux · Stop = Arrêter · Start = Démarrer.

## Review notes

Every worker records, in `docs/i18n-review/<area>.md`, the French strings it is **unsure about or
that are sensitive** (medical, legal, anything where grammar/register may be off), with the
English source, the French chosen and why it is uncertain. Do not guess silently.

// Regression guard for the i18n work: everything the app STORES or MATCHES BY TEXT (event types,
// medication names, side / who / contents values, milestone keys, percentile ids ...) must stay
// exactly what it was before the app was translated, and the maths must not depend on the language.
//
// GOLDEN data below was captured by running the pre-i18n modules of commit ab16004 (English only,
// schema v5) and freezing their output. Do NOT regenerate it to make a failing test pass: a failure
// here means data written by an existing user would no longer be recognised.
import { withLocale } from '../i18n/testSetup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  MEDICATION_PRESETS,
  getCustomPresets,
  getMedicationNames,
  getMedicationStatus,
  lastDoseFor,
  loggedMedicationNames,
  medicationsFor,
  nextDoseInfo,
} from './medications.js';
import { AFTER_FEED, FEED_TAGS, feedInsights, lastFinishedFeed, suggestNextSide } from './breastfeeding.js';
import { CONSISTENCY_OPTIONS } from './diaperOptions.js';
import { DIAPER_SUBTYPE_COLORS, EVENT_COLORS, WHO_BAND_COLORS } from './palette.js';
import { aggregateByDay } from './aggregate.js';
import { ageInMonths, dayKey } from './dateUtils.js';
import { MILESTONES, MILESTONE_CATEGORIES } from '../data/milestones.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..');
const read = (rel) => fs.readFileSync(path.join(srcDir, rel), 'utf8');
const squash = (s) => s.replace(/\s+/g, ' ');

// ---- GOLDEN identifiers (captured from pre-i18n commit ab16004) ----
const GOLDEN_IDS = {
  "presets": [
    {
      "name": "Paracetamol",
      "key": "paracetamol",
      "doseAmount": 1,
      "doseUnit": "g",
      "intervalHours": 6
    },
    {
      "name": "Ibuprofen",
      "key": "ibuprofen",
      "doseAmount": 400,
      "doseUnit": "mg",
      "intervalHours": 6
    },
    {
      "name": "Diclofenac",
      "key": "diclofenac",
      "doseAmount": 100,
      "doseUnit": "mg",
      "intervalHours": 12
    },
    {
      "name": "Dihydrocodeine",
      "key": "dihydrocodeine",
      "doseAmount": 30,
      "doseUnit": "mg",
      "intervalHours": 6
    },
    {
      "name": "Co-codamol (codeine)",
      "key": "co-codamol",
      "doseAmount": null,
      "doseUnit": null,
      "intervalHours": 6
    }
  ],
  "feedTags": [
    "searching",
    "efficient",
    "dozed",
    "hard_latch"
  ],
  "afterFeed": [
    "satisfied",
    "still_hungry"
  ],
  "consistency": [
    "watery",
    "soft",
    "normal",
    "hard"
  ],
  "eventColors": [
    "diaper",
    "bottle",
    "breastfeeding",
    "contraction",
    "outing",
    "temperature",
    "medication",
    "sleep",
    "growth"
  ],
  "diaperSub": [
    "wet",
    "dirty"
  ],
  "whoBandColors": [
    "3rd",
    "15th",
    "50th",
    "85th",
    "97th"
  ],
  "bands": [
    {
      "label": "3rd",
      "z": -1.8808
    },
    {
      "label": "15th",
      "z": -1.0364
    },
    {
      "label": "50th",
      "z": 0
    },
    {
      "label": "85th",
      "z": 1.0364
    },
    {
      "label": "97th",
      "z": 1.8808
    }
  ],
  "milestones": [
    {
      "key": "red-book",
      "category": "baby-admin",
      "offsetDays": 0
    },
    {
      "key": "blood-spot-test",
      "category": "baby-medical",
      "offsetDays": 5
    },
    {
      "key": "register-gp",
      "category": "baby-admin",
      "offsetDays": 14
    },
    {
      "key": "hearing-screening",
      "category": "baby-medical",
      "offsetDays": 28
    },
    {
      "key": "register-birth",
      "category": "baby-admin",
      "offsetDays": 10
    },
    {
      "key": "vaccines-8w",
      "category": "baby-medical",
      "offsetDays": 56
    },
    {
      "key": "6-8-week-review",
      "category": "mom",
      "offsetDays": 42
    },
    {
      "key": "pelvic-floor-physio",
      "category": "mom",
      "offsetDays": 28
    },
    {
      "key": "healthy-start",
      "category": "baby-admin",
      "offsetDays": 30
    },
    {
      "key": "child-benefit",
      "category": "baby-admin",
      "offsetDays": 90
    },
    {
      "key": "vaccines-12w",
      "category": "baby-medical",
      "offsetDays": 84
    },
    {
      "key": "vaccines-16w",
      "category": "baby-medical",
      "offsetDays": 112
    },
    {
      "key": "french-birth-declaration",
      "category": "nationality",
      "offsetDays": 8
    },
    {
      "key": "consulate-transcription-fallback",
      "category": "nationality",
      "offsetDays": 16
    },
    {
      "key": "passport-uk",
      "category": "baby-admin",
      "offsetDays": 90
    },
    {
      "key": "vaccines-1y",
      "category": "baby-medical",
      "offsetDays": 365
    },
    {
      "key": "passport-french",
      "category": "nationality",
      "offsetDays": 21
    },
    {
      "key": "vaccines-18m",
      "category": "baby-medical",
      "offsetDays": 548
    },
    {
      "key": "vaccines-3y4m",
      "category": "baby-medical",
      "offsetDays": 1217
    },
    {
      "key": "growth-spurt-3w",
      "category": "development",
      "offsetDays": 17
    },
    {
      "key": "growth-spurt-6w",
      "category": "development",
      "offsetDays": 42
    },
    {
      "key": "growth-spurt-3m",
      "category": "development",
      "offsetDays": 90
    },
    {
      "key": "growth-spurt-6m",
      "category": "development",
      "offsetDays": 180
    },
    {
      "key": "growth-spurt-9m",
      "category": "development",
      "offsetDays": 270
    },
    {
      "key": "dev-social-smile",
      "category": "development",
      "offsetDays": 42
    },
    {
      "key": "dev-rolling",
      "category": "development",
      "offsetDays": 152
    },
    {
      "key": "dev-sitting",
      "category": "development",
      "offsetDays": 213
    },
    {
      "key": "dev-crawling",
      "category": "development",
      "offsetDays": 335
    },
    {
      "key": "dev-walking",
      "category": "development",
      "offsetDays": 426
    }
  ],
  "milestoneFields": [
    "key",
    "title",
    "category",
    "offsetDays",
    "description"
  ],
  "categories": [
    "baby-admin",
    "baby-medical",
    "nationality",
    "mom",
    "development"
  ]
};

// ---- GOLDEN behaviour (captured from pre-i18n commit ab16004 for the inputs below) ----
const GOLDEN_BEHAVIOUR = {"medications":{"full/mom":{"ids":["m1","m3","m5","m6","m7","m8","m10","m11"],"names":["Paracetamol","Ibuprofen","Diclofenac","Dihydrocodeine","Co-codamol (codeine)","Arnica","Mystery","Zinc cream (custom)"],"logged":["Paracetamol","Ibuprofen","Co-codamol (codeine)","Arnica","Mystery","Zinc cream (custom)"],"custom":[{"key":"custom:Arnica","name":"Arnica","doseAmount":3,"doseUnit":"pill","intervalHours":0},{"key":"custom:Mystery","name":"Mystery","doseAmount":1,"doseUnit":"x"},{"key":"custom:Zinc cream (custom)","name":"Zinc cream (custom)","doseAmount":5,"doseUnit":"g","intervalHours":8}],"lastDose":{"Paracetamol":"m1","Ibuprofen":"m3","Diclofenac":null,"Dihydrocodeine":null,"Co-codamol (codeine)":"m10","Infant Calpol":null,"Vitamin D":null,"Zinc cream (custom)":"m5","Arnica":"m7","Mystery":"m8","paracetamol":null,"Nope":null},"status":{"Paracetamol":[{"safe":false,"nextSafeAt":1791046800000},{"safe":false,"nextSafeAt":1791046800000},{"safe":true,"nextSafeAt":1791046800000},{"safe":true,"nextSafeAt":1791046800000},{"safe":true,"nextSafeAt":1791046800000},{"safe":false,"nextSafeAt":1791046800000}],"Ibuprofen":[{"safe":false,"nextSafeAt":1791032400000},{"safe":true,"nextSafeAt":1791032400000},{"safe":true,"nextSafeAt":1791032400000},{"safe":true,"nextSafeAt":1791032400000},{"safe":true,"nextSafeAt":1791032400000},{"safe":false,"nextSafeAt":1791032400000}],"Diclofenac":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Dihydrocodeine":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Co-codamol (codeine)":[{"safe":true,"nextSafeAt":1790798400000},{"safe":true,"nextSafeAt":1790798400000},{"safe":true,"nextSafeAt":1790798400000},{"safe":true,"nextSafeAt":1790798400000},{"safe":true,"nextSafeAt":1790798400000},{"safe":false,"nextSafeAt":1790798400000}],"Infant Calpol":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Vitamin D":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Zinc cream (custom)":[{"safe":true,"nextSafeAt":1791025200000},{"safe":true,"nextSafeAt":1791025200000},{"safe":true,"nextSafeAt":1791025200000},{"safe":true,"nextSafeAt":1791025200000},{"safe":true,"nextSafeAt":1791025200000},{"safe":false,"nextSafeAt":1791025200000}],"Arnica":[{"safe":true,"nextSafeAt":1790884800000},{"safe":true,"nextSafeAt":1790884800000},{"safe":true,"nextSafeAt":1790884800000},{"safe":true,"nextSafeAt":1790884800000},{"safe":true,"nextSafeAt":1790884800000},{"safe":false,"nextSafeAt":1790884800000}],"Mystery":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"paracetamol":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Nope":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}]},"nextDose":{"m1":[{"nextSafeAt":1791046800000,"safe":false},{"nextSafeAt":1791046800000,"safe":false},{"nextSafeAt":1791046800000,"safe":true},{"nextSafeAt":1791046800000,"safe":true},{"nextSafeAt":1791046800000,"safe":true},{"nextSafeAt":1791046800000,"safe":false}],"m3":[{"nextSafeAt":1791032400000,"safe":false},{"nextSafeAt":1791032400000,"safe":true},{"nextSafeAt":1791032400000,"safe":true},{"nextSafeAt":1791032400000,"safe":true},{"nextSafeAt":1791032400000,"safe":true},{"nextSafeAt":1791032400000,"safe":false}],"m5":[{"nextSafeAt":1791025200000,"safe":true},{"nextSafeAt":1791025200000,"safe":true},{"nextSafeAt":1791025200000,"safe":true},{"nextSafeAt":1791025200000,"safe":true},{"nextSafeAt":1791025200000,"safe":true},{"nextSafeAt":1791025200000,"safe":false}],"m6":[{"nextSafeAt":1790942400000,"safe":true},{"nextSafeAt":1790942400000,"safe":true},{"nextSafeAt":1790942400000,"safe":true},{"nextSafeAt":1790942400000,"safe":true},{"nextSafeAt":1790942400000,"safe":true},{"nextSafeAt":1790942400000,"safe":false}],"m7":[{"nextSafeAt":1790884800000,"safe":true},{"nextSafeAt":1790884800000,"safe":true},{"nextSafeAt":1790884800000,"safe":true},{"nextSafeAt":1790884800000,"safe":true},{"nextSafeAt":1790884800000,"safe":true},{"nextSafeAt":1790884800000,"safe":false}],"m8":[null,null,null,null,null,null],"m10":[{"nextSafeAt":1790798400000,"safe":true},{"nextSafeAt":1790798400000,"safe":true},{"nextSafeAt":1790798400000,"safe":true},{"nextSafeAt":1790798400000,"safe":true},{"nextSafeAt":1790798400000,"safe":true},{"nextSafeAt":1790798400000,"safe":false}],"m11":[null,null,null,null,null,null]}},"full/baby":{"ids":["m2","m4","m9"],"names":["Infant Calpol","paracetamol","Vitamin D"],"logged":["Infant Calpol","paracetamol","Vitamin D"],"custom":[{"key":"custom:Infant Calpol","name":"Infant Calpol","doseAmount":2.5,"doseUnit":"ml","intervalHours":4},{"key":"custom:paracetamol","name":"paracetamol","doseAmount":1,"doseUnit":"ml","intervalHours":4},{"key":"custom:Vitamin D","name":"Vitamin D","doseAmount":null,"doseUnit":null,"intervalHours":24}],"lastDose":{"Paracetamol":null,"Ibuprofen":null,"Diclofenac":null,"Dihydrocodeine":null,"Co-codamol (codeine)":null,"Infant Calpol":"m2","Vitamin D":"m4","Zinc cream (custom)":null,"Arnica":null,"Mystery":null,"paracetamol":"m9","Nope":null},"status":{"Paracetamol":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Ibuprofen":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Diclofenac":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Dihydrocodeine":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Co-codamol (codeine)":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Infant Calpol":[{"safe":false,"nextSafeAt":1791034200000},{"safe":true,"nextSafeAt":1791034200000},{"safe":true,"nextSafeAt":1791034200000},{"safe":true,"nextSafeAt":1791034200000},{"safe":true,"nextSafeAt":1791034200000},{"safe":false,"nextSafeAt":1791034200000}],"Vitamin D":[{"safe":false,"nextSafeAt":1791090000000},{"safe":false,"nextSafeAt":1791090000000},{"safe":false,"nextSafeAt":1791090000000},{"safe":false,"nextSafeAt":1791090000000},{"safe":true,"nextSafeAt":1791090000000},{"safe":false,"nextSafeAt":1791090000000}],"Zinc cream (custom)":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Arnica":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Mystery":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"paracetamol":[{"safe":true,"nextSafeAt":1790827200000},{"safe":true,"nextSafeAt":1790827200000},{"safe":true,"nextSafeAt":1790827200000},{"safe":true,"nextSafeAt":1790827200000},{"safe":true,"nextSafeAt":1790827200000},{"safe":false,"nextSafeAt":1790827200000}],"Nope":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}]},"nextDose":{"m2":[{"nextSafeAt":1791034200000,"safe":false},{"nextSafeAt":1791034200000,"safe":true},{"nextSafeAt":1791034200000,"safe":true},{"nextSafeAt":1791034200000,"safe":true},{"nextSafeAt":1791034200000,"safe":true},{"nextSafeAt":1791034200000,"safe":false}],"m4":[{"nextSafeAt":1791090000000,"safe":false},{"nextSafeAt":1791090000000,"safe":false},{"nextSafeAt":1791090000000,"safe":false},{"nextSafeAt":1791090000000,"safe":false},{"nextSafeAt":1791090000000,"safe":true},{"nextSafeAt":1791090000000,"safe":false}],"m9":[{"nextSafeAt":1790827200000,"safe":true},{"nextSafeAt":1790827200000,"safe":true},{"nextSafeAt":1790827200000,"safe":true},{"nextSafeAt":1790827200000,"safe":true},{"nextSafeAt":1790827200000,"safe":true},{"nextSafeAt":1790827200000,"safe":false}]}},"empty/mom":{"ids":[],"names":["Paracetamol","Ibuprofen","Diclofenac","Dihydrocodeine","Co-codamol (codeine)"],"logged":[],"custom":[],"lastDose":{"Paracetamol":null,"Ibuprofen":null,"Diclofenac":null,"Dihydrocodeine":null,"Co-codamol (codeine)":null,"Infant Calpol":null,"Vitamin D":null,"Zinc cream (custom)":null,"Arnica":null,"Mystery":null,"paracetamol":null,"Nope":null},"status":{"Paracetamol":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Ibuprofen":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Diclofenac":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Dihydrocodeine":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Co-codamol (codeine)":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Infant Calpol":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Vitamin D":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Zinc cream (custom)":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Arnica":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Mystery":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"paracetamol":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Nope":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}]},"nextDose":{}},"empty/baby":{"ids":[],"names":[],"logged":[],"custom":[],"lastDose":{"Paracetamol":null,"Ibuprofen":null,"Diclofenac":null,"Dihydrocodeine":null,"Co-codamol (codeine)":null,"Infant Calpol":null,"Vitamin D":null,"Zinc cream (custom)":null,"Arnica":null,"Mystery":null,"paracetamol":null,"Nope":null},"status":{"Paracetamol":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Ibuprofen":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Diclofenac":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Dihydrocodeine":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Co-codamol (codeine)":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Infant Calpol":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Vitamin D":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Zinc cream (custom)":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Arnica":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Mystery":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"paracetamol":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Nope":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}]},"nextDose":{}},"legacyOnly/mom":{"ids":["m3","m5","m6","m7","m8","m10","m11"],"names":["Paracetamol","Ibuprofen","Diclofenac","Dihydrocodeine","Co-codamol (codeine)","Arnica","Mystery","Zinc cream (custom)"],"logged":["Paracetamol","Ibuprofen","Co-codamol (codeine)","Arnica","Mystery","Zinc cream (custom)"],"custom":[{"key":"custom:Arnica","name":"Arnica","doseAmount":3,"doseUnit":"pill","intervalHours":0},{"key":"custom:Mystery","name":"Mystery","doseAmount":1,"doseUnit":"x"},{"key":"custom:Zinc cream (custom)","name":"Zinc cream (custom)","doseAmount":5,"doseUnit":"g","intervalHours":8}],"lastDose":{"Paracetamol":"m6","Ibuprofen":"m3","Diclofenac":null,"Dihydrocodeine":null,"Co-codamol (codeine)":"m10","Infant Calpol":null,"Vitamin D":null,"Zinc cream (custom)":"m5","Arnica":"m7","Mystery":"m8","paracetamol":null,"Nope":null},"status":{"Paracetamol":[{"safe":true,"nextSafeAt":1790942400000},{"safe":true,"nextSafeAt":1790942400000},{"safe":true,"nextSafeAt":1790942400000},{"safe":true,"nextSafeAt":1790942400000},{"safe":true,"nextSafeAt":1790942400000},{"safe":false,"nextSafeAt":1790942400000}],"Ibuprofen":[{"safe":false,"nextSafeAt":1791032400000},{"safe":true,"nextSafeAt":1791032400000},{"safe":true,"nextSafeAt":1791032400000},{"safe":true,"nextSafeAt":1791032400000},{"safe":true,"nextSafeAt":1791032400000},{"safe":false,"nextSafeAt":1791032400000}],"Diclofenac":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Dihydrocodeine":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Co-codamol (codeine)":[{"safe":true,"nextSafeAt":1790798400000},{"safe":true,"nextSafeAt":1790798400000},{"safe":true,"nextSafeAt":1790798400000},{"safe":true,"nextSafeAt":1790798400000},{"safe":true,"nextSafeAt":1790798400000},{"safe":false,"nextSafeAt":1790798400000}],"Infant Calpol":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Vitamin D":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Zinc cream (custom)":[{"safe":true,"nextSafeAt":1791025200000},{"safe":true,"nextSafeAt":1791025200000},{"safe":true,"nextSafeAt":1791025200000},{"safe":true,"nextSafeAt":1791025200000},{"safe":true,"nextSafeAt":1791025200000},{"safe":false,"nextSafeAt":1791025200000}],"Arnica":[{"safe":true,"nextSafeAt":1790884800000},{"safe":true,"nextSafeAt":1790884800000},{"safe":true,"nextSafeAt":1790884800000},{"safe":true,"nextSafeAt":1790884800000},{"safe":true,"nextSafeAt":1790884800000},{"safe":false,"nextSafeAt":1790884800000}],"Mystery":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"paracetamol":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Nope":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}]},"nextDose":{"m3":[{"nextSafeAt":1791032400000,"safe":false},{"nextSafeAt":1791032400000,"safe":true},{"nextSafeAt":1791032400000,"safe":true},{"nextSafeAt":1791032400000,"safe":true},{"nextSafeAt":1791032400000,"safe":true},{"nextSafeAt":1791032400000,"safe":false}],"m5":[{"nextSafeAt":1791025200000,"safe":true},{"nextSafeAt":1791025200000,"safe":true},{"nextSafeAt":1791025200000,"safe":true},{"nextSafeAt":1791025200000,"safe":true},{"nextSafeAt":1791025200000,"safe":true},{"nextSafeAt":1791025200000,"safe":false}],"m6":[{"nextSafeAt":1790942400000,"safe":true},{"nextSafeAt":1790942400000,"safe":true},{"nextSafeAt":1790942400000,"safe":true},{"nextSafeAt":1790942400000,"safe":true},{"nextSafeAt":1790942400000,"safe":true},{"nextSafeAt":1790942400000,"safe":false}],"m7":[{"nextSafeAt":1790884800000,"safe":true},{"nextSafeAt":1790884800000,"safe":true},{"nextSafeAt":1790884800000,"safe":true},{"nextSafeAt":1790884800000,"safe":true},{"nextSafeAt":1790884800000,"safe":true},{"nextSafeAt":1790884800000,"safe":false}],"m8":[null,null,null,null,null,null],"m10":[{"nextSafeAt":1790798400000,"safe":true},{"nextSafeAt":1790798400000,"safe":true},{"nextSafeAt":1790798400000,"safe":true},{"nextSafeAt":1790798400000,"safe":true},{"nextSafeAt":1790798400000,"safe":true},{"nextSafeAt":1790798400000,"safe":false}],"m11":[null,null,null,null,null,null]}},"legacyOnly/baby":{"ids":[],"names":[],"logged":[],"custom":[],"lastDose":{"Paracetamol":null,"Ibuprofen":null,"Diclofenac":null,"Dihydrocodeine":null,"Co-codamol (codeine)":null,"Infant Calpol":null,"Vitamin D":null,"Zinc cream (custom)":null,"Arnica":null,"Mystery":null,"paracetamol":null,"Nope":null},"status":{"Paracetamol":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Ibuprofen":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Diclofenac":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Dihydrocodeine":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Co-codamol (codeine)":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Infant Calpol":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Vitamin D":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Zinc cream (custom)":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Arnica":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Mystery":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"paracetamol":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}],"Nope":[{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null},{"safe":true,"nextSafeAt":null}]},"nextDose":{}}},"feeds":{"empty":{"last":null,"lastAtShifted":[null,null,null,null],"side":[null,null,null,null],"insights":[null,null,null,null],"directSide":[]},"left":{"last":"f1","lastAtShifted":["f1","f1","f1",null],"side":["right","right",null,null],"insights":[null,null,null,null],"directSide":["right"]},"right":{"last":"f1","lastAtShifted":["f1","f1","f1","f0"],"side":["left","left",null,"right"],"insights":[null,null,null,null],"directSide":["left","right"]},"bothLeftFirst":{"last":"f1","lastAtShifted":["f1","f1","f1",null],"side":["right","right",null,null],"insights":[null,null,null,null],"directSide":["right"]},"bothRightFirst":{"last":"f1","lastAtShifted":["f1","f1","f1",null],"side":["left","left",null,null],"insights":[null,null,null,null],"directSide":["left"]},"bothLegacy":{"last":"f1","lastAtShifted":["f1","f1","f1",null],"side":[null,null,null,null],"insights":[null,null,null,null],"directSide":[null]},"old":{"last":"f1","lastAtShifted":["f1","f1","f1","f1"],"side":[null,null,null,null],"insights":[null,null,null,null],"directSide":[null]},"unfinishedAndFuture":{"last":"f1","lastAtShifted":["f1","f3","f3",null],"side":["right","right","right",null],"insights":[null,null,null,null],"directSide":["right",null,"right"]},"junkSide":{"last":"f1","lastAtShifted":["f1","f1","f1",null],"side":[null,null,null,null],"insights":[null,null,null,null],"directSide":[null]},"observed":{"last":"o1","lastAtShifted":["o1","o1","o1","o3"],"side":["right","right",null,"right"],"insights":[{"observedCount":6,"totalCount":7,"mix":{"efficient":{"count":2,"medianMinutes":11},"searching":{"count":2,"medianMinutes":27.5},"other":{"count":2,"medianMinutes":17},"none":{"count":1,"medianMinutes":14}},"efficient":{"count":2,"medianMinutes":11},"searching":{"count":2,"medianMinutes":27.5},"afterFeed":{"answered":3,"satisfied":2}},{"observedCount":6,"totalCount":7,"mix":{"efficient":{"count":2,"medianMinutes":11},"searching":{"count":2,"medianMinutes":27.5},"other":{"count":2,"medianMinutes":17},"none":{"count":1,"medianMinutes":14}},"efficient":{"count":2,"medianMinutes":11},"searching":{"count":2,"medianMinutes":27.5},"afterFeed":{"answered":3,"satisfied":2}},{"observedCount":6,"totalCount":7,"mix":{"efficient":{"count":2,"medianMinutes":11},"searching":{"count":2,"medianMinutes":27.5},"other":{"count":2,"medianMinutes":17},"none":{"count":1,"medianMinutes":14}},"efficient":{"count":2,"medianMinutes":11},"searching":{"count":2,"medianMinutes":27.5},"afterFeed":{"answered":3,"satisfied":2}},{"observedCount":6,"totalCount":7,"mix":{"efficient":{"count":2,"medianMinutes":11},"searching":{"count":2,"medianMinutes":27.5},"other":{"count":2,"medianMinutes":17},"none":{"count":1,"medianMinutes":14}},"efficient":{"count":2,"medianMinutes":11},"searching":{"count":2,"medianMinutes":27.5},"afterFeed":{"answered":3,"satisfied":2}}],"directSide":["right","left","right","right",null,null,null,null,null]},"fewObserved":{"last":"p1","lastAtShifted":["p1","p1","p1","p2"],"side":["right","right",null,"left"],"insights":[null,null,null,null],"directSide":["right","left"]}},"aggregate":[{"total":0,"wet":0,"dirty":0,"ml":0},{"total":1,"wet":1,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":180},{"total":1,"wet":0,"dirty":1,"ml":0},{"total":2,"wet":2,"dirty":1,"ml":0}],"aggregate14":[{"total":0,"wet":0,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":0},{"total":0,"wet":0,"dirty":0,"ml":0}],"dayKey":["2026-03-04","2026-12-31","2026-01-01","2026-10-03"],"age":[0.9856465225158627,7.095286008610717,0,11.992032690609664,31.1135752274174]};

// Stored-value literals that components build payloads from (verified present in ab16004 too).
const GOLDEN_SOURCE_LITERALS = {
  "components/BottleSheet.jsx": [
    "type: 'bottle'",
    "useState('formula')",
    "['formula', 'breast_milk', 'mixed']",
    "volumeMl",
    "contents }"
  ],
  "components/EditEventSheet.jsx": [
    "['formula', 'breast_milk', 'mixed']",
    "['left', 'right', 'both']",
    "['left', 'right']",
    "['mild', 'moderate', 'strong']",
    "setDetail('who', 'baby')",
    "setDetail('who', 'mom')",
    "details.side === 'both'",
    "delete next.firstSide",
    "INSTANT_TYPES = ['diaper', 'bottle', 'temperature', 'medication']",
    "setDetail('wet'",
    "setDetail('dirty'",
    "event.type === 'contraction'"
  ],
  "components/DiaperSheet.jsx": [
    "type: 'diaper'",
    "details: { wet, dirty, consistency: dirty ? consistency : null }"
  ],
  "components/FeedingTile.jsx": [
    "type: 'breastfeeding'",
    "{ side, firstSide } : { side }",
    "key: 'left'",
    "key: 'right'",
    "key: 'both'"
  ],
  "components/MedicationSheet.jsx": [
    "type: 'medication'",
    "name: name.trim()",
    "who,",
    "doseAmount:",
    "doseUnit:",
    "intervalHours:"
  ],
  "components/OutingSheet.jsx": [
    "type: 'outing'",
    "details: { location: location || null, notes: notes || null }"
  ],
  "components/TemperatureSheet.jsx": [
    "details: { who, valueC:",
    "notes: notes || null"
  ],
  "components/ChildProfileSection.jsx": [
    "useState('female')",
    "sex === 'female'",
    "setSex('female')",
    "sex === 'male'",
    "setSex('male')",
    "dateOfBirth: dob, sex"
  ],
  "components/TimerTile.jsx": [
    "details: choiceKey ? { side: choiceKey } : {}",
    "type,",
    "details.intensity = extraKey"
  ],
  "components/ContractionChart.jsx": [
    "INTENSITY_HEIGHT = { mild: 1, moderate: 2, strong: 3, unspecified: 1.5 }"
  ],
  "pages/HomePage.jsx": [
    "type=\"sleep\"",
    "type=\"contraction\"",
    "key: 'mild'",
    "key: 'moderate'",
    "key: 'strong'",
    "subject === 'baby'",
    "subject === 'mom'",
    "who=\"baby\"",
    "who=\"mom\"",
    "type: 'medication'"
  ],
  "pages/HistoryPage.jsx": [
    "type: 'growth'",
    "e.type !== 'medication'"
  ],
  "pages/ChartsPage.jsx": [
    "key: 'wet'",
    "key: 'dirty'"
  ]
};

// ---- INPUT GRID + compute(lib): shared verbatim between the baseline generator and the test ----
const H = 3600000;
const NOW = Date.parse('2026-10-03T12:00:00.000Z');
const iso = (hoursBeforeNow) => new Date(NOW - hoursBeforeNow * H).toISOString();

// newest first, like the API returns them. Legacy rows (no `who`) are mum's.
const MED_EVENTS = [
  { id: 'm1', type: 'medication', startedAt: iso(1), endedAt: iso(1), details: { name: 'Paracetamol', who: 'mom', doseAmount: 1, doseUnit: 'g', intervalHours: 6 } },
  { id: 'm2', type: 'medication', startedAt: iso(2.5), endedAt: iso(2.5), details: { name: 'Infant Calpol', who: 'baby', doseAmount: 2.5, doseUnit: 'ml', intervalHours: 4 } },
  { id: 'm3', type: 'medication', startedAt: iso(5), endedAt: iso(5), details: { name: 'Ibuprofen', doseAmount: 400, doseUnit: 'mg', intervalHours: 6 } },
  { id: 'm4', type: 'medication', startedAt: iso(7), endedAt: iso(7), details: { name: 'Vitamin D', who: 'baby', doseAmount: null, doseUnit: null, intervalHours: 24 } },
  { id: 'm5', type: 'medication', startedAt: iso(9), endedAt: iso(9), details: { name: 'Zinc cream (custom)', doseAmount: 5, doseUnit: 'g', intervalHours: 8 } },
  { id: 'm6', type: 'medication', startedAt: iso(30), endedAt: iso(30), details: { name: 'Paracetamol', doseAmount: 1, doseUnit: 'g', intervalHours: 6 } },
  { id: 'm7', type: 'medication', startedAt: iso(40), endedAt: iso(40), details: { name: 'Arnica', doseAmount: 3, doseUnit: 'pill', intervalHours: 0 } },
  { id: 'm8', type: 'medication', startedAt: iso(50), endedAt: iso(50), details: { name: 'Mystery', doseAmount: 1, doseUnit: 'x' } }, // no interval
  { id: 'm9', type: 'medication', startedAt: iso(60), endedAt: iso(60), details: { name: 'paracetamol', who: 'baby', doseAmount: 1, doseUnit: 'ml', intervalHours: 4 } }, // custom name that equals a preset KEY
  { id: 'm10', type: 'medication', startedAt: iso(70), endedAt: iso(70), details: { name: 'Co-codamol (codeine)', doseAmount: null, doseUnit: null, intervalHours: 6 } },
  { id: 'm11', type: 'medication', startedAt: iso(80), endedAt: iso(80), details: {} }, // nameless junk
];
const MED_GRIDS = { full: MED_EVENTS, empty: [], legacyOnly: MED_EVENTS.filter((e) => !e.details.who) };
const MED_NAMES = ['Paracetamol', 'Ibuprofen', 'Diclofenac', 'Dihydrocodeine', 'Co-codamol (codeine)', 'Infant Calpol', 'Vitamin D', 'Zinc cream (custom)', 'Arnica', 'Mystery', 'paracetamol', 'Nope'];
const NOWS = [NOW, NOW + 2 * H, NOW + 5 * H, NOW + 11 * H, NOW + 100 * H, NOW - 100 * H];

const feed = (id, startH, mins, details) => ({ id, type: 'breastfeeding', startedAt: iso(startH), endedAt: mins == null ? null : new Date(NOW - startH * H + mins * 60000).toISOString(), details });
const FEED_GRIDS = {
  empty: [],
  left: [feed('f1', 2, 15, { side: 'left' })],
  right: [feed('f1', 2, 15, { side: 'right' }), feed('f0', 5, 10, { side: 'left' })],
  bothLeftFirst: [feed('f1', 2, 20, { side: 'both', firstSide: 'left' })],
  bothRightFirst: [feed('f1', 2, 20, { side: 'both', firstSide: 'right' })],
  bothLegacy: [feed('f1', 2, 20, { side: 'both' })],
  old: [feed('f1', 20, 20, { side: 'left' })],
  unfinishedAndFuture: [
    feed('f3', -3, 10, { side: 'left' }), // future start
    feed('f2', 1, null, { side: 'right' }), // forgotten timer
    feed('f1', 4, 12, { side: 'left' }),
  ],
  junkSide: [feed('f1', 2, 10, { side: 'sideways' })],
  observed: [
    feed('o1', 1, 10, { side: 'left', tags: ['efficient'], afterFeed: 'satisfied' }),
    feed('o2', 4, 12, { side: 'right', tags: ['efficient', 'dozed'] }),
    feed('o3', 8, 30, { side: 'left', tags: ['searching'], afterFeed: 'still_hungry' }),
    feed('o4', 12, 25, { side: 'both', firstSide: 'left', tags: ['searching', 'hard_latch'] }),
    feed('o5', 20, 18, { side: 'right', tags: ['efficient', 'searching'] }),
    feed('o6', 28, 14, { side: 'left' }),
    feed('o7', 36, 16, { side: 'right', afterFeed: 'satisfied' }),
    feed('o8', 24 * 30, 10, { side: 'left', tags: ['efficient'] }), // outside 14d window
    { id: 'o9', type: 'bottle', startedAt: iso(3), endedAt: iso(3), details: { volumeMl: 90, contents: 'formula' } },
  ],
  fewObserved: [feed('p1', 1, 10, { side: 'left', tags: ['efficient'] }), feed('p2', 5, 10, { side: 'right' })],
};
const FEED_NOWS = [NOW, NOW + 3 * H, NOW + 13 * H, NOW - 5 * H];

function localNoon(daysAgo) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}
const AGG_EVENTS = [
  { type: 'diaper', startedAt: localNoon(0), details: { wet: true, dirty: false } },
  { type: 'diaper', startedAt: localNoon(0), details: { wet: true, dirty: true } },
  { type: 'diaper', startedAt: localNoon(1), details: { wet: false, dirty: true } },
  { type: 'bottle', startedAt: localNoon(2), details: { volumeMl: 120, contents: 'formula' } },
  { type: 'bottle', startedAt: localNoon(2), details: { volumeMl: 60, contents: 'mixed' } },
  { type: 'diaper', startedAt: localNoon(5), details: { wet: true, dirty: false } },
  { type: 'diaper', startedAt: localNoon(40), details: { wet: true, dirty: false } }, // outside window
];
const AGG_REDUCER = (acc, e) => (e.type === 'diaper'
  ? { ...acc, total: acc.total + 1, wet: acc.wet + (e.details.wet ? 1 : 0), dirty: acc.dirty + (e.details.dirty ? 1 : 0) }
  : { ...acc, ml: acc.ml + e.details.volumeMl });
const AGG_INITIAL = () => ({ total: 0, wet: 0, dirty: 0, ml: 0 });

const DAYKEY_INPUTS = ['2026-03-04T12:00:00', '2026-12-31T23:59:59', '2026-01-01T00:00:00', '2026-10-03T08:30:00.000'];
const AGE_INPUTS = [
  ['2026-09-03', '2026-10-03'],
  ['2026-03-01T10:00:00', '2026-10-03T10:00:00'],
  ['2026-10-03', '2026-10-03'],
  ['2025-10-03', '2026-10-03'],
  ['2024-02-29', '2026-10-03'],
];

function compute(lib) {
  const out = {};
  out.medications = {};
  for (const [gname, events] of Object.entries(MED_GRIDS)) {
    for (const who of ['mom', 'baby']) {
      const mine = lib.medicationsFor(events, who);
      const g = { ids: mine.map((e) => e.id) };
      g.names = lib.getMedicationNames(mine, who);
      g.logged = lib.loggedMedicationNames(mine, who);
      g.custom = lib.getCustomPresets(mine, who).map((p) => ({ key: p.key, name: p.name, doseAmount: p.doseAmount, doseUnit: p.doseUnit, intervalHours: p.intervalHours }));
      g.lastDose = {};
      g.status = {};
      for (const n of MED_NAMES) {
        const last = lib.lastDoseFor(mine, n);
        g.lastDose[n] = last ? last.id : null;
        g.status[n] = NOWS.map((nw) => {
          const s = lib.getMedicationStatus(last, nw);
          return { safe: s.safe, nextSafeAt: s.nextSafeAt };
        });
      }
      g.nextDose = {};
      for (const e of mine) {
        g.nextDose[e.id] = NOWS.map((nw) => {
          const n = lib.nextDoseInfo(e, nw);
          return n ? { nextSafeAt: n.nextSafeAt, safe: n.safe } : null;
        });
      }
      out.medications[`${gname}/${who}`] = g;
    }
  }
  out.feeds = {};
  for (const [name, events] of Object.entries(FEED_GRIDS)) {
    const last = lib.lastFinishedFeed(events, NOW);
    const f = {
      last: last ? last.id : null,
      lastAtShifted: FEED_NOWS.map((nw) => { const l = lib.lastFinishedFeed(events, nw); return l ? l.id : null; }),
      side: FEED_NOWS.map((nw) => lib.suggestNextSide(lib.lastFinishedFeed(events, nw), nw)),
      insights: FEED_NOWS.map((nw) => lib.feedInsights(events, nw)),
    };
    f.directSide = events.map((e) => lib.suggestNextSide(e, NOW));
    out.feeds[name] = f;
  }
  out.aggregate = lib.aggregateByDay(AGG_EVENTS, 7, AGG_INITIAL, AGG_REDUCER).map(({ day, ...values }) => values);
  out.aggregate14 = lib.aggregateByDay([], 14, AGG_INITIAL, AGG_REDUCER).map(({ day, ...values }) => values);
  out.dayKey = DAYKEY_INPUTS.map((s) => lib.dayKey(s));
  out.age = AGE_INPUTS.map(([a, b]) => lib.ageInMonths(a, b));
  return JSON.parse(JSON.stringify(out)); // normalise (undefined, NaN->null) identically on both sides
}


const LIB = {
  medicationsFor, getMedicationNames, loggedMedicationNames, getCustomPresets, lastDoseFor,
  getMedicationStatus, nextDoseInfo, suggestNextSide, lastFinishedFeed, feedInsights,
  aggregateByDay, dayKey, ageInMonths,
};

// ===================================================================== identifiers

test('medication presets keep their stored name / key / dose / interval', () => {
  const current = MEDICATION_PRESETS.map(({ name, key, doseAmount, doseUnit, intervalHours }) => ({
    name, key, doseAmount, doseUnit, intervalHours,
  }));
  assert.deepEqual(current, GOLDEN_IDS.presets);
});

test('feed tags, after-feed answers and diaper consistencies keep their stored keys', () => {
  assert.deepEqual(FEED_TAGS.map((x) => x.key), GOLDEN_IDS.feedTags);
  assert.deepEqual(AFTER_FEED.map((x) => x.key), GOLDEN_IDS.afterFeed);
  assert.deepEqual(CONSISTENCY_OPTIONS.map((x) => x.key), GOLDEN_IDS.consistency);
});

test('event colour maps keep their event-type / sub-type / band keys', () => {
  assert.deepEqual(Object.keys(EVENT_COLORS), GOLDEN_IDS.eventColors);
  assert.deepEqual(Object.keys(DIAPER_SUBTYPE_COLORS), GOLDEN_IDS.diaperSub);
  assert.deepEqual(Object.keys(WHO_BAND_COLORS), GOLDEN_IDS.whoBandColors);
});

test('WHO percentile bands keep their stable ids and z-scores (whoPercentiles.js read from source: it imports JSON)', () => {
  const src = read('lib/whoPercentiles.js');
  const literal = src.match(/PERCENTILE_BANDS = (\[[\s\S]*?\]);/)[1];
  const bands = new Function(`return ${literal}`)();
  assert.deepEqual(bands.map((b) => ({ label: b.label, z: b.z })), GOLDEN_IDS.bands);
  // the ids are also the data keys of WHO_BAND_COLORS
  assert.deepEqual(Object.keys(WHO_BAND_COLORS), bands.map((b) => b.label));
});

test('milestones keep key / category / offsetDays (and gain no stored field); categories keep their keys', () => {
  const current = MILESTONES.map((m) =>
    Object.fromEntries(Object.keys(m).filter((k) => !['title', 'description'].includes(k)).map((k) => [k, m[k]])),
  );
  assert.deepEqual(current, GOLDEN_IDS.milestones);
  assert.deepEqual(Object.keys(MILESTONES[0]).sort(), [...GOLDEN_IDS.milestoneFields].sort());
  assert.deepEqual(Object.keys(MILESTONE_CATEGORIES), GOLDEN_IDS.categories);
  for (const m of MILESTONES) assert.ok(MILESTONE_CATEGORIES[m.category], `category ${m.category}`);
});

test('stored enums built inline by components are still present in the source that builds the payload', () => {
  const missing = [];
  for (const [file, literals] of Object.entries(GOLDEN_SOURCE_LITERALS)) {
    const src = squash(read(file));
    for (const lit of literals) if (!src.includes(squash(lit))) missing.push(`${file}: ${lit}`);
  }
  assert.deepEqual(missing, []);
});

test('the History page type filter still lists exactly the stored event types', () => {
  const m = squash(read('pages/HistoryPage.jsx')).match(/const TYPES = (\[[^\]]*\])/);
  assert.ok(m, 'TYPES declaration found');
  assert.deepEqual(new Function(`return ${m[1]}`)(), [
    'diaper', 'bottle', 'breastfeeding', 'outing', 'temperature', 'sleep', 'growth', 'medication',
  ]);
});

test('every stored event type still has a colour entry (plus growth, which is not an event)', () => {
  for (const type of ['diaper', 'bottle', 'breastfeeding', 'contraction', 'outing', 'temperature', 'medication', 'sleep', 'growth']) {
    assert.ok(EVENT_COLORS[type], type);
  }
});

// ===================================================================== behaviour

test('behaviour grid is non-trivial (guards against freezing empty output)', () => {
  assert.ok(Object.keys(GOLDEN_BEHAVIOUR.medications).length >= 6);
  const full = GOLDEN_BEHAVIOUR.medications['full/mom'];
  assert.ok(full.names.length > 5 && full.ids.length > 3);
  assert.ok(Object.values(full.status).some((rows) => rows.some((s) => s.safe === false)));
  assert.ok(GOLDEN_BEHAVIOUR.feeds.observed.insights.some((i) => i && i.observedCount >= 3));
  assert.equal(GOLDEN_BEHAVIOUR.aggregate.length, 7);
});

for (const locale of ['en', 'fr']) {
  test(`medications / feeds / aggregation / dates give the pre-i18n results in ${locale}`, () => {
    const actual = withLocale(locale, () => compute(LIB));
    assert.deepEqual(actual.medications, GOLDEN_BEHAVIOUR.medications);
    assert.deepEqual(actual.feeds, GOLDEN_BEHAVIOUR.feeds);
    assert.deepEqual(actual.aggregate, GOLDEN_BEHAVIOUR.aggregate);
    assert.deepEqual(actual.aggregate14, GOLDEN_BEHAVIOUR.aggregate14);
    assert.deepEqual(actual.dayKey, GOLDEN_BEHAVIOUR.dayKey);
    assert.deepEqual(actual.age, GOLDEN_BEHAVIOUR.age);
  });
}

test('results are identical in English and French (no language dependence)', () => {
  const en = withLocale('en', () => compute(LIB));
  const fr = withLocale('fr', () => compute(LIB));
  assert.deepEqual(fr, en);
});

test('legacy medication rows without `who` are still mum\'s, and custom names stay case-sensitive', () => {
  const legacy = { id: 'x', details: { name: 'Paracetamol' } };
  assert.deepEqual(medicationsFor([legacy], 'mom').map((e) => e.id), ['x']);
  assert.deepEqual(medicationsFor([legacy], 'baby'), []);
  // a user-typed name that merely looks like a preset must not be merged into it
  assert.deepEqual(getMedicationNames([{ details: { name: 'paracetamol' } }], 'mom').slice(-1), ['paracetamol']);
});

// ===================================================================== sleep maths untouched

test('sleep.js / sleepGuidance.js / sleepBand.js are byte-identical to pre-i18n commit ab16004', (t) => {
  const repoRoot = path.join(here, '..', '..', '..');
  let gitOk = true;
  try {
    execFileSync('git', ['rev-parse', '--verify', 'ab16004^{commit}'], { cwd: repoRoot, stdio: 'pipe' });
  } catch {
    gitOk = false;
  }
  if (!gitOk) {
    t.skip('git or commit ab16004 not available');
    return;
  }
  for (const file of ['sleep.js', 'sleepGuidance.js', 'sleepBand.js']) {
    const old = execFileSync('git', ['show', `ab16004:web/src/lib/${file}`], { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 });
    const cur = fs.readFileSync(path.join(here, file));
    // compare ignoring CRLF/LF differences introduced by checkout settings
    const norm = (b) => b.toString('utf8').replace(/\r\n/g, '\n');
    assert.equal(norm(cur), norm(old), `${file} changed since ab16004`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import hi from './src/i18n/lang/hi.js';
import as from './src/i18n/lang/as.js';
import bn from './src/i18n/lang/bn.js';
import odia from './src/i18n/lang/or.js';
import { CAMPUS, CATEGORIES, SECURITY_QUESTIONS, STATUSES } from '../backend/src/config/constants.js';
import { PUBLIC_GROUPS } from '../backend/src/services/emergency.js';
import { INSTITUTE } from '../backend/src/services/institute.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, 'src');
const backendSrc = path.join(here, '../backend/src');
const LANGUAGES = { hi, as, bn, or: odia };

// Every string literal inside a t(...) call in the browser code (.js and .jsx under src/), found with a small scanner so that keys
// containing brackets or quotes are read correctly.
function literalsInCalls(source) {
  const found = [];
  const call = /(?<![\w.$])t\(/g;
  let m;
  while ((m = call.exec(source))) {
    let depth = 1;
    let inKey = true; // only the first argument is the key; later arguments are parameters
    let i = m.index + m[0].length;
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 1) inKey = false;
      else if (c === "'" || c === '"' || c === '`') {
        let j = i + 1;
        let hasHole = false;
        while (j < source.length && source[j] !== c) {
          if (source[j] === '\\') j++;
          else if (c === '`' && source[j] === '$' && source[j + 1] === '{') hasHole = true;
          j++;
        }
        const raw = source.slice(i + 1, j);
        if (!hasHole && raw && inKey && depth === 1) found.push(new Function(`return ${c}${raw}${c}`)());
        i = j;
      }
      i++;
    }
  }
  return found;
}

const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'lang' ? [] : files(path.join(dir, e.name))) : [path.join(dir, e.name)]));
const codeKeys = new Set(files(root).filter((f) => /\.jsx?$/.test(f) && !f.endsWith('lib/i18n.js')).flatMap((f) => literalsInCalls(fs.readFileSync(f, 'utf8'))));

// Texts that come from the server or are built from data, so they never appear as a literal in a t(...) call.
const dynamicKeys = [
  ...Object.values(CATEGORIES).map((c) => c.label),
  ...Object.values(CATEGORIES).map((c) => c.department),
  ...SECURITY_QUESTIONS,
  ...STATUSES.map((s) => s.replace(/_/g, ' ')),
  ...CAMPUS.map((g) => g.group),
  ...['critical', 'high', 'medium', 'low', 'overdue', 'acknowledged', 'not yet acknowledged', 'student', 'staff', 'admin'],
  INSTITUTE.status, INSTITUTE.established, INSTITUTE.campus, INSTITUTE.vision, ...INSTITUTE.mission,
  ...INSTITUTE.sources.map((s) => s.label),
  // Fixed texts the server writes into timelines, matches and suggestions
  'normal', 'urgent', 'emergency',
  'Fix confirmed by a reporter', 'Acknowledged: the team has seen this report', 'A new report came in after the fix was claimed',
  'Another student says the problem is still there', 'Reporter says it is not fixed', 'Unassigned', 'Confirmed via me too',
  'Confirmed by another student (me too)', 'system', 'reporter',
  'built-in rules', 'local model', 'No clear match, so it goes to the Estate Office',
  // The public emergency numbers that ship with the code (the full directory is private and stays in English)
  ...PUBLIC_GROUPS.flatMap((g) => [g.group, ...g.entries.flatMap((e) => [e.role, e.name])]),
];

// Every fixed message the server can send. (Messages with a name or number built in stay in English.)
const serverFiles = files(backendSrc).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(f, 'utf8'));
const developerOnly = new Set(['data must be an http(s) link']);
const serverMessages = serverFiles.flatMap((src) => [
  ...[...src.matchAll(/new HttpError\(\d+, ('(?:[^'\\]|\\.)*')/g)].map((m) => new Function(`return ${m[1]}`)()),
  ...[...src.matchAll(/error: ('(?:[^'\\]|\\.)*')/g)].map((m) => new Function(`return ${m[1]}`)()),
]).filter((m) => !developerOnly.has(m));
dynamicKeys.push(...serverMessages);

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('the scanner finds the strings it should (guards the test itself)', () => {
  assert.ok(codeKeys.size > 40, `only ${codeKeys.size} strings found`);
  assert.ok(codeKeys.has('Security question (used if you forget your password)'), 'keys with brackets are read whole');
  assert.ok(codeKeys.has('Sign in') && codeKeys.has('Create account'), 'both sides of a conditional are read');
  assert.ok(codeKeys.has('Skip to content') && codeKeys.has('Report it. Track it. See it fixed.'), 'page chrome is read too');
  assert.ok(serverMessages.length > 25 && serverMessages.includes('Incorrect email or password'), 'server messages are found');
});

for (const [code, dictionary] of Object.entries(LANGUAGES)) {
  test(`every string in the interface is translated into ${code}`, () => {
    const wanted = new Set([...codeKeys, ...dynamicKeys]);
    const missing = [...wanted].filter((k) => typeof dictionary[k] !== 'string' || !dictionary[k].trim());
    assert.deepEqual(missing, [], `${code} is missing ${missing.length} translation(s)`);
  });

  test(`${code} translations keep the same {placeholders} as the English text`, () => {
    for (const [key, value] of Object.entries(dictionary)) {
      assert.equal(placeholders(value), placeholders(key), `${code}: "${key}"`);
    }
  });

  test(`${code} has no leftover entries for text that no longer exists`, () => {
    const wanted = new Set([...codeKeys, ...dynamicKeys]);
    const stale = Object.keys(dictionary).filter((k) => !wanted.has(k));
    assert.deepEqual(stale, [], `${code} has ${stale.length} unused entr${stale.length === 1 ? 'y' : 'ies'}`);
  });
}

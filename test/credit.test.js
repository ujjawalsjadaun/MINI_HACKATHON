// The developer credit must stay in every place it appears. If this test fails, put the credit back:
// the MIT license requires the copyright notice to be kept in every copy of the project.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const DEVELOPERS = ['Ujjawal Singh', 'Anirudh Mishra'];
const BOTH = DEVELOPERS.join(' and ');
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('the license keeps the developers\' copyright notice', () => {
  assert.match(read('LICENSE'), new RegExp(`Copyright \\(c\\) 2026 ${BOTH}`));
});

test('package.json names both developers', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.author, DEVELOPERS[0]);
  assert.ok(pkg.contributors?.includes(DEVELOPERS[1]));
});

test('every page shows the developer credit in its footer', () => {
  const footer = read('apps/frontend/src/components/Footer.jsx');
  assert.match(footer, new RegExp(`\\{t\\('Designed and developed by'\\)\\} <strong>${DEVELOPERS[0]}</strong> \\{t\\('and'\\)\\} <strong>${DEVELOPERS[1]}</strong>`));
  const html = read('apps/frontend/index.html');
  assert.match(html, new RegExp(`<meta name="author" content="${DEVELOPERS.join(', ')}">`));
});

test('the README credits both developers', () => {
  const readme = read('README.md');
  assert.match(readme, new RegExp(`Designed and developed by ${BOTH}`));
  assert.match(readme, new RegExp(`\\*\\*Developers and designers:\\*\\* ${BOTH}`));
});

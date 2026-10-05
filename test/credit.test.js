// The developer credit must stay in every place it appears. If this test fails, put the credit back:
// the MIT license requires the copyright notice to be kept in every copy of the project.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const DEVELOPER = 'Ujjawal Singh';
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('the license keeps the developer\'s copyright notice', () => {
  assert.match(read('LICENSE'), new RegExp(`Copyright \\(c\\) 2026 ${DEVELOPER}`));
});

test('package.json names the developer as author', () => {
  assert.equal(JSON.parse(read('package.json')).author, DEVELOPER);
});

test('every page shows the developer credit in its footer', () => {
  const html = read('public/index.html');
  const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
  assert.match(footer, new RegExp(`Designed and developed by</span> <strong>${DEVELOPER}</strong>`));
  assert.match(html, new RegExp(`<meta name="author" content="${DEVELOPER}">`));
});

test('the README credits the developer', () => {
  const readme = read('README.md');
  assert.match(readme, new RegExp(`Designed and developed by ${DEVELOPER}`));
  assert.match(readme, new RegExp(`\\*\\*Developer:\\*\\* ${DEVELOPER}`));
});

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const oneline = require('../extension/lib/oneline.js');

// The real shape of um.fz.ax/self/one-line.md: a blockquote preamble, a heading,
// then one aphorism per line (blank-line separated).
const SAMPLE = `> For the complete documentation index, see [llms.txt](https://um.fz.ax/llms.txt). Markdown versions are available by appending \`.md\`.

# one line

the path forward seems to go back

calmly active and actively calm

birds born in cages think flying is a disease
`;

test('parse strips the preamble + heading, returns the aphorism lines trimmed', () => {
  assert.deepEqual(oneline.parse(SAMPLE), [
    'the path forward seems to go back',
    'calmly active and actively calm',
    'birds born in cages think flying is a disease',
  ]);
});

test('empty / non-string / heading-only input returns [] without throwing', () => {
  assert.deepEqual(oneline.parse(''), []);
  assert.deepEqual(oneline.parse(null), []);
  assert.deepEqual(oneline.parse('# one line\n\n> preamble\n'), []);
});

test('a markup-bearing line is returned as inert literal text (rendered via textContent)', () => {
  assert.deepEqual(oneline.parse('<img src=x onerror=alert(1)>'), ['<img src=x onerror=alert(1)>']);
});

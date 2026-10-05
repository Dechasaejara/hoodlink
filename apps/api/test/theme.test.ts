import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorContrast, contrastRatio, readableAccent } from '../../web/src/lib/theme';

test('theme text remains readable for pale, dark, and saturated custom accents', () => {
  for (const accent of ['#ffffff', '#000000', '#ffff00', '#3390ec', '#d64c59', '#087c4d']) {
    assert.ok(contrastRatio(accent, colorContrast(accent)) >= 4.5);
    assert.ok(contrastRatio(readableAccent(accent, false), '#ffffff') >= 4.5);
    assert.ok(contrastRatio(readableAccent(accent, true), '#17212b') >= 4.5);
  }
});
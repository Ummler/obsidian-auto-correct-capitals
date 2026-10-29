const { test } = require('node:test');
const assert = require('node:assert/strict');
const { correct } = require('./helpers/editor.cjs');

function check(name, input, expected, settings = {}, options = {}) {
  test(name, () => {
    const result = correct(input, settings, options);
    assert.equal(result.text, expected);
    if (input === expected) {
      assert.equal(result.edits.length, 0, 'Unchanged text must not cause edits');
    }
  });
}

// Existing behavior: these must stay green while the reported bugs are fixed.
check('existing: correct double capitals', 'HAllo ', 'Hallo ');
check('existing: preserve acronym', 'NASA ', 'NASA ');
check('existing: preserve ordinary word', 'Hallo ', 'Hallo ');
check('existing: wait for delimiter', 'HAllo', 'HAllo');
check('existing: exclusions are case insensitive', 'HAllo ', 'HAllo ', {
  exclusionList: ['hallo'],
});
for (const marker of ['-', '*', '1.']) {
  check(`existing: capitalize ${marker} list`, `${marker} hallo `, `${marker} Hallo `, {
    capitalizeListItem: true,
  });
}
check('existing: nested bullet', '  - hallo ', '  - Hallo ', {
  capitalizeListItem: true,
});
check('existing: nested numbered list', '- Parent\n\t1. hallo ', '- Parent\n\t1. Hallo ', {
  capitalizeListItem: true,
});
check('existing: list capitalization disabled', '- hallo ', '- hallo ');
check('existing: sentence capitalization disabled', 'hallo ', 'hallo ');
check('existing: capitalize sentence', 'This ends. next ', 'This ends. Next ', {
  capitalizeSentences: true,
});
check('existing: abbreviation without parentheses', 'This, i.e. that. ', 'This, i.e. that. ', {
  capitalizeSentences: true,
});
check('existing: exclusion at list start', '- NB this that ', '- NB this that ', {
  capitalizeListItem: true,
  exclusionList: ['NB'],
});
check('existing: protect inline code', '`HAllo` ', '`HAllo` ');
check('existing: protect inline math', '$HAllo$ ', '$HAllo$ ');
check('existing: protect fenced code', '```text\nHAllo ', '```text\nHAllo ');
check('existing: protect fenced math', '$$\nHAllo ', '$$\nHAllo ');
check('existing: protect frontmatter', '---\ntitle: HAllo ', '---\ntitle: HAllo ');
check('existing: correct after fenced code', '```\ncode\n```\nHAllo ', '```\ncode\n```\nHallo ');
check('existing: correct after frontmatter', '---\ntitle: Example\n---\nHAllo ',
  '---\ntitle: Example\n---\nHallo ');
check('existing: Enter corrects previous line', 'HAllo\n', 'Hallo\n', {}, { enter: true });

// Desired behavior: these assertions intentionally fail on the unfixed baseline.
for (const indent of ['', '  ', '\t']) {
  const parent = indent === '\t' ? '- Parent\n' : '';
  check(`#12: plus marker with indent ${JSON.stringify(indent)}`,
    `${parent}${indent}+ hallo `, `${parent}${indent}+ Hallo `, { capitalizeListItem: true });
}
for (const marker of ['-', '*', '+', '1.']) {
  for (const state of [' ', 'x']) {
    check(`#17: ${marker} [${state}] task`, `${marker} [${state}] task `,
      `${marker} [${state}] Task `, { capitalizeListItem: true });
  }
}
check('#17: nested task', '  - [ ] task ', '  - [ ] Task ', {
  capitalizeListItem: true,
});
for (const punctuation of [',', '.', ';', ':']) {
  check(`#13: excluded NB followed by ${punctuation}`,
    `- NB${punctuation} this that `, `- NB${punctuation} this that `, {
      capitalizeListItem: true,
      exclusionList: ['NB'],
    });
}
check('#15: abbreviation inside parentheses', 'This (i.e. that). ', 'This (i.e. that). ', {
  capitalizeSentences: true,
});
for (const [word, expected] of [
  ['æble', 'Æble'], ['øl', 'Øl'], ['åben', 'Åben'], ['привіт', 'Привіт'],
]) {
  check(`#18: sentence starts with ${word}`, `${word} `, `${expected} `, {
    capitalizeSentences: true,
  });
}
check('#18: Unicode after sentence boundary', 'Finished. æble ', 'Finished. Æble ', {
  capitalizeSentences: true,
});
for (const scheme of ['http', 'https']) {
  check(`#16: protect ${scheme} scheme`, `${scheme}://example.com `,
    `${scheme}://example.com `, { capitalizeSentences: true });
}
check('#16: protect case-sensitive URL path', 'https://example.com/HAllo ',
  'https://example.com/HAllo ');
check('#16: correct prose outside URL', 'https://example.com HAllo ',
  'https://example.com Hallo ');

// A single event can check several positions with different protection states.
check('protection: code word and sentence outside code', '`HAllo` end. next ',
  '`HAllo` end. Next ', { capitalizeSentences: true });
check('protection: list word and inline code in same line', '- hallo `HAllo` ',
  '- Hallo `HAllo` ', { capitalizeListItem: true });

// Integration cases for the fixes: offsets, settings, punctuation and protection.
check('#13: task exclusion with punctuation', '- [ ] NB, this ', '- [ ] NB, this ', {
  capitalizeListItem: true, exclusionList: ['NB'],
});
check('#13: numbered exclusion with punctuation', '10. NB: this ', '10. NB: this ', {
  capitalizeListItem: true, exclusionList: ['NB'],
});
check('#13: punctuation does not make an acronym a misspelling', '- NB, this ', '- NB, this ', {
  capitalizeListItem: true,
});
check('#17: uppercase checkbox state', '- [X] task ', '- [X] Task ', {
  capitalizeListItem: true,
});
check('#17: disabled task capitalization', '- [ ] task ', '- [ ] task ');
check('#17: multiple spaces after task marker', '  + [ ]   task ', '  + [ ]   Task ', {
  capitalizeListItem: true,
});
check('#15: quoted abbreviation', 'This "i.e. that" ', 'This "i.e. that" ', {
  capitalizeSentences: true,
});
check('#15: custom abbreviation retains hyphen', 'This (a-b. that) ', 'This (a-b. that) ', {
  capitalizeSentences: true, abbreviations: ['a-b.'],
});
check('#15: ordinary parenthesized word still ends sentence', 'This (ends. next) ',
  'This (ends. Next) ', { capitalizeSentences: true });
check('#18: astral sentence initial', '𐐨word ', '𐐀word ', { capitalizeSentences: true });
check('#18: Unicode double capitals', 'ÆØble ', 'Æøble ');
check('#18: astral double capitals', '𐐀𐐁𐐪 ', '𐐀𐐩𐐪 ');
check('#18: casing expansion preserves following sentence offsets', 'ßeta. next ',
  'SSeta. Next ', { capitalizeSentences: true });
check('#18: list casing expansion is not corrected again', '- ßeta ', '- SSeta ', {
  capitalizeListItem: true,
});
check('#18: excluded sentence word', 'iphone ', 'iphone ', {
  capitalizeSentences: true, exclusionList: ['iPhone'],
});
check('#16: URL in task', '- [ ] https://example.com/HAllo ',
  '- [ ] https://example.com/HAllo ', { capitalizeListItem: true, capitalizeSentences: true });
check('#16: URL and prose sentence share line', 'https://example.com. next ',
  'https://example.com. Next ', { capitalizeSentences: true });
for (const partial of ['http:', 'https:', 'https:/']) {
  check(`#16: protect URL while typing ${partial}`, partial, partial, {
    capitalizeSentences: true,
  });
}
check('protection: list and inline math share line', '- hallo $HAllo$ ',
  '- Hallo $HAllo$ ', { capitalizeListItem: true });
check('protection: sentence inside code stays unchanged', 'done. `x. next` end. next ',
  'Done. `x. next` end. Next ', { capitalizeSentences: true });
check('protection: sentence inside math stays unchanged', 'done. $x. next$ end. next ',
  'Done. $x. next$ end. Next ', { capitalizeSentences: true });

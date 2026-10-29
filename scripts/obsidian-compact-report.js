/* Run in Obsidian's console while the ORIGINAL test note or its events JSON is open.
 * Produces a new compact note; never rewrites the original or the diagnostics.
 */
(function (root) {
  'use strict';
  function bounded(value, limit = 2000) {
    if (typeof value === 'string' && value.length > limit) {
      return { characters: value.length, truncated: true,
        first: value.slice(0, limit / 2), last: value.slice(-limit / 2) };
    }
    if (Array.isArray(value)) return value.map(item => bounded(item, limit));
    return value;
  }

  function compactReport(report, sourcePath) {
    if (!report || !Array.isArray(report.results)) throw new Error('Keine gültige Live-Test-Diagnose: results fehlt.');
    const json = value => '```json\n' + JSON.stringify(value, null, 2) + '\n```';
    const failures = report.results.filter(result => result.status === 'FAIL');
    const parts = ['# AutoCorrect-Auswertung',
      'Diagnosequelle: ' + sourcePath,
      'Originalnotiz und Diagnose wurden nicht verändert.',
      '## Gesamt', json({ counts: report.counts, trustedInputEvents: report.trustedInputEvents,
        droppedEvents: report.droppedEvents || 0, error: report.error || null }),
      '## Umgebung und Einstellungen', json(report.metadata || {}),
      '## Fehlgeschlagene Prüfungen'];
    if (!failures.length) parts.push('Keine fehlgeschlagenen Prüfungen protokolliert.');
    for (const result of failures) {
      parts.push('### ' + result.id + ': ' + (result.title || ''), json({
        checkpoint: result.checkpoint, phase: result.phase,
        expected: bounded(result.expected), actual: bounded(result.actual), metrics: result.metrics,
      }));
    }

    const timings = Object.fromEntries(Object.entries(report.timings || {})
      .filter(([name]) => name.startsWith('perf-')));
    if (Object.keys(timings).length) {
      const sizes = {};
      for (const sample of report.measurements || []) {
        const name = sample.case + '/' + sample.phase;
        if (name.startsWith('perf-') && !sizes[name]) sizes[name] = {
          documentCharacters: sample.documentCharacters, documentLines: sample.documentLines,
        };
      }
      parts.push('## Laufzeitmessungen',
        'Diese Werte bleiben erhalten, auch wenn der zugehörige Texttest bestanden wurde. Pausiert ist kein Vergleich ohne installiertes Plugin.',
        report.timingScope || 'Messumfang in dieser Diagnose nicht angegeben.',
        json(Object.fromEntries(Object.entries(timings).map(([name, values]) =>
          [name, { ...sizes[name], ...values }]))));
      const fixtures = (report.fixtures || []).filter(item => item.case?.startsWith('perf-'))
        .map(({ case: id, phase, characters, synchronousInsertMs, documentCharacters, documentLines }) =>
          ({ case: id, phase, characters, synchronousInsertMs, documentCharacters, documentLines }));
      if (fixtures.length) parts.push('### Aufbau der Lasttexte', json(fixtures));
    }

    parts.push('## Ereignisausschnitte zu Fehlern');
    const kinds = new Set(['beforeinput', 'input', 'keydown', 'keyup', 'compositionstart',
      'compositionend', 'sent-char', 'sent-key', 'transaction', 'correction-decision']);
    for (const result of failures) {
      const id = result.id;
      // Older reports have no phase/window on checkpoints. Preserve active
      // evidence for their active performance failures instead of paused tails.
      const phase = result.phase || (id.startsWith('perf-') && result.checkpoint === 'Aktiv' ? 'active' : null);
      let source = report.events || [];
      if (Number.isInteger(result.eventStart) && Number.isInteger(result.eventEnd)) {
        source = source.slice(result.eventStart, result.eventEnd);
      }
      const events = source.filter(event => event.case === id && (!phase || event.phase === phase) && kinds.has(event.kind) &&
        (event.kind !== 'transaction' || event.userEvent));
      const boundary = events.length > 32 ? [...events.slice(0, 16), ...events.slice(-16)] : events;
      const decisions = events.filter(event => event.kind === 'correction-decision' &&
        event.reason !== 'no-owned-word').slice(0, 16);
      const selected = events.filter(event => boundary.includes(event) || decisions.includes(event));
      const tail = selected.map(event => {
        const entry = { ...event };
        if (entry.changes) entry.changes = entry.changes.map(change => ({
          ...change, inserted: bounded(change.inserted, 160),
        }));
        return entry;
      });
      parts.push('### ' + id + ' / ' + (phase || result.checkpoint || 'unbekannte Phase') + ' — ' + tail.length + ' von ' + events.length + ' Eingabeereignissen (Anfang und Ende)',
        tail.length ? '```json\n' + tail.map(event => JSON.stringify(event)).join('\n') + '\n```'
          : 'Keine passenden Rohereignisse vorhanden.');
    }
    const skipped = report.results.filter(result => result.status === 'SKIP');
    if (skipped.length) parts.push('## Nicht ausgeführt', json(skipped.map(({ id, reason }) => ({ id, reason }))));
    return parts.join('\n\n') + '\n';
  }

  if (!root.document || !root.app) {
    if (typeof module !== 'undefined') module.exports = { compactReport };
    return;
  }
  if (root.AutoCorrectLiveTest?.running) throw new Error('Zuerst den laufenden Live-Test beenden.');
  (async () => {
    const app = root.app, active = app.workspace.getActiveFile();
    if (!active) throw new Error('Zuerst die ursprüngliche Live-Testnotiz öffnen.');
    const sourcePath = active.path.endsWith('-events.json') ? active.path
      : active.extension === 'md' ? active.path.replace(/\.md$/, '-events.json') : null;
    if (!sourcePath || !await app.vault.adapter.exists(sourcePath)) {
      throw new Error('Zugehörige Diagnose-JSON nicht gefunden. Die ursprüngliche Testnotiz oder ihre -events.json öffnen.');
    }
    const report = JSON.parse(await app.vault.adapter.read(sourcePath));
    const content = compactReport(report, sourcePath);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = sourcePath.replace(/-events\.json$/, '') + '-Auswertung-' + stamp + '-' +
      Math.random().toString(36).slice(2, 7) + '.md';
    const output = await app.vault.create(outputPath, content);
    await app.workspace.getLeaf(false).openFile(output);
    console.log('Kompakte Auswertung erstellt:', outputPath);
  })().catch(error => console.error('AutoCorrect-Auswertung:', error));
})(globalThis);

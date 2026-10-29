/*
 * Run in Obsidian desktop's developer console:
 * eval(require('fs').readFileSync('/home/ummel/Projects/obsidian-auto-correct-capitals/scripts/obsidian-live-test.js', 'utf8'))
 *
 * Creates a NEW note. Tested characters go through Electron sendInputEvent,
 * never editor.replaceRange or an annotated CodeMirror dispatch. Only headings
 * reports and explicit fixtures use programmatic insertion. Escape or changing
 * focus stops input. Timings describe the whole instrumented editor pipeline.
 * Native execution is separate from this script's automated driver tests.
 */
(function (root) {
  'use strict';
  const text = value => ({ type: 'text', value });
  const key = (value, count = 1) => ({ type: 'key', value, count });
  const check = (expected, label = 'Abschluss', info = false) => ({ type: 'check', expected, label, info });
  const setup = (value, omit = false) => ({ type: 'setup', value, omit });
  const paused = value => ({ type: 'pause', value });

  function randomMarkdown(paragraphs, seed) {
    let state = seed >>> 0;
    const random = max => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % max; };
    const words = ['Wald', 'Fenster', 'Notiz', 'Text', 'Beispiel', 'Papier', 'Wolke', 'Licht'];
    const result = [];
    for (let i = 0; i < paragraphs; i++) {
      const sentence = Array.from({ length: 12 }, () => words[random(words.length)]).join(' ') + '.';
      const kind = random(6);
      if (kind === 0) result.push('## Abschnitt ' + i + '\n\n' + sentence);
      if (kind === 1) result.push('- ' + sentence + '\n  - Unterpunkt mit `HAllo` im Code.');
      if (kind === 2) result.push('> ' + sentence + '\n> Weiterer zitierter Text.');
      if (kind === 3) result.push('```text\n' + sentence + '\nHAllo TEst\n```');
      if (kind === 4) result.push(sentence + '\n\n[Verweis](https://example.com/TEst) und [[Notiz|Anzeige]].');
      if (kind === 5) result.push(sentence + '\n\n$$\na + b = c\n$$');
    }
    return result.join('\n\n') + '\n\n';
  }

  function performanceActions(prefix, config, activeExpected) {
    const sample = 'HAllo '.repeat(config.performanceWords);
    const result = [setup(prefix, true),
      { ...text(sample), measurement: 'active' }, check(activeExpected.repeat(config.performanceWords), 'Aktiv')];
    const comparisonPrefix = prefix && !prefix.includes('\n') ? '\n' + prefix : '\n\n';
    if (config.comparePaused) result.push(paused(true), setup(comparisonPrefix, true),
      { ...text(sample), measurement: 'paused' }, check(sample, 'Pausierte Vergleichseingabe'), paused(false));
    return result;
  }

  function cases(settings, options = {}) {
    const config = optionsFor(options);
    const functional = [
      { id: 'basic', title: 'Einfacher Wortabschluss', actions: [text('HAllo '), check('Hallo ')] },
      { id: 'cursor-one-space', title: 'Cursor vor zweitem Wort: eine Leerstelle', actions: [
        text('Wort Wort HAllo'), key('Left', 10), text('TEst '), check('Wort Test Wort HAllo'),
      ] },
      { id: 'cursor-two-spaces', title: 'Cursor in Lücke: zwei Leerstellen', actions: [
        text('Wort  Wort HAllo'), key('Left', 11), text('TEst '), check('Wort Test  Wort HAllo'),
      ] },
      { id: 'comma', title: 'Komma: vor und nach der Leerstelle', actions: [
        text('HAllo,'), check(['HAllo,', 'Hallo,'], 'Zwischenstand nach Komma; Aufschub zulässig', true),
        text(' '), check('Hallo, ', 'Nach Komma und Leerstelle'),
      ] },
      ...['.', ';', ':', '!', '?'].map(mark => ({ id: 'punctuation-' + mark,
        title: 'Wortabschluss mit ' + mark, actions: [text('HAllo' + mark + ' '), check('Hallo' + mark + ' ')] })),
      { id: 'enter', title: 'Enter beendet das Wort', actions: [text('HAllo'), key('Return'), check('Hallo\n')] },
      { id: 'inline-code', title: 'Inline-Code bleibt unverändert', actions: [text('`HAllo` '), check('`HAllo` ')] },
      { id: 'email', title: 'E-Mail bleibt unverändert', actions: [text('HAllo.Name@EXample.com '), check('HAllo.Name@EXample.com ')] },
      { id: 'url', title: 'URL-Pfad bleibt unverändert', actions: [text('https://example.com/HAllo '), check('https://example.com/HAllo ')] },
      { id: 'unicode-word', title: 'Internationale doppelte Großbuchstaben', actions: [text('ÆØble '), check('Æøble ')] },
      { id: 'retry', title: 'Löschen und identisch neu schreiben', actions: [
        text('HAllo '), check('Hallo ', 'Erster Versuch'), key('Backspace', 6), text('HAllo '),
        check(settings.respectRepeatedSpelling === false ? 'Hallo ' : 'HAllo ', 'Zweiter Versuch'),
      ] },
      ...['+ ', '- [ ] ', '> - [ ] ', '1) '].map(prefix => ({
        id: 'list-' + prefix, title: 'Liste: ' + JSON.stringify(prefix),
        skip: settings.capitalizeListItem ? null : 'Capitalize list items ist deaktiviert',
        actions: [text(prefix + 'hallo '), check(prefix + 'Hallo ')],
      })),
      { id: 'parenthesized-abbreviation', title: 'Abkürzung in Klammern',
        skip: !settings.capitalizeSentences ? 'Capitalize sentences ist deaktiviert'
          : !(settings.abbreviations || []).some(word => word.toLowerCase() === 'i.e.') ? 'i.e. fehlt in der Abkürzungsliste' : null,
        actions: [text('This (i.e. that). '), check('This (i.e. that). ')] },
      { id: 'unicode-sentence', title: 'Internationaler Satzanfang',
        skip: settings.capitalizeSentences ? null : 'Capitalize sentences ist deaktiviert',
        actions: [text('æble '), check('Æble ')] },
      { id: 'cyrillic-sentence', title: 'Kyrillischer Satzanfang',
        skip: settings.capitalizeSentences ? null : 'Capitalize sentences ist deaktiviert',
        actions: [text('привіт '), check('Привіт ')] },
      { id: 'unicode-expansion', title: 'Längenändernde Großschreibung und nachfolgende Eingabe',
        skip: settings.capitalizeSentences ? null : 'Capitalize sentences ist deaktiviert',
        actions: [text('ßeta weiter '), check('SSeta weiter ')] },
      ...['```javascript', '~~~text', '````text'].map(open => ({
        id: 'fence-' + open, title: 'Fenced Code: ' + open,
        actions: [setup(open + '\n'), text('HAllo '), check(open + '\nHAllo ', 'Innerhalb des Blocks'),
          setup('\n' + (open.startsWith('~') ? '~~~' : open.startsWith('````') ? '````' : '```') + '\n\n'),
          text('TEst '), check(open + '\nHAllo \n' +
            (open.startsWith('~') ? '~~~' : open.startsWith('````') ? '````' : '```') + '\n\nTest ', 'Nach dem geschlossenen Block')],
      })),
      { id: 'fence-too-short', title: 'Drei Backticks schließen keinen Vierer-Fence', actions: [
        setup('````text\nseed\n```\n'), text('HAllo '), check('````text\nseed\n```\nHAllo '), setup('\n````\n\n'),
      ] },
      { id: 'fence-edit-above', title: 'Schließenden Fence oberhalb löschen und wieder einsetzen', actions: [
        setup('```text\nseed\n```\n\n'), text('HAllo '), check('```text\nseed\n```\n\nHallo ', 'Außerhalb'),
        { type: 'patch', from: 13, to: 16, value: '' }, text('TEst '),
        check('```text\nseed\n\n\nHallo TEst ', 'Nach Entfernen des Abschlusses'),
        { type: 'patch', from: 13, to: 13, value: '```' }, text('AGain '),
        check('```text\nseed\n```\n\nHallo TEst Again ', 'Nach Wiederherstellen'),
      ] },
      { id: 'math-block', title: 'Display-Mathematik und Rückkehr in normalen Text', actions: [
        setup('$$\n'), text('HAllo '), check('$$\nHAllo ', 'Innerhalb von Display-Mathematik'),
        setup('\n$$\n\n'), text('TEst '), check('$$\nHAllo \n$$\n\nTest ', 'Nach dem Mathematikblock'),
      ] },
      { id: 'inline-math', title: 'Leerstelle innerhalb von Inline-Mathematik', actions: [
        setup('$'), text('HAllo '), check('$HAllo ', 'Wortabschluss innerhalb der Formel'),
        setup('$ '), text('TEst '), check('$HAllo $ Test ', 'Nach der Formel'),
      ] },
      { id: 'double-backtick', title: 'Leerstelle innerhalb von Code mit zwei Backticks', actions: [
        setup('``'), text('HAllo '), check('``HAllo ', 'Wortabschluss innerhalb des Codes'),
        setup('`` '), text('TEst '), check('``HAllo `` Test ', 'Nach dem Inline-Code'),
      ] },
      { id: 'indented-code', title: 'Mit vier Leerstellen eingerückter Code', actions: [
        setup('    '), text('HAllo '), check('    HAllo '),
      ] },
      { id: 'markdown-target', title: 'Unvollständiges Markdown-Linkziel', actions: [
        setup('[Anzeige](pfad/'), text('HAllo '), check('[Anzeige](pfad/HAllo '), setup(')\n\n'),
      ] },
      { id: 'markdown-visible', title: 'Sichtbarer Markdown-Linktext bleibt korrigierbar', actions: [
        setup('['), text('TEst '), check('[Test '), setup('](target)\n\n'),
      ] },
      { id: 'wikilink-target', title: 'Wikilink-Ziel und sichtbarer Alias', actions: [
        setup('[['), text('HAllo '), check('[[HAllo ', 'Ziel bleibt unverändert'),
        setup('|'), text('TEst '), check('[[HAllo |Test ', 'Sichtbarer Alias'), setup(']]\n\n'),
      ] },
      { id: 'programmatic-word', title: 'Programmgesteuertes Wort plus getippte Leerstelle', actions: [
        setup('HAllo'), text(' '), check('HAllo '),
      ] },
      { id: 'edit-existing-word', title: 'Nur einen Buchstaben eines bestehenden Wortes ergänzen', actions: [
        setup('HAll'), text('o '), check('HAllo '),
      ] },
      { id: 'retry-third', title: 'Dritter identischer Versuch', actions: [
        text('HAllo '), check('Hallo ', 'Erster Versuch'), key('Backspace', 6), text('HAllo '),
        key('Backspace', 6), text('HAllo '), check(settings.respectRepeatedSpelling === false ? 'Hallo ' : 'HAllo ', 'Dritter Versuch'),
      ] },
      { id: 'same-word-elsewhere', title: 'Dasselbe Wort an einer anderen Position', actions: [
        text('HAllo HAllo '), check('Hallo Hallo '),
      ] },
      { id: 'pause-resume', title: 'Pause und Fortsetzen während der Eingabe', actions: [
        paused(true), text('HAllo '), check('HAllo ', 'Pausiert'), paused(false), text('TEst '), check('HAllo Test ', 'Fortgesetzt'),
      ] },
      { id: 'undo-redo', title: 'Undo und Redo der getippten Korrektur', actions: [
        text('HAllo '), check('Hallo ', 'Vor Undo'), { type: 'shortcut', value: 'undo' },
        check('', 'Nach einmal Undo'), { type: 'shortcut', value: 'redo' }, check('Hallo ', 'Nach Redo'),
      ] },
      { id: 'frontmatter-policy', title: 'Frontmatter-Ausschluss live ändern', actions: [
        { type: 'frontmatter', value: false }, text('HAllo '), check('HAllo ', 'Boolean false'),
        { type: 'frontmatter', value: 'false' }, text('SEcond '), check('HAllo Second ', 'String false'),
        { type: 'frontmatter', value: true }, text('TEst '), check('HAllo Second Test ', 'Boolean true'),
        { type: 'frontmatter', value: null }, text('AGain '), check('HAllo Second Test Again ', 'Frontmatter entfernt'),
      ] },
      ...((settings.exclusionList || []).filter(word => /^\p{Lu}\p{Lu}\p{Ll}[\p{L}\p{M}]*$/u.test(word)).slice(0, 3).map(word => ({
        id: 'exclusion-' + word, title: 'Konfigurierte Ausnahme: ' + word,
        actions: [text(word + ', '), check(word + ', ')],
      }))),
    ];
    const stress = config.includeStress ? [
      { id: 'perf-reference', title: 'Zeitmessung vor dem Lastaufbau', performance: true,
        actions: performanceActions('', config, 'Hallo ') },
      { id: 'perf-large-document', title: 'Deterministischer Markdown-Lasttext: ' + config.stressParagraphs + ' Abschnitte', performance: true,
        fixtureSeed: config.seed,
        actions: performanceActions(randomMarkdown(config.stressParagraphs, config.seed), config, 'Hallo ') },
      { id: 'perf-fences', title: 'Viele geschlossene Codeblöcke: ' + config.stressBlocks, performance: true,
        actions: performanceActions('~~~text\nHAllo TEst\n~~~\n\n'.repeat(config.stressBlocks), config, 'Hallo ') },
      { id: 'perf-supported-line', title: 'Lange Zeile innerhalb des Kontextbudgets', performance: true,
        actions: performanceActions('x'.repeat(2000) + ' ', config, 'Hallo ') },
      { id: 'perf-over-budget-line', title: 'Zeile über dem Kontextbudget: ' + config.longLineLength + ' Zeichen', performance: true,
        actions: performanceActions('x'.repeat(config.longLineLength) + ' ', config, 'HAllo ') },
      { id: 'after-stress', title: 'Normale kurze Zeile nach den Lasttests', actions: [text('HAllo '), check('Hallo ')] },
    ] : [];
    return [...(config.includeFunctional ? functional : []), ...stress];
  }

  const defaults = { characterDelayMs: 130, settleMs: 500, casePauseMs: 900, startDelayMs: 5000,
    performanceDelayMs: 40, stressSettleMs: 1500, includeFunctional: true, includeStress: true,
    comparePaused: true, stressParagraphs: 2000, stressBlocks: 300, longLineLength: 12000,
    performanceWords: 8, seed: 731 };
  function optionsFor(options = {}) {
    const merged = { ...defaults, ...options };
    for (const name of ['characterDelayMs', 'settleMs', 'casePauseMs', 'startDelayMs', 'performanceDelayMs', 'stressSettleMs']) {
      if (!Number.isFinite(merged[name]) || merged[name] < 0 || merged[name] > 60000) {
        throw new Error('Ungültige Zeitangabe: ' + name);
      }
    }
    for (const name of ['includeFunctional', 'includeStress', 'comparePaused']) {
      if (typeof merged[name] !== 'boolean') throw new Error('Ungültige Option: ' + name);
    }
    for (const [name, min, max] of [['stressParagraphs', 1, 20000], ['stressBlocks', 1, 3000],
      ['longLineLength', 4097, 200000], ['performanceWords', 1, 20], ['seed', 0, 0xffffffff]]) {
      if (!Number.isInteger(merged[name]) || merged[name] < min || merged[name] > max) throw new Error('Ungültige Option: ' + name);
    }
    return merged;
  }

  function summarizeMeasurements(samples) {
    const stats = values => {
      const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
      if (!sorted.length) return null;
      const at = fraction => +sorted[Math.floor((sorted.length - 1) * fraction)].toFixed(3);
      return { samples: sorted.length, p50: at(.5), p95: at(.95), max: at(1) };
    };
    return {
      sent: samples.length,
      trusted: samples.filter(sample => sample.trusted).length,
      withoutMatchedTransaction: samples.filter(sample => sample.appliedMs === undefined).length,
      sendToApplied: stats(samples.map(sample => sample.appliedMs)),
      wordBoundaryToApplied: stats(samples.filter(sample => /\s/u.test(sample.character)).map(sample => sample.appliedMs)),
      sendToNextFrame: stats(samples.map(sample => sample.nextFrameMs)),
      synchronousViewUpdate: stats(samples.map(sample => sample.viewUpdateMs)),
    };
  }

  async function runSuite(host, settings, options, control) {
    const config = optionsFor(options);
    const results = control.results || (control.results = []);
    const guard = () => {
      if (control.stopped) throw new Error('Abgebrochen: ' + (control.reason || 'Stop angefordert'));
      host.assertActive();
    };
    for (const item of cases(settings, config)) {
      guard();
      await host.beginCase(item);
      guard();
      if (item.skip) {
        const result = { id: item.id, title: item.title, status: 'SKIP', reason: item.skip };
        results.push(result); await host.report(result); continue;
      }
      for (const action of item.actions) {
        if (action.type === 'text') {
          if (host.phase) host.phase(action.measurement || 'functional');
          for (const character of action.value) {
            guard(); host.sendCharacter(character);
            await host.wait(action.measurement ? config.performanceDelayMs : config.characterDelayMs);
          }
        } else if (action.type === 'key') {
          for (let i = 0; i < action.count; i++) {
            guard(); host.sendKey(action.value);
            await host.wait(config.characterDelayMs);
          }
        } else if (action.type === 'setup' || action.type === 'patch') {
          guard(); await host[action.type](action);
          await host.wait(item.performance ? config.stressSettleMs : config.settleMs);
        } else if (action.type === 'pause') {
          guard(); await host.setPaused(action.value);
          await host.wait(config.settleMs);
        } else if (action.type === 'frontmatter' || action.type === 'shortcut') {
          guard(); await host[action.type](action.value);
          await host.wait(config.settleMs);
        } else {
          await host.wait(config.settleMs); guard();
          const actual = host.snapshot();
          const expected = Array.isArray(action.expected) ? action.expected : [action.expected];
          const status = action.info ? 'INFO' : expected.includes(actual) ? 'PASS' : 'FAIL';
          // INFO is a checkpoint, never a substitute for the final assertion.
          const result = { id: item.id, title: item.title, checkpoint: action.label,
            status, expected: action.expected, actual };
          if (host.metrics) result.metrics = host.metrics();
          results.push(result);
          host.checkpoint(result);
        }
      }
      guard();
      await host.report({ id: item.id, checkpoints: results.filter(result => result.id === item.id) });
      await host.wait(config.casePauseMs);
    }
    return results;
  }

  function nativeHost(app, control, config) {
    const nodeRequire = typeof require === 'function' ? require : root.require;
    if (!nodeRequire) throw new Error('Dieses Skript benötigt Obsidian Desktop mit Node-Zugriff.');
    let remote;
    try { remote = nodeRequire('@electron/remote'); }
    catch { remote = nodeRequire('electron').remote; }
    if (!remote?.getCurrentWebContents) throw new Error('Electron remote ist nicht verfügbar; keine direkte Editor-Injektion als Ersatz.');
    const contents = remote.getCurrentWebContents();
    if (typeof contents.sendInputEvent !== 'function') throw new Error('Electron sendInputEvent fehlt.');
    const plugin = app.plugins?.plugins?.['auto-correct-capitals'];
    if (!plugin?.settings) throw new Error('Auto Correct Capitals ist nicht aktiviert.');
    if (plugin.paused === true) throw new Error('Autokorrektur ist pausiert. Zuerst fortsetzen.');
    const settings = JSON.parse(JSON.stringify(plugin.settings));
    const events = [];
    const measurements = [], fixtures = [], frames = new Set();
    const now = () => root.performance.now();
    let pending, currentCase = '', phase = 'functional', droppedEvents = 0;
    let pauseTouched = false, lastPauseSet = false;
    let file, editor, view, start = 0, caseStart = 0, temporaryHeader = '', originalUpdate, wrappedUpdate, hadOwnUpdate;
    let escapeHandler, inputHandler;
    const observedKinds = ['beforeinput', 'input', 'keydown', 'keyup', 'compositionstart', 'compositionend'];
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const notePath = 'AutoCorrect-Live-Test-' + stamp + '-' + Math.random().toString(36).slice(2, 7) + '.md';
    const append = value => {
      const end = { line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length };
      editor.replaceRange(value, end);
      editor.setCursor({ line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length });
    };
    const log = event => {
      if (events.length < 15000) events.push({ time: Date.now(), case: currentCase, phase, ...event });
      else droppedEvents++;
    };
    const host = {
      settings, events, notePath,
      wait: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
      assertActive() {
        if (!view || app.workspace.getActiveFile()?.path !== file.path || !view.hasFocus || !contents.isFocused()) {
          throw new Error('Fokus oder Testnotiz gewechselt; keine weiteren Zeichen gesendet.');
        }
      },
      async prepare() {
        const metadata = { pluginVersion: plugin.manifest?.version, settings, testOptions: config,
          transport: 'Electron sendInputEvent; DOM events and final CodeMirror transactions observed',
          userAgent: root.navigator.userAgent };
        // Hash files on disk, not a claim about an already cached plugin module.
        try {
          const crypto = nodeRequire('crypto');
          const hash = value => crypto.createHash('sha256').update(value).digest('hex');
          metadata.installedBundleOnDisk = hash(await app.vault.adapter.read(app.vault.configDir + '/plugins/auto-correct-capitals/main.js'));
          const fs = nodeRequire('fs');
          const repositoryBundle = '/home/ummel/Projects/obsidian-auto-correct-capitals/main.js';
          if (fs.existsSync(repositoryBundle)) {
            metadata.repositoryBundle = hash(fs.readFileSync(repositoryBundle));
            metadata.bundleFilesMatch = metadata.repositoryBundle === metadata.installedBundleOnDisk;
          }
        } catch (error) { metadata.bundleComparison = String(error.message || error); }
        control.metadata = metadata;
        file = await app.vault.create(notePath,
          '# AutoCorrect Live-Test\n\n' +
          'Testzeichen werden einzeln über Electron gesendet. Überschriften und Berichte werden programmgesteuert eingefügt.\n\n' +
          'Escape oder Fokuswechsel bricht ab. PASS/FAIL bezieht sich auf die wirklich gelesene Testzeile.\n\n' +
          'Einstellungen und Bundle-Vergleich:\n```json\n' + JSON.stringify(metadata, null, 2) + '\n```\n');
        await app.workspace.getLeaf(false).openFile(file);
        for (let i = 0; i < 50; i++) {
          editor = app.workspace.activeEditor?.editor || app.workspace.activeLeaf?.view?.editor;
          view = editor?.cm;
          if (view?.contentDOM && app.workspace.getActiveFile()?.path === file.path) break;
          await host.wait(100);
        }
        if (!view?.contentDOM) throw new Error('Kein CodeMirror-Editor. Testnotiz im Bearbeitungsmodus öffnen.');
        originalUpdate = view.update;
        control.metadata.editorMode = app.workspace.activeLeaf?.view?.getMode?.() || null;
        control.metadata.editorClasses = view.dom?.closest('.markdown-source-view')?.className || null;
        hadOwnUpdate = Object.prototype.hasOwnProperty.call(view, 'update');
        wrappedUpdate = function (transactions) {
          const observed = pending;
          const relevant = transactions.some(tr => tr.docChanged && /^input/.test(tr.annotation(tr.constructor.userEvent) || ''));
          for (const tr of transactions) {
            if (!tr.docChanged) continue;
            const changes = [];
            tr.changes.iterChanges((from, to, fromNew, toNew, inserted) => {
              changes.push({ from, to, fromNew, toNew, inserted: inserted.sliceString(0, Math.min(inserted.length, 250)) });
            });
            log({ kind: 'transaction', userEvent: tr.annotation(tr.constructor.userEvent) || null, changes });
          }
          const updateStart = now();
          const returned = originalUpdate.apply(this, arguments);
          const appliedAt = now();
          if (observed && observed.inputAt !== undefined && observed.appliedMs === undefined && relevant) {
            observed.appliedMs = appliedAt - observed.sentAt;
            observed.viewUpdateMs = appliedAt - updateStart;
            observed.inputToAppliedMs = appliedAt - observed.inputAt;
            const frame = root.requestAnimationFrame(() => {
              frames.delete(frame); observed.nextFrameMs = now() - observed.sentAt;
            });
            frames.add(frame);
          }
          return returned;
        };
        view.update = wrappedUpdate;
        inputHandler = event => {
          if (pending && event.isTrusted && event.data === pending.character) {
            if (pending.inputAt === undefined) pending.inputAt = now();
            pending.trusted = true;
          }
          log({ kind: event.type, inputType: event.inputType || null,
            data: event.data, key: event.key, code: event.code,
            ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, metaKey: event.metaKey,
            isTrusted: event.isTrusted, isComposing: event.isComposing });
        };
        for (const kind of observedKinds) view.contentDOM.addEventListener(kind, inputHandler, true);
        escapeHandler = event => {
          if (event.key === 'Escape') { control.stopped = true; control.reason = 'Escape'; }
        };
        root.document.addEventListener('keydown', escapeHandler, true);
        console.log('AutoCorrect-Live-Test: Start in ' + config.startDelayMs / 1000 + ' Sekunden. Entwicklerwerkzeuge schließen. Testnotiz: ' + notePath);
        await host.wait(config.startDelayMs);
        if (control.stopped) throw new Error('Vor dem Start abgebrochen.');
        if (app.workspace.getActiveFile()?.path !== file.path) throw new Error('Testnotiz wurde vor dem Start verlassen.');
        remote.getCurrentWindow().focus(); contents.focus(); view.focus();
        await host.wait(250);
        host.assertActive();
      },
      async beginCase(item) {
        pending = undefined; currentCase = item.id; phase = 'functional';
        append('\n\n### ' + item.id + ': ' + item.title + '\n\n');
        start = view.state.doc.length;
        caseStart = start;
        // Give Obsidian's background parser time after programmatic headings.
        await host.wait(config.settleMs);
        log({ kind: 'case', id: item.id, start });
      },
      sendCharacter(character) {
        log({ kind: 'sent-char', character });
        pending = { case: currentCase, phase, character, sentAt: now(),
          documentCharacters: view.state.doc.length, documentLines: view.state.doc.lines };
        measurements.push(pending);
        contents.sendInputEvent({ type: 'char', keyCode: character });
      },
      sendKey(name, modifiers = []) {
        pending = undefined;
        log({ kind: 'sent-key', key: name, modifiers });
        contents.sendInputEvent({ type: 'keyDown', keyCode: name, modifiers });
        contents.sendInputEvent({ type: 'keyUp', keyCode: name, modifiers });
      },
      shortcut(name) {
        const modifiers = [nodeRequire('process').platform === 'darwin' ? 'meta' : 'control'];
        if (name === 'redo') modifiers.push('shift');
        host.sendKey('Z', modifiers);
      },
      frontmatter(value) {
        host.assertActive(); pending = undefined;
        if (!view.state.doc.sliceString(0, temporaryHeader.length).startsWith(temporaryHeader)) throw new Error('Test-Frontmatter wurde unerwartet verändert.');
        const header = value === null ? '' : '---\nauto-correct-capitals: ' + JSON.stringify(value) + '\n---\n\n';
        editor.replaceRange(header, { line: 0, ch: 0 }, editor.offsetToPos(temporaryHeader.length));
        const delta = header.length - temporaryHeader.length;
        start += delta; caseStart += delta; temporaryHeader = header;
        editor.setCursor({ line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length });
        log({ kind: 'frontmatter-fixture', value });
      },
      phase(value) { pending = undefined; phase = value; },
      async setup(action) {
        host.assertActive(); pending = undefined;
        const before = now(); append(action.value);
        fixtures.push({ case: currentCase, phase, characters: action.value.length,
          synchronousInsertMs: now() - before, documentCharacters: view.state.doc.length,
          documentLines: view.state.doc.lines });
        if (action.omit) start = view.state.doc.length;
      },
      async patch(action) {
        host.assertActive(); pending = undefined;
        const from = caseStart + action.from, to = caseStart + action.to;
        if (from < caseStart || to < from || to > view.state.doc.length) throw new Error('Ungültiger Fixture-Patch.');
        editor.replaceRange(action.value, editor.offsetToPos(from), editor.offsetToPos(to));
        editor.setCursor({ line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length });
        log({ kind: 'fixture-patch', from, to, inserted: action.value });
      },
      async setPaused(value) {
        pending = undefined;
        if (typeof plugin.paused !== 'boolean') throw new Error('Pause-Zustand ist in diesem Build nicht verfügbar.');
        if (plugin.paused !== value) {
          pauseTouched = true; lastPauseSet = value;
          app.commands.executeCommandById('auto-correct-capitals:toggle-auto-correction');
          if (plugin.paused !== value) throw new Error('Pause-Befehl konnte nicht ausgeführt werden.');
        }
      },
      metrics() { return summarizeMeasurements(measurements.filter(sample => sample.case === currentCase && sample.phase === phase)); },
      snapshot: () => start <= view.state.doc.length ? view.state.doc.sliceString(start)
        : '[Testgrenze durch Undo entfernt; Rohereignisse prüfen]',
      checkpoint: result => console.log('AutoCorrect-Live-Test', result),
      async report(result) {
        host.assertActive();
        pending = undefined;
        const checks = result.checkpoints || [result];
        append('\n\n' + checks.map(checkpoint =>
          checkpoint.status === 'SKIP' ? 'SKIP: ' + checkpoint.reason :
            checkpoint.status + ' — ' + checkpoint.checkpoint + '\n\n' +
            'Soll (JSON): ' + JSON.stringify(checkpoint.expected) + '\n\n' +
            'Ist (JSON): ' + JSON.stringify(checkpoint.actual) +
            (checkpoint.metrics ? '\n\nMessung (ms): ' + JSON.stringify(checkpoint.metrics) : '')).join('\n\n') + '\n');
      },
      async finish(results, error) {
        const counts = Object.fromEntries(['PASS', 'FAIL', 'INFO', 'SKIP'].map(status =>
          [status, results.filter(result => result.status === status).length]));
        const trustedInputEvents = events.filter(event => event.kind === 'input' && event.isTrusted).length;
        pending = undefined;
        const performanceCases = {};
        for (const sample of measurements) {
          const key = sample.case + '/' + sample.phase;
          if (!performanceCases[key]) performanceCases[key] = [];
          performanceCases[key].push(sample);
        }
        const timings = Object.fromEntries(Object.entries(performanceCases).map(([name, samples]) => [name, summarizeMeasurements(samples)]));
        const report = { metadata: control.metadata, notePath, counts, trustedInputEvents, droppedEvents,
          error: error ? String(error.message || error) : null, results, events, measurements, timings, fixtures,
          timingScope: 'sendInputEvent to first input transaction applied and next requestAnimationFrame opportunity; includes IPC, scheduling, all plugins and synchronous view work; not plugin-exclusive CPU or physical paint' };
        control.report = report;
        // Persist diagnostics even after focus changes, without editing another
        // open file or stealing focus back. create() never overwrites a file.
        const logPath = notePath.replace(/\.md$/, '-events.json');
        await app.vault.create(logPath, JSON.stringify(report, null, 2));
        control.logPath = logPath;
        if (view && app.workspace.getActiveFile()?.path === file.path && view.hasFocus) {
          append('\n\n## Gesamtergebnis\n\n' + JSON.stringify(counts) + '\n\n' +
            'Vertrauenswürdige Chromium-input-Ereignisse: ' + trustedInputEvents + '\n\n' +
            (error ? 'ABBRUCH: ' + report.error + '\n\n' : '') +
            'Diagnose: ' + logPath + '\n');
        }
        console.log('AutoCorrect-Live-Test beendet', report);
      },
      cleanup() {
        for (const frame of frames) root.cancelAnimationFrame(frame);
        frames.clear();
        if (view?.update === wrappedUpdate) {
          if (hadOwnUpdate) view.update = originalUpdate;
          else delete view.update;
        }
        if (view && inputHandler) {
          for (const kind of observedKinds) view.contentDOM.removeEventListener(kind, inputHandler, true);
        }
        if (escapeHandler) root.document.removeEventListener('keydown', escapeHandler, true);
        if (pauseTouched && plugin.paused === lastPauseSet && plugin.paused !== false) {
          try { app.commands.executeCommandById('auto-correct-capitals:toggle-auto-correction'); }
          catch (error) { console.warn('Pause-Zustand konnte nicht wiederhergestellt werden:', error); }
        }
      },
    };
    return host;
  }

  // Node imports expose only the driver for automated tests; no native input.
  if (!root.document || !root.app) {
    if (typeof module !== 'undefined') module.exports = { cases, optionsFor, runSuite, randomMarkdown, summarizeMeasurements };
    return;
  }
  if (root.AutoCorrectLiveTest?.running) throw new Error('Ein Live-Test läuft bereits. Erst AutoCorrectLiveTest.stop() aufrufen.');
  const control = { running: true, stopped: false, results: [],
    stop() { this.stopped = true; this.reason = 'Stop angefordert'; } };
  root.AutoCorrectLiveTest = control;
  control.promise = (async () => {
    let host, error;
    try {
      const config = optionsFor(root.AutoCorrectLiveTestOptions);
      host = nativeHost(root.app, control, config);
      await host.prepare();
      control.results = await runSuite(host, host.settings, config, control);
    } catch (caught) { error = caught; console.error('AutoCorrect-Live-Test:', caught); }
    finally {
      try { if (host) await host.finish(control.results, error); }
      finally { if (host) host.cleanup(); control.running = false; }
    }
    return control.report;
  })();
})(globalThis);

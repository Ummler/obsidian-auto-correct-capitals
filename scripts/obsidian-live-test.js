/*
 * Run in Obsidian desktop's developer console:
 * eval(require('fs').readFileSync('/home/ummel/Projects/obsidian-auto-correct-capitals/scripts/obsidian-live-test.js', 'utf8'))
 *
 * Creates a NEW note. Tested characters go through Electron sendInputEvent,
 * never editor.replaceRange or an annotated CodeMirror dispatch. Only headings
 * and reports use programmatic insertion. Escape or changing focus stops input.
 * Native execution is separate from this script's automated driver tests.
 */
(function (root) {
  'use strict';
  const text = value => ({ type: 'text', value });
  const key = (value, count = 1) => ({ type: 'key', value, count });
  const check = (expected, label = 'Abschluss', info = false) => ({ type: 'check', expected, label, info });

  function cases(settings) {
    return [
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
    ];
  }

  const defaults = { characterDelayMs: 130, settleMs: 500, casePauseMs: 900, startDelayMs: 5000 };
  function optionsFor(options = {}) {
    const merged = { ...defaults, ...options };
    for (const name of Object.keys(defaults)) {
      if (!Number.isFinite(merged[name]) || merged[name] < 0 || merged[name] > 60000) {
        throw new Error('Ungültige Zeitangabe: ' + name);
      }
    }
    return merged;
  }

  async function runSuite(host, settings, options, control) {
    const config = optionsFor(options);
    const results = control.results || (control.results = []);
    const guard = () => {
      if (control.stopped) throw new Error('Abgebrochen: ' + (control.reason || 'Stop angefordert'));
      host.assertActive();
    };
    for (const item of cases(settings)) {
      guard();
      await host.beginCase(item);
      guard();
      if (item.skip) {
        const result = { id: item.id, title: item.title, status: 'SKIP', reason: item.skip };
        results.push(result); await host.report(result); continue;
      }
      for (const action of item.actions) {
        if (action.type === 'text') {
          for (const character of action.value) {
            guard(); host.sendCharacter(character);
            await host.wait(config.characterDelayMs);
          }
        } else if (action.type === 'key') {
          for (let i = 0; i < action.count; i++) {
            guard(); host.sendKey(action.value);
            await host.wait(config.characterDelayMs);
          }
        } else {
          await host.wait(config.settleMs); guard();
          const actual = host.snapshot();
          const expected = Array.isArray(action.expected) ? action.expected : [action.expected];
          const status = action.info ? 'INFO' : expected.includes(actual) ? 'PASS' : 'FAIL';
          // INFO is a checkpoint, never a substitute for the final assertion.
          const result = { id: item.id, title: item.title, checkpoint: action.label,
            status, expected: action.expected, actual };
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
    let file, editor, view, start = 0, originalUpdate, wrappedUpdate, hadOwnUpdate;
    let escapeHandler, inputHandler;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const notePath = 'AutoCorrect-Live-Test-' + stamp + '-' + Math.random().toString(36).slice(2, 7) + '.md';
    const append = value => {
      const end = { line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length };
      editor.replaceRange(value, end);
      editor.setCursor({ line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length });
    };
    const log = event => {
      if (events.length < 15000) events.push({ time: Date.now(), ...event });
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
        const metadata = { pluginVersion: plugin.manifest?.version, settings,
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
        hadOwnUpdate = Object.prototype.hasOwnProperty.call(view, 'update');
        wrappedUpdate = function (transactions) {
          for (const tr of transactions) {
            if (!tr.docChanged) continue;
            const changes = [];
            tr.changes.iterChanges((from, to, fromNew, toNew, inserted) => {
              changes.push({ from, to, fromNew, toNew, inserted: inserted.toString().slice(0, 250) });
            });
            log({ kind: 'transaction', userEvent: tr.annotation(tr.constructor.userEvent) || null, changes });
          }
          return originalUpdate.apply(this, arguments);
        };
        view.update = wrappedUpdate;
        inputHandler = event => log({ kind: event.type, inputType: event.inputType || null,
          data: event.data, isTrusted: event.isTrusted, isComposing: event.isComposing });
        for (const kind of ['beforeinput', 'input']) view.contentDOM.addEventListener(kind, inputHandler, true);
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
        append('\n\n### ' + item.id + ': ' + item.title + '\n\n');
        start = view.state.doc.length;
        // Give Obsidian's background parser time after programmatic headings.
        await host.wait(config.settleMs);
        log({ kind: 'case', id: item.id, start });
      },
      sendCharacter(character) {
        log({ kind: 'sent-char', character });
        contents.sendInputEvent({ type: 'char', keyCode: character });
      },
      sendKey(name) {
        log({ kind: 'sent-key', key: name });
        contents.sendInputEvent({ type: 'keyDown', keyCode: name });
        contents.sendInputEvent({ type: 'keyUp', keyCode: name });
      },
      snapshot: () => view.state.doc.sliceString(start),
      checkpoint: result => console.log('AutoCorrect-Live-Test', result),
      async report(result) {
        host.assertActive();
        const checks = result.checkpoints || [result];
        append('\n\n' + checks.map(checkpoint =>
          checkpoint.status === 'SKIP' ? 'SKIP: ' + checkpoint.reason :
            checkpoint.status + ' — ' + checkpoint.checkpoint + '\n\n' +
            'Soll (JSON): ' + JSON.stringify(checkpoint.expected) + '\n\n' +
            'Ist (JSON): ' + JSON.stringify(checkpoint.actual)).join('\n\n') + '\n');
      },
      async finish(results, error) {
        const counts = Object.fromEntries(['PASS', 'FAIL', 'INFO', 'SKIP'].map(status =>
          [status, results.filter(result => result.status === status).length]));
        const trustedInputEvents = events.filter(event => event.kind === 'input' && event.isTrusted).length;
        const report = { metadata: control.metadata, notePath, counts, trustedInputEvents,
          error: error ? String(error.message || error) : null, results, events };
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
        if (view?.update === wrappedUpdate) {
          if (hadOwnUpdate) view.update = originalUpdate;
          else delete view.update;
        }
        if (view && inputHandler) {
          for (const kind of ['beforeinput', 'input']) view.contentDOM.removeEventListener(kind, inputHandler, true);
        }
        if (escapeHandler) root.document.removeEventListener('keydown', escapeHandler, true);
      },
    };
    return host;
  }

  // Node imports expose only the driver for automated tests; no native input.
  if (!root.document || !root.app) {
    if (typeof module !== 'undefined') module.exports = { cases, optionsFor, runSuite };
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

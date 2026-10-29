# Sichtbarer Obsidian-Testlauf

## Start

1. Obsidian Desktop öffnen und den aktuellen Plugin-Build aktivieren. Nach einem
   Austausch von `main.js` das Plugin deaktivieren und wieder aktivieren.
2. Für die optionalen Tests **Capitalize list items** und **Capitalize sentences**
   einschalten. Die Abkürzung `i.e.` muss hinterlegt sein. Das Skript ändert keine
   Einstellungen; nicht passende Tests erscheinen als `SKIP`.
   `HAllo`, `TEst`, `hallo` und `ÆØble` sollten für diese Standardfälle nicht in
   der Ausnahmeliste stehen. Die Einstellungen werden im Bericht mitgespeichert.
3. Mit `Ctrl+Shift+I` die Entwicklerwerkzeuge öffnen und **Console** auswählen.
4. Diesen Befehl ausführen:

   ```js
   eval(require('fs').readFileSync('/home/ummel/Projects/obsidian-auto-correct-capitals/scripts/obsidian-live-test.js', 'utf8'))
   ```

5. Die Entwicklerwerkzeuge innerhalb von fünf Sekunden mit `Ctrl+Shift+I`
   schließen. Das Skript öffnet eine neue Notiz und tippt anschließend sichtbar.
   Im Editor bleiben und nicht parallel tippen. Der erweiterte Standardlauf dauert ungefähr
   vier bis sechs Minuten, abhängig von Einstellungen und Systemlast. Zuerst im Quellmodus, danach separat in Live Preview testen.

Wenn der Flatpak-Dateizugriff den Dateipfad nicht zulässt, den vollständigen Inhalt
von `scripts/obsidian-live-test.js` in die Entwicklerkonsole kopieren.

## Beobachtung und Abbruch

- Jeder Test steht in einem eigenen Abschnitt unter dem vorigen Test.
- Die Eingabe erfolgt mit 130 ms Abstand pro Unicode-Zeichen; nach dem
  Wortabschluss wartet der Test 500 ms, bevor der Ist-Text gelesen wird.
- Soll und Ist werden als JSON notiert, damit Leerzeichen und Zeilenumbrüche
  sichtbar bleiben. `FAIL` wird protokolliert und stoppt nicht die übrigen Fälle.
- `HAllo,` hat einen informativen Zwischenstand: Der aktuelle Entwurf darf die
  Korrektur bis zur Leerstelle aufschieben. Nach `HAllo, ` gilt zwingend `Hallo, `.
- Der Cursorfall wird mit einer und zwei vorhandenen Leerstellen geprüft.
  Das unvollständige alte `HAllo` rechts vom Cursor soll unverändert bleiben.
- **Escape** bricht ab. Fokus- oder Dateiwechsel stoppt ebenfalls die Eingabe.
  In der Konsole ist auch `AutoCorrectLiveTest.stop()` möglich.
- Ein neuer Aufruf erzeugt eine neue Notiz. Vorhandene Notizen werden nicht
  überschrieben oder gelöscht. Ein zweiter gleichzeitiger Lauf wird abgewiesen.

Geschwindigkeit vor dem Start optional setzen:

```js
window.AutoCorrectLiveTestOptions = {
  characterDelayMs: 180,
  settleMs: 700,
  casePauseMs: 1200,
  startDelayMs: 8000
};
```

## Eingabeweg und Diagnose

Testtext wird über Electrons `webContents.sendInputEvent` als einzelne `char`-
Ereignisse gesendet. Cursorbewegungen, Löschen und Enter verwenden echte
Electron-Tastenereignisse. Es gibt keine direkten Editor-Ersetzungen oder
erfundenen `input.type`-Annotationen für den Testtext. Abschnittstitel, Ergebnisberichte und ausdrücklich als Fixture markierte
Kontext-/Lasttexte werden programmgesteuert eingefügt. Die eigentlichen
Prüfwörter kommen weiterhin ausschließlich über Electron-Zeichenereignisse.

Der Test erfasst `beforeinput`/`input` sowie Tastatur- und Kompositionsereignisse mit `inputType`, `isTrusted`,
`isComposing` und Modifikatortasten sowie die tatsächlich angewendeten CodeMirror-Transaktionen mit
ihrem `userEvent`. Eine vorübergehende Beobachtungsfunktion leitet `view.update`
unverändert weiter und wird im `finally` wieder entfernt; DOM-Listener ebenso.

Im Vault entstehen eine `AutoCorrect-Live-Test-…md` und eine passende
`…-events.json`. Die Diagnose enthält ausschließlich die Testeingaben,
Plugin-Einstellungen und Umgebungsinformationen; es gibt keine Übertragung.
Der optionale SHA256-Vergleich prüft die Plugin-Datei **auf dem Datenträger**
gegen `main.js` im Repository. Er beweist nicht, dass ein bereits geladenes
Plugin nach dem Kopieren neu geladen wurde.

Der Aufruf benötigt das von Obsidian Desktop bereitgestellte `@electron/remote`.
Das Paket ist in der hier installierten Obsidian-Flatpak-Ausgabe vorhanden. Falls
die Laufzeit den Zugriff verweigert, bricht das Skript ab; es wechselt nicht zu
direkten Editor-Schreibzugriffen als Ersatz. Die native Ausführung des Skripts
wurde vom Implementierungsagenten nicht als erfolgreich bestätigt.

Die Automatisierung testet den Chromium/Electron-Eingabeweg, keine physischen
Tastenschalter, Betriebssystem-Tastaturlayouts oder echte IME-/Mobil-Eingaben.
Obsidian-Autopaarung und andere Plugins können das beobachtete Ergebnis ebenfalls
beeinflussen; deshalb bleiben die Rohereignisse für die Auswertung erhalten.

Referenz: [Electron sendInputEvent](https://www.electronjs.org/docs/latest/api/web-contents#contentssendinputeventinputevent),
[@electron/remote](https://github.com/electron/remote#remotegetcurrentwebcontents).

## Zusätzliche Funktionsfälle

- Fenced Code mit drei/vier Backticks, Sprachangabe und Tilden; Kontrolle sowohl
  innerhalb als auch nach dem Block. Ein kürzerer Fence darf nicht schließen.
- Einen Abschluss-Fence oberhalb des Cursors programmgesteuert entfernen und
  wieder einsetzen, anschließend jeweils ein Wort tatsächlich tippen.
- Display-Mathematik, eingerückter Code und Wortabschlüsse **innerhalb** offener
  Inline-Code-/Mathematikbereiche. Nur vor dem Schließzeichen stehen zu bleiben
  wäre kein aussagekräftiger Schutztest.
- Unvollständiges Markdown-Ziel, Wikilink-Ziel und sichtbarer Alias.
- Sichtbarer Markdown-Linktext, kyrillischer Satzanfang sowie längenändernde
  Großschreibung (`ßeta` → `SSeta`) mit anschließender weiterer Eingabe.
- Bereits eingefügtes Wort versus vollständig neu getipptes Wort.
- Dritter Schreibversuch, gleicher Fehler an anderer Position und konfigurierte
  Ausnahmen wie `PRs`/`MRs`, wenn deren Groß-/Kleinschreibung sonst geändert würde.
- Pause/Fortsetzen sowie echte Undo-/Redo-Tastenkombinationen. Falls Undo auch
  eine Testüberschrift entfernt, wird dies als fehlgeschlagene Testgrenze
  ausgewiesen; Redo und die weiteren Tests werden trotzdem versucht.
- In der **neu erstellten Testnotiz** temporär echte Frontmatter am Dateianfang
  setzen: Boolean `false`, String `"false"`, Boolean `true`, anschließend entfernen.
  Bei Abbruch kann die temporäre Frontmatter in dieser Testnotiz stehen bleiben.

Der Pause-Befehl verändert nur den Sitzungszustand und wird nach dem Test,
auch bei Abbruch, nach Möglichkeit wieder auf den anfänglichen aktiven Zustand
zurückgesetzt. Einstellungen werden nicht dauerhaft geändert.

## Lastaufbau und Laufzeitmessung

Standardmäßig folgen nach den Funktionsfällen:

1. Referenzmessung vor dem Lastaufbau.
2. 2.000 reproduzierbar erzeugte Markdown-Abschnitte (Seed 731: rund 222.000
   UTF-16-Zeichen, 8.300 Zeilen), gemischt aus Fließtext, Überschriften, Listen,
   Zitaten, Links sowie korrekt geschlossenen Code- und Mathematikblöcken.
3. 300 zusätzliche geschlossene Codeblöcke.
4. Eine Zeile mit 2.000 Zeichen, in der Korrektur weiterhin erwartet wird.
5. Eine Zeile mit 12.000 Zeichen. Hier muss das Plugin wegen seines dokumentierten
   4.096-Zeichen-Budgets die Korrektur auslassen. Das ist kein Korrekturfehler.
6. Eine kurze Zeile danach, in der die Korrektur wieder funktionieren muss.

Große Fixtures werden einmal eingefügt. Die Zeit dafür steht separat unter
`fixtures[].synchronousInsertMs`; sie schließt nicht die gesamte spätere
Hintergrundanalyse ein. Danach wird gewartet und pro Messphase werden acht
Prüfwörter mit 40 ms Abstand pro Zeichen getippt. Damit wird das Verhalten in
einem großen Dokument untersucht, ohne minutenlang Fülltext einzutippen.

Die Messungen erscheinen an den Prüfpunkten sowie in der JSON-Datei:

- `sendToApplied`: Electron-Sendezeitpunkt bis zur ersten passenden angewendeten
  Eingabetransaktion, mit Median, p95 und Maximum.
- `wordBoundaryToApplied`: dieselbe Messung nur für Wortabschluss-Leerstellen.
- `sendToNextFrame`: Zeit bis zur nächsten beobachteten `requestAnimationFrame`-
  Gelegenheit. Das beweist keinen physischen Bildschirm-Paint.
- `synchronousViewUpdate`: beobachtete Dauer von `view.update`; die vorherige
  Transaktionskonstruktion/Filterung ist darin nicht vollständig enthalten.
- `withoutMatchedTransaction`: gesendete Zeichen ohne passende beobachtete
  Transaktion. Dafür werden keine Latenzwerte erfunden.
- `measurements`: Einzelwerte mit Fall, Phase und tatsächlicher Dokumentgröße.

Aktive und pausierte Phasen werden getrennt erfasst. Bei langen Zeilen beginnt
auch die pausierte Vergleichsphase auf einer entsprechend langen Zeile.
**Pausiert ist nicht deinstalliert:** Die Zustandsfelder des Plugins bleiben
registriert. Der Vergleich isoliert weder die gesamte Plugin-CPU-Zeit noch
anderen Plugin-/Rendering-Aufwand. Zeitwerte sind informativ; `PASS` bewertet
nur den erwarteten Text, nicht die Einhaltung eines Leistungsgrenzwertes.
Wenige Stichproben, Instrumentierung, Parserzustand und Systemlast begrenzen die
Aussagekraft. Für belastbare Vergleiche denselben Lauf mehrfach in Source und
Live Preview wiederholen. Ein Vergleich ohne Plugin erfolgt mit dem unten beschriebenen Baseline-Modus.

Nur Lasttests ausführen oder den Umfang anpassen:

```js
window.AutoCorrectLiveTestOptions = {
  includeFunctional: false,
  includeStress: true,
  comparePaused: true,
  stressParagraphs: 2000,
  stressBlocks: 300,
  longLineLength: 12000,
  performanceWords: 8,
  performanceDelayMs: 40,
  stressSettleMs: 1500,
  seed: 731
};
```

Nur Funktionsfälle: `window.AutoCorrectLiveTestOptions = { includeStress: false };`
Danach jeweils denselben Startbefehl wie oben ausführen. Neue Optionswerte gelten
für den nächsten Lauf; laufende Tests bleiben unverändert.

## Weiterhin nicht durch diesen Lauf abgedeckt

- Echte Zwischenablage/Paste, Drag-and-drop und jede konkrete Template- oder
  Completion-Erweiterung. Programmgesteuerte Fixtures sind kein Ersatz dafür.
- Physische Tastatur, reale IME, mobile Tastaturen, Diktat und Wischschreiben.
- Ordnerausschlüsse, Dateiumbenennung und mehrere gleichzeitig geöffnete Editor-
  Ansichten. Der Lauf bleibt absichtlich in genau seiner neuen Testnotiz.
- Fehlerhafte/übermäßig große YAML-Header sowie beliebige Markdown-Randfälle.
- Wiederholtes echtes Entladen/Laden des Plugins und die Mindestversion 1.5.7.
- Isolierte Plugin-CPU-/Speichermessung oder ein Vergleich nach Deaktivierung
  aller übrigen Plugins.

Die Fehlerfälle für Cursor und Enter bleiben unverändert als Abnahmekriterien erhalten.
Der lokale Plugin-Code wurde korrigiert; ihre native Abnahme steht noch aus.

## Kompakte Auswertung zum Kopieren

Die ursprüngliche Testnotiz (oder ihre `-events.json`) öffnen und in der
Obsidian-Entwicklerkonsole ausführen:

```js
eval(require('fs').readFileSync('/home/ummel/Projects/obsidian-auto-correct-capitals/scripts/obsidian-compact-report.js', 'utf8'))
```

Das Skript liest die zugehörige strukturierte Diagnose und öffnet eine neue
`…-Auswertung-….md`. Originalnotiz und JSON bleiben unverändert. Die neue Notiz
enthält Gesamtzahlen, Einstellungen, fehlgeschlagene Prüfungen, Laufzeitwerte
einschließlich Dokumentgrößen sowie bis zu 32 Eingabeereignisse und 16 zusätzliche Korrekturentscheidungen pro fehlgeschlagenem Prüfpunkt.
Bestandene Testtexte, Fülltext und nicht zu Fehlern gehörende Rohereignisse
entfallen. Laufzeitwerte bleiben auch bei bestandenem Texttest erhalten.

Entwicklerkonsole schließen, in der neuen Notiz alles markieren und kopieren.
Es wird nichts automatisch in die Zwischenablage oder ins Netzwerk geschrieben.

## Neue Diagnose und erneute Abnahme

Der aktuelle Build stellt `observeCorrections()` bereit. Der Treiber registriert
sich nur für den Lauf und entfernt den Beobachter beim Aufräumen. Ohne Beobachter
werden keine Diagnoseobjekte aufgebaut. Entscheidungen enthalten Positionen,
Dokumentgröße und Gründe, keine Worttexte. Die Rohereignisse des Testtreibers
enthalten weiterhin die Testeingaben.

`syntax-pending` belegt fehlende Syntaxabdeckung. Das Plugin wartet ohne erzwungene
Analyse oder Polling auf Parserfortschritt, höchstens 400 ms und nur solange Text,
Auswahl, Datei und Einstellungen unverändert bleiben. `applied-after-parse` zeigt
eine nachgeholte Korrektur; `pending-cancelled-edit` eine durch weitere Eingabe
verworfene Vormerkung. Ein unbelegter Verdacht gilt damit nicht als behobener
nativer Fehler. Zeitlich verzögerte Korrekturen behalten die ursprüngliche
Eingabezeit für CodeMirrors Standard-Undo-Gruppierung; fremde History-Konfigurationen
müssen separat geprüft werden.

Prüfpunkte speichern Phase, Zeitpunkt und Ereignisintervall. Die kompakte
Auswertung verwendet dieses Intervall, erhält Anfang und Ende und zusätzliche
Korrekturentscheidungen. Bei älteren Diagnosen wird ein fehlgeschlagener
`Aktiv`-Prüfpunkt gezielt der aktiven Phase zugeordnet.

Nach Installation des neuen `main.js` und erneutem Laden des Plugins:

1. Im echten Quellmodus den vollständigen Lauf ausführen:

   ```js
   window.AutoCorrectLiveTestOptions = { expectedEditorMode: 'source' };
   eval(require('fs').readFileSync('/home/ummel/Projects/obsidian-auto-correct-capitals/scripts/obsidian-live-test.js', 'utf8'));
   ```

2. Live Preview einschalten und mit `expectedEditorMode: 'live-preview'` wiederholen.
   Der Treiber bricht bei falschem Modus ab; Obsidian meldet beide Modi häufig
   als `source`, deshalb wird zusätzlich die tatsächliche CSS-Klasse geprüft.
3. Für den Leistungs-Vergleich pro Modus jeweils drei aktive und drei vollständig
   deaktivierte Läufe abwechselnd durchführen. Gleiche Optionen, übrige Plugins
   und Systemlast verwenden. Aktiv mit eingeschaltetem Plugin:

   ```js
   window.AutoCorrectLiveTestOptions = {
     includeFunctional: false, comparePaused: false,
     pluginDisabled: false, expectedEditorMode: 'source'
   };
   eval(require('fs').readFileSync('/home/ummel/Projects/obsidian-auto-correct-capitals/scripts/obsidian-live-test.js', 'utf8'));
   ```

4. Plugin in Obsidian vollständig deaktivieren. Danach dieselbe Ausführung mit
   `pluginDisabled: true` starten. Der Treiber verweigert diesen Baseline-Modus,
   solange die Plugin-Instanz geladen ist. Es werden nur Lastfälle ohne
   Pause-Befehl ausgeführt; unkorrigierter Text wird ausdrücklich erwartet.
   Für Live Preview jeweils `expectedEditorMode: 'live-preview'` setzen.
5. Nach den Baseline-Läufen das Plugin wieder aktivieren. Der Treiber ändert den
   Aktivierungszustand selbst nicht. Die JSON-Dateien behalten alle Einzelwerte,
   Größen und fehlenden Messzuordnungen. Median/p95 und Wortabschlusszeiten nur
   zwischen vergleichbaren Läufen bewerten, nicht aus `PASS` ableiten.

Der Treiber läuft weiterhin ausschließlich lokal. Diese Dokumentation bestätigt
keine bereits ausgeführte native Abnahme.

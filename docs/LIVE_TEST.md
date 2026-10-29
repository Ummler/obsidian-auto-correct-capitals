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
   Im Editor bleiben und nicht parallel tippen. Der Standardlauf dauert ungefähr
   zwei Minuten. Zuerst im Quellmodus, danach separat in Live Preview testen.

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
erfundenen `input.type`-Annotationen für den Testtext. Nur Abschnittstitel und
Ergebnisberichte werden programmgesteuert eingefügt.

Der Test erfasst `beforeinput`/`input` mit `inputType`, `isTrusted` und
`isComposing` sowie die tatsächlich angewendeten CodeMirror-Transaktionen mit
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

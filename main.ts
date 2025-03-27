import { Plugin, PluginSettingTab, Setting, Editor, MarkdownView } from 'obsidian';

// Globale Konstanten – diese werden nur einmal definiert
const TRIGGER_CHARS: string[] = [' ', '.', ',', ';', ':', '!', '?', '{', '"', ')', ']', '%', '}'];
const LAST_WORD_REGEX: RegExp = /[\p{L}\p{M}']+(?=\W*$)/u;
const LIST_ITEM_REGEX: RegExp = /^- (\S+)/;

interface AutoCorrectSettings {
	exclusionList: string[];
	capitalizeListItem: boolean;
}

const DEFAULT_SETTINGS: AutoCorrectSettings = {
	exclusionList: [],
	capitalizeListItem: false
};

export default class AutoCorrectPlugin extends Plugin {
	settings: AutoCorrectSettings;
	private lastReplacement: { position: CodeMirror.Position; originalChar: string; replacedChar: string } | null = null;
	private isReplacing: boolean = false;
	private lastKeyWasEnter: boolean = false;

	async onload() {
		console.log('Loading AutoCorrectPlugin');

		await this.loadSettings();
		this.addSettingTab(new AutoCorrectSettingTab(this.app, this));

		// Registriere den keydown-Listener im Capture-Modus, damit er vor dem editor-change-Event ausgeführt wird.
		this.app.workspace.containerEl.addEventListener('keydown', (evt: KeyboardEvent) => {
			if (evt.key === "Enter") {
				this.lastKeyWasEnter = true;
			}
		}, true);

		this.registerEvent(
			this.app.workspace.on('editor-change', (editor: Editor) => {
				const doc = editor.getDoc();
				let cursor = doc.getCursor();
				let currentLineNumber = cursor.line;
				let line: string;
				let lineUpToCursor: string;

				const wasEnter = this.lastKeyWasEnter;
				if (wasEnter && currentLineNumber > 0) {
					currentLineNumber = currentLineNumber - 1;
					line = doc.getLine(currentLineNumber);
					lineUpToCursor = line;
					//console.log(`Debug: Enter erkannt. Verwende vorherige Zeile ${currentLineNumber}: "${lineUpToCursor}"`);
				} else {
					line = doc.getLine(currentLineNumber);
					lineUpToCursor = line.substring(0, cursor.ch);
					//console.log(`Debug: Aktuelle Zeile ${currentLineNumber}: "${lineUpToCursor}"`);
				}
				// Flag zurücksetzen
				this.lastKeyWasEnter = false;

				// Frühe Abbruchbedingung: Leere Zeile
				if (lineUpToCursor.length === 0) {
					return;
				}

				if (this.settings.capitalizeListItem && line.trim().startsWith("- ") &&
					(wasEnter || TRIGGER_CHARS.includes(lineUpToCursor.slice(-1)))) {
					const listItemMatch = line.match(LIST_ITEM_REGEX);
					if (listItemMatch) {
						const listWord = listItemMatch[1];
						const wordStart = line.indexOf(listWord);
						//console.log(`Debug: Letztes Listenelement: "${listWord}" (ab Position ${wordStart})`);
						// Frühe Abbruchbedingung: Wenn das Wort nicht bereits mit einem Großbuchstaben beginnt, 
						if (listWord[0] !== listWord[0].toUpperCase()) {
							const newWord = listWord[0].toUpperCase() + listWord.slice(1);
							doc.replaceRange(newWord, { line: currentLineNumber, ch: wordStart }, { line: currentLineNumber, ch: wordStart + listWord.length });
							//console.log(`Debug: Capitalize List Item: "${listWord}" -> "${newWord}"`);
						}
						if (listWord.length >= 3 &&
							(listWord[0] === listWord[0].toUpperCase()) &&
							(listWord[1] === listWord[1].toUpperCase()) &&
							(listWord[2] === listWord[2].toLowerCase())
						) {
							const start = wordStart + 1;
							const end = wordStart + 2;
							const replacedChar = listWord[1].toLowerCase();
							doc.replaceRange(replacedChar, { line: currentLineNumber, ch: start }, { line: currentLineNumber, ch: end });
							//console.log(`Debug: Autocorrect in List Item: "${listWord[1]}" -> "${replacedChar}"`);
						}
					}
					return; 
				}

				const trigger = wasEnter || TRIGGER_CHARS.includes(lineUpToCursor.slice(-1));
				//console.log(`Debug: Letztes Zeichen der Zeile: "${lineUpToCursor.slice(-1)}"`);
				if (!trigger) {
					//console.log('Debug: Kein Trigger.');
					return;
				}

				const lastWordMatch = lineUpToCursor.match(LAST_WORD_REGEX);
				if (!lastWordMatch) {
					//console.log('Debug: Kein letztes Wort gefunden.');
					return;
				}
				const lastWord = lastWordMatch[0].trim();
				const lastWordStart = lineUpToCursor.lastIndexOf(lastWordMatch[0]);
				//console.log(`Debug: Letztes Wort: "${lastWord}" ab Position ${lastWordStart}`);

				if (this.settings.exclusionList.includes(lastWord)) {
					//console.log(`Debug: "${lastWord}" steht in der Ausschlussliste.`);
					return;
				}

				// Überprüfe, ob das Wort das zu korrigierende Muster aufweist:
				// Zwei Großbuchstaben am Anfang, dritter Buchstabe klein.
				if (lastWord.length >= 3 &&
					(lastWord[0] === lastWord[0].toUpperCase() && lastWord[0] !== lastWord[0].toLowerCase()) &&
					(lastWord[1] === lastWord[1].toUpperCase() && lastWord[1] !== lastWord[1].toLowerCase()) &&
					(lastWord[2] === lastWord[2].toLowerCase() && lastWord[2] !== lastWord[2].toUpperCase())
				) {
					// Überspringe Wörter in Codeblöcken.
					if (this.isInCodeBlock(editor, lastWordStart, currentLineNumber)) {
						//console.log('Debug: Wort befindet sich in einem Codeblock.');
						return;
					}

					const start = lastWordStart + 1;
					const end = lastWordStart + 2;
					const replacedChar = lastWord[1].toLowerCase();
					//console.log(`Debug: Ersetze Zeichen an Position ${start} von "${lastWord[1]}" zu "${replacedChar}"`);

					this.isReplacing = true;
					doc.replaceRange(replacedChar, { line: currentLineNumber, ch: start }, { line: currentLineNumber, ch: end });
					this.isReplacing = false;
				}
			})
		);
	}

	/**
	 * Prüft, ob sich ein bestimmter Textbereich in einem Codeblock befindet.
	 * Optional kann eine Zeilennummer übergeben werden.
	 */
	isInCodeBlock(editor: Editor, firstCharacterPosition: number, lineNumber?: number): boolean {
		const doc = editor.getDoc();
		const currentLineNumber = lineNumber !== undefined ? lineNumber : doc.getCursor().line;
		const line = doc.getLine(currentLineNumber);
		const linesAbove = doc.getRange({ line: 0, ch: 0 }, { line: currentLineNumber, ch: 0 });
		const codeBlockMatches = (linesAbove.match(/```/g) || []).length;
		if (codeBlockMatches % 2 !== 0) {
			return true;
		}
		let backticksCount = 0;
		for (let i = 0; i < firstCharacterPosition; i++) {
			if (line[i] === '`') {
				backticksCount++;
			}
		}
		return backticksCount % 2 !== 0;
	}

	onunload() {
		console.log('Unloading AutoCorrectPlugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class AutoCorrectSettingTab extends PluginSettingTab {
	plugin: AutoCorrectPlugin;

	constructor(app: any, plugin: AutoCorrectPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'AutoCorrect Capitals Misspelling Settings' });

		new Setting(containerEl)
			.setName('Exclusion List')
			.setDesc('Füge Wörter hinzu, die nicht korrigiert werden sollen. (durch Kommas getrennt)')
			.addTextArea((text) =>
				text
					.setPlaceholder('Wörter, getrennt durch Kommas')
					.setValue(this.plugin.settings.exclusionList.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.exclusionList = value.split(',').map((word) => word.trim());
						await this.plugin.saveSettings();
					})
			);
		
		new Setting(containerEl)
			.setName('Capitalize first letter in list')
			.setDesc('Wenn eine Zeile mit "- " beginnt und ein Triggerzeichen erkannt wird, wird der erste Buchstabe des folgenden Wortes großgeschrieben (zusätzlich zur bestehenden Korrektur).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.capitalizeListItem)
				.onChange(async (value: boolean) => {
					this.plugin.settings.capitalizeListItem = value;
					await this.plugin.saveSettings();
				})
			);
	}
}

import { Plugin, PluginSettingTab, Setting, Editor, MarkdownView } from 'obsidian';

// Globale Konstanten
const TRIGGER_CHARS: string[] = [' ', '.', ',', ';', ':', '!', '?', '{', '"', ')', ']', '%', '}'];
const LAST_WORD_REGEX: RegExp = /[\p{L}\p{M}']+(?=\W*$)/u;
const LIST_ITEM_REGEX: RegExp = /^- (\S+)/;

interface AutoCorrectSettings {
	exclusionList: string[];
	capitalizeListItem: boolean;
	capitalizeSentences: boolean;
}

const DEFAULT_SETTINGS: AutoCorrectSettings = {
	exclusionList: [],
	capitalizeListItem: false,
	capitalizeSentences: false
};

export default class AutoCorrectPlugin extends Plugin {
	settings: AutoCorrectSettings;
	private lastKeyWasEnter: boolean = false;

	async onload() {
		console.log('Loading AutoCorrectPlugin');
		await this.loadSettings();
		this.addSettingTab(new AutoCorrectSettingTab(this.app, this));

		// Capture-Modus
		this.app.workspace.containerEl.addEventListener('keydown', (evt: KeyboardEvent) => {
			if (evt.key === "Enter") {
				this.lastKeyWasEnter = true;
			}
		}, true);

		this.registerEvent(
			this.app.workspace.on('editor-change', (editor: Editor) => {
				this.handleEditorChange(editor);
			})
		);
	}

	/**
	 * Zentraler Event-Handler.
	 * Es werden grundlegende Prüfungen (leere Zeile, Trigger) durchgeführt.
	 * Die Codeblock- und Mathblock-Prüfung erfolgt in den Feature-Funktionen als letzte Prüfung.
	 */
	handleEditorChange(editor: Editor) {
		const doc = editor.getDoc();
		const cursor = doc.getCursor();
		let lineNumber = cursor.line;
		const wasEnter = this.lastKeyWasEnter;
		this.lastKeyWasEnter = false;

		// Bei Enter wird die Zeile oberhalb bearbeitet.
		if (wasEnter && lineNumber > 0) {
			lineNumber--;
		}

		const fullLine = doc.getLine(lineNumber);
		if (fullLine.length === 0) return;

		const lineUpToCursor = wasEnter ? fullLine : fullLine.substring(0, cursor.ch);
		const trigger = wasEnter || TRIGGER_CHARS.includes(lineUpToCursor.slice(-1));
		if (!trigger) return;

		// 1. Listen-Item-Korrektur
		if (this.settings.capitalizeListItem && fullLine.trim().startsWith("- ")) {
			this.correctListItem(editor, fullLine, lineNumber);
			lineNumber = cursor.line;
		}

		// 2. Wort-Autokorrektur
		this.correctWord(editor, fullLine, lineNumber);

		// 3. Satzanfangskorrektur
		if (this.settings.capitalizeSentences) {
			this.correctSentence(editor, fullLine, lineNumber);
		}
	}

	/**
	 * Korrigiert in Listen-Items:
	 * - Den ersten Buchstaben des ersten Wortes (falls nötig)
	 * - Das zweite Zeichen, falls es fälschlicherweise groß ist.
	 * Führt die Code- und Mathblock-Prüfung erst aus, wenn eine Änderung erforderlich ist.
	 */
	correctListItem(editor: Editor, line: string, lineNumber: number) {
		const doc = editor.getDoc();
		const listItemMatch = line.match(LIST_ITEM_REGEX);
		if (listItemMatch) {
			const listWord = listItemMatch[1];
			const wordStart = line.indexOf(listWord);
			// Prüfe, ob der erste Buchstabe klein ist.
			if (listWord[0] !== listWord[0].toUpperCase()) {
				// Code- und Mathblock-Prüfung
				if (this.isInCodeBlock(editor, wordStart, lineNumber) || this.isInMathBlock(editor, wordStart, lineNumber)) return;
				const newWord = listWord[0].toUpperCase() + listWord.slice(1);
				doc.replaceRange(newWord, { line: lineNumber, ch: wordStart }, { line: lineNumber, ch: wordStart + listWord.length });
			}
			// Zweite Korrektur: Falls das zweite Zeichen fälschlicherweise groß ist.
			if (listWord.length >= 3 &&
				listWord[0] === listWord[0].toUpperCase() &&
				listWord[1] === listWord[1].toUpperCase() &&
				listWord[2] === listWord[2].toLowerCase()) {
				if (this.isInCodeBlock(editor, wordStart + 1, lineNumber) || this.isInMathBlock(editor, wordStart + 1, lineNumber)) return;
				const start = wordStart + 1;
				const end = wordStart + 2;
				const replacedChar = listWord[1].toLowerCase();
				doc.replaceRange(replacedChar, { line: lineNumber, ch: start }, { line: lineNumber, ch: end });
			}
		}
	}

	/**
	 * Sucht das letzte Wort in der Zeile und prüft, ob es dem Muster (zwei Großbuchstaben, dritter Kleinbuchstabe)
	 * entspricht. Falls ja, wird das zweite Zeichen zu Kleinbuchstaben geändert.
	 * Die Code- und Mathblock-Prüfung erfolgt erst, wenn eine Änderung notwendig ist.
	 */
	correctWord(editor: Editor, line: string, lineNumber: number) {
		const doc = editor.getDoc();
		const lastWordMatch = line.match(LAST_WORD_REGEX);
		if (!lastWordMatch) return;
		const lastWord = lastWordMatch[0].trim();
		const lastWordStart = line.lastIndexOf(lastWord);

		if (this.settings.exclusionList.includes(lastWord)) return;

		if (lastWord.length >= 3 &&
			lastWord[0] === lastWord[0].toUpperCase() &&
			lastWord[1] === lastWord[1].toUpperCase() &&
			lastWord[2] === lastWord[2].toLowerCase()) {
			if (this.isInCodeBlock(editor, lastWordStart, lineNumber) || this.isInMathBlock(editor, lastWordStart, lineNumber)) return;
			const start = lastWordStart + 1;
			const end = lastWordStart + 2;
			const replacedChar = lastWord[1].toLowerCase();
			doc.replaceRange(replacedChar, { line: lineNumber, ch: start }, { line: lineNumber, ch: end });
		}
	}

	/**
	 * Sucht den letzten Satz in der Zeile und korrigiert dessen ersten Buchstaben,
	 * falls dieser klein geschrieben ist.
	 * Die Code- und Mathblock-Prüfung erfolgt erst, bevor der erste Buchstabe korrigiert wird.
	 */
	correctSentence(editor: Editor, line: string, lineNumber: number) {
		const doc = editor.getDoc();
		const lastPeriod = line.lastIndexOf('. ');
		const lastExclamation = line.lastIndexOf('! ');
		const lastQuestion = line.lastIndexOf('? ');
		let sentenceStart = Math.max(lastPeriod, lastExclamation, lastQuestion);
		sentenceStart = (sentenceStart !== -1) ? sentenceStart + 2 : 0;

		const rest = line.slice(sentenceStart);
		const firstNonSpaceIndex = rest.search(/\S/);
		if (firstNonSpaceIndex === -1) return;
		const absIndex = sentenceStart + firstNonSpaceIndex;
		if (this.isInCodeBlock(editor, absIndex, lineNumber) || this.isInMathBlock(editor, absIndex, lineNumber)) return;
		const charToCheck = line[absIndex];
		if (charToCheck && charToCheck === charToCheck.toLowerCase() && charToCheck !== charToCheck.toUpperCase()) {
			const correctedChar = charToCheck.toUpperCase();
			doc.replaceRange(correctedChar, { line: lineNumber, ch: absIndex }, { line: lineNumber, ch: absIndex + 1 });
		}
	}

	/**
	 * Prüft, ob der angegebene Textbereich in einem Codeblock liegt.
	 * Dabei werden alle Zeilen oberhalb der aktuellen Zeile durchsucht und jeder Zeilenanfang,
	 * der mit "```" beginnt, als Codeblockmarker gezählt.
	 * Außerdem werden Inline-Codeblocks (über Backticks in der aktuellen Zeile) berücksichtigt.
	 */
	isInCodeBlock(editor: Editor, firstCharacterPosition: number, lineNumber?: number): boolean {
		const doc = editor.getDoc();
		const currentLineNumber = lineNumber !== undefined ? lineNumber : doc.getCursor().line;
		const line = doc.getLine(currentLineNumber);
		const linesAbove = doc.getRange({ line: 0, ch: 0 }, { line: currentLineNumber, ch: 0 });
		const codeBlockMatches = (linesAbove.match(/^```/gm) || []).length;
		if (codeBlockMatches % 2 !== 0) return true;
		let backticksCount = 0;
		for (let i = 0; i < firstCharacterPosition; i++) {
			if (line[i] === '`') backticksCount++;
		}
		return backticksCount % 2 !== 0;
	}

	
	isInMathBlock(editor: Editor, firstCharacterPosition: number, lineNumber?: number): boolean {
		const doc = editor.getDoc();
		const currentLineNumber = lineNumber !== undefined ? lineNumber : doc.getCursor().line;
		const line = doc.getLine(currentLineNumber);
		let mathCount = 0;
		for (let i = 0; i < firstCharacterPosition; i++) {
			if (line[i] === '$' && (i === 0 || line[i - 1] !== '\\')) {
				mathCount++;
			}
		}
		if (mathCount % 2 === 1) return true;
		if (line.trim().startsWith('$$')) return true;
		return false;
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
			.setDesc('Add words that should not be corrected (comma separated).')
			.addTextArea((text) =>
				text
					.setPlaceholder('comma separated list')
					.setValue(this.plugin.settings.exclusionList.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.exclusionList = value.split(',').map((word) => word.trim());
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Capitalize first letter in list')
			.setDesc('If a line starts with "- " and a trigger character is detected, the first letter of the following word will be capitalized.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.capitalizeListItem)
				.onChange(async (value: boolean) => {
					this.plugin.settings.capitalizeListItem = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Capitalize sentence beginnings')
			.setDesc('The first letter of the last sentence will be capitalized if it was typed in lowercase.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.capitalizeSentences)
				.onChange(async (value: boolean) => {
					this.plugin.settings.capitalizeSentences = value;
					await this.plugin.saveSettings();
				})
			);
	}
}

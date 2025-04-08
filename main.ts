import { Plugin, PluginSettingTab, Setting, Editor, MarkdownView } from 'obsidian';

// Global constants
const TRIGGER_CHARS: string[] = [' ', '.', ',', ';', ':', '!', '?', '{', '"', ')', ']', '%', '}'];
const LAST_WORD_REGEX: RegExp = /[\p{L}\p{M}']+(?=\W*$)/u;
const LIST_ITEM_REGEX: RegExp = /^- (\S+)/;
const NUMBERED_LIST_REGEX: RegExp = /^(\d+)\.\s+(\S+)/;

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
	
	// Caching fields for protected block check (so that isInProtectedBlock is computed only once per event)
	private _lookedForProtectedBlock: boolean = false;
	private _isInProtectedBlock: boolean = false;
	
	// Flag to ignore events caused by our own text replacements.
	private _suppressChangeEvent: boolean = false;

	async onload() {
		console.log('Loading AutoCorrectPlugin');
		await this.loadSettings();
		this.addSettingTab(new AutoCorrectSettingTab(this.app, this));

		// Capture keydown events (to detect Enter)
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
	 * Central editor-change handler.
	 * Checks basic conditions (empty line, trigger) and resets the caching variables.
	 * If the event was triggered by our own change (via doc.replaceRange) it is suppressed.
	 */
	handleEditorChange(editor: Editor) {
		// If we suppressed this event already, reset the flag and exit.
		if (this._suppressChangeEvent) {
			this._suppressChangeEvent = false;
			return;
		}

		//console.log('Editor change detected');
		const doc = editor.getDoc();
		const cursor = doc.getCursor();
		let lineNumber = cursor.line;
		const wasEnter = this.lastKeyWasEnter;
		this.lastKeyWasEnter = false;
		
		// Reset protected block cache for the new event.
		this._lookedForProtectedBlock = false;
		this._isInProtectedBlock = false;

		// When Enter is pressed, process the previous line.
		if (wasEnter && lineNumber > 0) {
			lineNumber--;
		}

		const fullLine = doc.getLine(lineNumber);
		if (fullLine.length === 0) return;
		const lineUpToCursor = wasEnter ? fullLine : fullLine.substring(0, cursor.ch);
		const trigger = wasEnter || TRIGGER_CHARS.includes(lineUpToCursor.slice(-1));
		//console.log('wasEnter: ' + wasEnter);
		//console.log('lineUpToCursor: ' + lineUpToCursor);
		if (!trigger) return;

		// 1. List Item Correction (bullet or numbered lists)
		if (this.settings.capitalizeListItem) {
			const trimmedLine = fullLine.trim();
			if (trimmedLine.startsWith("- ")) {
				this.correctListItem(editor, fullLine, lineNumber);
			} else if (NUMBERED_LIST_REGEX.test(trimmedLine)) {
				this.correctNumberedList(editor, fullLine, lineNumber);
			}
		}

		// 2. Word auto-correction
		this.correctWord(editor, fullLine, lineNumber);

		// 3. Sentence beginning correction
		if (this.settings.capitalizeSentences) {
			this.correctSentence(editor, fullLine, lineNumber);
		}
	}

	/**
	 * Corrects bullet list items.
	 * Ensures that the first word is properly capitalized.
	 * If a correction is to be applied, it first checks if the edit is in a protected block.
	 */
	correctListItem(editor: Editor, line: string, lineNumber: number) {
		//console.log('Correcting list item');
		const doc = editor.getDoc();
		const listItemMatch = line.match(LIST_ITEM_REGEX);
		if (!listItemMatch) return;
		const listWord = listItemMatch[1];
		const wordStart = line.indexOf(listWord);

		let firstCorrection = listWord[0] !== listWord[0].toUpperCase();
		let secondCorrection = (listWord.length >= 3 &&
			listWord[0] === listWord[0].toUpperCase() &&
			listWord[1] === listWord[1].toUpperCase() &&
			listWord[2] === listWord[2].toLowerCase());
		if (!firstCorrection && !secondCorrection) return;
		if (this.isInProtectedBlock(editor, wordStart, lineNumber)) return;

		// If both corrections are needed, perform the second-character correction first.
		if (firstCorrection && secondCorrection) {
			const start = wordStart + 1;
			const end = wordStart + 2;
			const replacedChar = listWord[1].toLowerCase();
			this._suppressChangeEvent = true; // suppress event triggered by our own replacement
			doc.replaceRange(replacedChar, { line: lineNumber, ch: start }, { line: lineNumber, ch: end });
		}
		if (firstCorrection) {
			// Re-check the protected block condition.
			if (this.isInProtectedBlock(editor, wordStart, lineNumber)) return;
			const newWord = listWord[0].toUpperCase() + listWord.slice(1);
			this._suppressChangeEvent = true;
			doc.replaceRange(newWord, { line: lineNumber, ch: wordStart }, { line: lineNumber, ch: wordStart + listWord.length });
		}
		// Apply second correction independently.
		if (secondCorrection) {
			if (this.isInProtectedBlock(editor, wordStart + 1, lineNumber)) return;
			const start = wordStart + 1;
			const end = wordStart + 2;
			const replacedChar = listWord[1].toLowerCase();
			this._suppressChangeEvent = true;
			doc.replaceRange(replacedChar, { line: lineNumber, ch: start }, { line: lineNumber, ch: end });
		}
	}

	/**
	 * Corrects numbered list items.
	 * For lines starting with a number, a dot and a space (e.g. "1. hello"), it ensures that the first word is capitalized.
	 */
	correctNumberedList(editor: Editor, line: string, lineNumber: number) {
		//console.log('Correcting numbered list');
		const doc = editor.getDoc();
		const match = line.trim().match(NUMBERED_LIST_REGEX);
		if (!match) return;
		const listWord = match[2];
		const markerLength = match[1].length + 2; // digits + ". "
		const wordStart = line.indexOf(listWord, markerLength);
		if (!wordStart) return;
		if (listWord[0] !== listWord[0].toUpperCase() && !this.isInProtectedBlock(editor, wordStart, lineNumber)) {
			const newWord = listWord[0].toUpperCase() + listWord.slice(1);
			this._suppressChangeEvent = true;
			doc.replaceRange(newWord, { line: lineNumber, ch: wordStart }, { line: lineNumber, ch: wordStart + listWord.length });
		}
	}

	/**
	 * Corrects the last word in the line if it matches the pattern (two uppercase letters followed by a lowercase letter).
	 * The protected block check is executed before applying corrections.
	 */
	correctWord(editor: Editor, line: string, lineNumber: number) {
		//console.log('Correcting last word');
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
			if (this.isInProtectedBlock(editor, lastWordStart, lineNumber)) return;
			const start = lastWordStart + 1;
			const end = lastWordStart + 2;
			const replacedChar = lastWord[1].toLowerCase();
			this._suppressChangeEvent = true;
			doc.replaceRange(replacedChar, { line: lineNumber, ch: start }, { line: lineNumber, ch: end });
		}
	}

	/**
	 * Corrects the first letter of the last sentence in the line if it is lowercase.
	 * The protected block check is executed before applying corrections.
	 */
	correctSentence(editor: Editor, line: string, lineNumber: number) {
		//console.log('Correcting sentence');
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
		if (this.isInProtectedBlock(editor, absIndex, lineNumber)) return;
		const charToCheck = line[absIndex];
		if (charToCheck && charToCheck === charToCheck.toLowerCase() && charToCheck !== charToCheck.toUpperCase()) {
			const correctedChar = charToCheck.toUpperCase();
			this._suppressChangeEvent = true;
			doc.replaceRange(correctedChar, { line: lineNumber, ch: absIndex }, { line: lineNumber, ch: absIndex + 1 });
		}
	}

	/**
	 * Combined protected block check.
	 * Checks whether the given position in the current line is within:
	 * 1. A YAML frontmatter block (if the document begins with '---', then until the next '---').
	 * 2. A fenced codeblock (by counting lines that start with "```").
	 * 3. A fenced math block (by counting lines that start with "$$").
	 * 4. Inline code blocks (by counting unescaped backticks).
	 * 5. Inline math blocks (by counting unescaped '$').
	 *
	 * Uses caching so that it is only computed once per editor-change event.
	 */
	isInProtectedBlock(editor: Editor, firstCharacterPosition: number, lineNumber?: number): boolean {
		// Return cached result if already computed.
		if (this._lookedForProtectedBlock) {
			return this._isInProtectedBlock;
		}
		//console.log('Checking for protected block');
		const doc = editor.getDoc();
		const currentLineNumber = lineNumber !== undefined ? lineNumber : doc.getCursor().line;
		const line = doc.getLine(currentLineNumber);

		// 1. YAML Frontmatter Check
		const firstLine = doc.getLine(0).trim();
		if (firstLine === '---') {
			let frontmatterEnd = -1;
			for (let i = 1; i < currentLineNumber; i++) {
				if (doc.getLine(i).trim() === '---') {
					frontmatterEnd = i;
					break;
				}
			}
			// If no closing marker is found or we're within the frontmatter, it's protected.
			if (frontmatterEnd === -1 || currentLineNumber <= frontmatterEnd) {
				this._isInProtectedBlock = true;
				this._lookedForProtectedBlock = true;
				return true;
			}
		}

		// 2. Fenced Codeblocks: Check all lines above.
		const linesAbove = doc.getRange({ line: 0, ch: 0 }, { line: currentLineNumber, ch: 0 });
		const codeBlockMatches = (linesAbove.match(/^```/gm) || []).length;
		if (codeBlockMatches % 2 !== 0) {
			this._isInProtectedBlock = true;
			this._lookedForProtectedBlock = true;
			return true;
		}
		
		// Check for fenced math blocks that start with "$$".
		const mathBlockMatches = (linesAbove.match(/^\$\$/gm) || []).length;
		if (mathBlockMatches % 2 !== 0) {
			this._isInProtectedBlock = true;
			this._lookedForProtectedBlock = true;
			return true;
		}

		// 3. Inline blocks: Count unescaped backticks and '$' in the current line up to position.
		let backticksCount = 0;
		let mathCount = 0;
		for (let i = 0; i < firstCharacterPosition && i < line.length; i++) {
			if (line[i] === '`' && (i === 0 || line[i - 1] !== '\\')) {
				backticksCount++;
			}
			if (line[i] === '$' && (i === 0 || line[i - 1] !== '\\')) {
				mathCount++;
			}
		}
		if (backticksCount % 2 !== 0 || mathCount % 2 === 1) {
			this._isInProtectedBlock = true;
			this._lookedForProtectedBlock = true;
			return true;
		}
		this._isInProtectedBlock = false;
		this._lookedForProtectedBlock = true;
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
			.setDesc('If a line starts with "- " or a numbered list (e.g. "1. "), the first letter of the following word will be capitalized.')
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

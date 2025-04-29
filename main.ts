import { Plugin, PluginSettingTab, Setting, Editor } from 'obsidian';

const TRIGGER_CHARS: string[] = [' ', '.', ',', ';', ':', '!', '?', '{', '\"', ')', ']', '%', '}'];
const LAST_WORD_REGEX: RegExp = /[\p{L}\p{M}']+(?=\W*$)/u;
const LIST_ITEM_REGEX: RegExp = /^- (\S+)/;

interface AutoCorrectSettings {
	exclusionList: string[];
	capitalizeListItem: boolean;
	capitalizeSentences: boolean;
	abbreviations: string[];
}

const DEFAULT_SETTINGS: AutoCorrectSettings = {
	exclusionList: [],
	capitalizeListItem: false,
	capitalizeSentences: false,
	abbreviations: ["e.g.", "i.e.", "etc.", "vs."]
};

export default class AutoCorrectPlugin extends Plugin {
	settings: AutoCorrectSettings;
	private lastKeyWasEnter: boolean = false;
	private lastKeyTyped: string = '';
	private _suppressChangeEvent: boolean = false;
	private abbreviationsSet: Set<string>;
	private exclusionSet: Set<string>;

	async onload() {
		await this.loadSettings();
		this.updateInternalSets();
		this.addSettingTab(new AutoCorrectSettingTab(this.app, this));

		this.app.workspace.containerEl.addEventListener('keydown', (evt: KeyboardEvent) => {
			this.lastKeyWasEnter = evt.key === "Enter";
			this.lastKeyTyped = evt.key;
		}, true);

		this.registerEvent(this.app.workspace.on('editor-change', (editor: Editor) => {
			this.handleEditorChange(editor);
		}));
	}

	updateInternalSets() {
		this.abbreviationsSet = new Set(this.settings.abbreviations.map(a => a.toLowerCase()));
		this.exclusionSet = new Set(this.settings.exclusionList.map(e => e.toLowerCase()));
	}

	handleEditorChange(editor: Editor) {
		if (this._suppressChangeEvent) {
			this._suppressChangeEvent = false;
			return;
		}

		const doc = editor.getDoc();
		const cursor = doc.getCursor();
		let lineNumber = this.lastKeyWasEnter ? cursor.line - 1 : cursor.line;
		if (lineNumber < 0) return;

		const line = doc.getLine(lineNumber);
		if (!line || (!TRIGGER_CHARS.includes(this.lastKeyTyped) && !this.lastKeyWasEnter)) return;

		this.correctListItem(editor, line, lineNumber);
		this.correctWord(editor, line, lineNumber);
		this.correctSentence(editor, line, lineNumber);
		this.lastKeyWasEnter = false;
	}

	correctListItem(editor: Editor, line: string, lineNumber: number) {
		const match = line.match(LIST_ITEM_REGEX);
		if (!match) return;
		const word = match[1];
		if (!/^[A-Za-zÄÖÜäöüß]/.test(word[0]) || this.exclusionSet.has(word.toLowerCase())) return;
		if (this.isInProtectedBlock(editor, line.indexOf(word), lineNumber)) return;

		const corrected = this.settings.capitalizeListItem && /^[a-zäöüß]/.test(word)
			? word[0].toUpperCase() + word.slice(1)
			: word;

		if (corrected !== word) {
			this._suppressChangeEvent = true;
			editor.getDoc().replaceRange(corrected, { line: lineNumber, ch: line.indexOf(word) }, { line: lineNumber, ch: line.indexOf(word) + word.length });
		}
	}

	correctWord(editor: Editor, line: string, lineNumber: number) {
		const match = line.match(LAST_WORD_REGEX);
		if (!match) return;
		const word = match[0];
		if (this.exclusionSet.has(word.toLowerCase())) return;
		const start = line.lastIndexOf(word);
		if (word.length >= 3 && word[0] === word[0].toUpperCase() && word[1] === word[1].toUpperCase() && word[2] === word[2].toLowerCase() && !this.isInProtectedBlock(editor, start, lineNumber)) {
			this._suppressChangeEvent = true;
			editor.getDoc().replaceRange(word[1].toLowerCase(), { line: lineNumber, ch: start + 1 }, { line: lineNumber, ch: start + 2 });
		}
	}

	correctSentence(editor: Editor, line: string, lineNumber: number) {
		if (!this.settings.capitalizeSentences) return;
		const sentenceRegex = /(?:^|[.!?]\s+)([a-zäöüß])/gu;
		let match;
		while ((match = sentenceRegex.exec(line))) {
			const charIdx = match.index + match[0].length - 1;
			const prevText = line.substring(0, charIdx).trimEnd();
			const lastWord = prevText.split(/\s+/).pop();
			if (lastWord && this.abbreviationsSet.has(lastWord.toLowerCase())) continue;
			if (!/[A-Za-zÄÖÜäöüß]/.test(line[charIdx]) || this.exclusionSet.has(match[1].toLowerCase())) continue;
			if (this.isInProtectedBlock(editor, charIdx, lineNumber)) continue;
			this._suppressChangeEvent = true;
			editor.getDoc().replaceRange(match[1].toUpperCase(), { line: lineNumber, ch: charIdx }, { line: lineNumber, ch: charIdx + 1 });
		}
	}

	isInProtectedBlock(editor: Editor, ch: number, lineNumber: number): boolean {
		return false;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateInternalSets();
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
		new Setting(containerEl).setName('Exclusion List').addTextArea(text => text.setValue(this.plugin.settings.exclusionList.join(', ')).onChange(async v => { this.plugin.settings.exclusionList = v.split(',').map(w => w.trim()); await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName('Capitalize List Items').addToggle(t => t.setValue(this.plugin.settings.capitalizeListItem).onChange(async v => { this.plugin.settings.capitalizeListItem = v; await this.plugin.saveSettings(); this.display(); }));
		new Setting(containerEl).setName('Capitalize Sentences').addToggle(t => t.setValue(this.plugin.settings.capitalizeSentences).onChange(async v => { this.plugin.settings.capitalizeSentences = v; await this.plugin.saveSettings(); this.display(); }));
		if (this.plugin.settings.capitalizeSentences) {
			new Setting(containerEl).setName('Abbreviations').addTextArea(text => text.setValue(this.plugin.settings.abbreviations.join(', ')).onChange(async v => { this.plugin.settings.abbreviations = v.split(',').map(w => w.trim()); await this.plugin.saveSettings(); }));
		}
	}
}

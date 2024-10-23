import { Plugin, PluginSettingTab, Setting, Editor, MarkdownView } from 'obsidian';

interface AutoCorrectSettings {
	exclusionList: string[];
}

const DEFAULT_SETTINGS: AutoCorrectSettings = {
	exclusionList: []
};

export default class AutoCorrectPlugin extends Plugin {
	settings: AutoCorrectSettings;
	private lastReplacement: { position: CodeMirror.Position; originalChar: string; replacedChar: string } | null = null;
	private isReplacing: boolean = false;

	async onload() {
		console.log('Loading AutoCorrectPlugin');

		await this.loadSettings();
		this.addSettingTab(new AutoCorrectSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('editor-change', (editor: Editor) => {
				if (this.isReplacing) return;

				const punctuation = [' ', '.', ',', ';', ':', '!', '?', '\n'];
				const doc = editor.getDoc();
				const cursor = doc.getCursor();
				const line = doc.getLine(cursor.line);
				const lineUpToCursor = line.substring(0, cursor.ch);
				const lastChar = lineUpToCursor.slice(-1);
				let lastWordMatch;


				if (punctuation.includes(lastChar)) {
					if (lineUpToCursor.length > 0) {
						lastWordMatch = lineUpToCursor.match(/[\p{L}\p{M}]+(?=\W*$)/u);
					}
					if (lastWordMatch) {
						const lastWordStart = lineUpToCursor.lastIndexOf(lastWordMatch[0]);
						const lastWord = lastWordMatch[0].trim();
						//console.log(lastWord);
						if (this.settings.exclusionList.includes(lastWord)) {
							return;
						}
						if (/[\p{Lu}]{2}[\p{Ll}]+/u.test(lastWord)) {
							if (lastWord.length < 3) {
								return;
							}
							if (
								(lastWord[0] === lastWord[0].toUpperCase() && lastWord[0] !== lastWord[0].toLowerCase()) &&
								(lastWord[1] === lastWord[1].toUpperCase() && lastWord[1] !== lastWord[1].toLowerCase()) &&
								(lastWord[2] === lastWord[2].toLowerCase() && lastWord[2] !== lastWord[2].toUpperCase())
							) {
								const start = lastWordStart + 1;
								const end = lastWordStart + 2;
								const replacedChar = lastWord[1].toLowerCase();
									
								this.isReplacing = true;
								this.lastReplacement = {
									position: { line: cursor.line, ch: start },
									originalChar: lastWord[1],
									replacedChar: replacedChar
								};
								doc.replaceRange(replacedChar, { line: cursor.line, ch: start }, { line: cursor.line, ch: end });
								this.isReplacing = false;
								return;
							}
						}
					}
				}
			})
		);
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
			.setDesc('Add words to this list to prevent them from being autocorrected.')
			.addTextArea((text) =>
				text
					.setPlaceholder('separate words with commas')
					.setValue(this.plugin.settings.exclusionList.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.exclusionList = value.split(',').map((word) => word.trim());
						await this.plugin.saveSettings();
					})
			);
	}
}

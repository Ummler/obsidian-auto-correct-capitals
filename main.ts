import { Plugin, Editor, MarkdownView } from 'obsidian';

export default class AutoCorrectPlugin extends Plugin {
	async onload() {
		console.log('Loading AutoCorrectPlugin');

		this.registerEvent(
			this.app.workspace.on('editor-change', (editor: Editor) => {
				const punctuation = [' ', '.', ',', ';', ':', '!', '?', '\n'];
				const doc = editor.getDoc();
				const cursor = doc.getCursor();
				const line = doc.getLine(cursor.line);
				const lineUpToCursor = line.substring(0, cursor.ch); 
				const lastChar = lineUpToCursor.slice(-1);
				let lastWordMatch;

				if (punctuation.includes(lastChar)) {
					if (lineUpToCursor.length > 0) {
						lastWordMatch = lineUpToCursor.match(/\b\w+\W*$/);
					}
					if (lastWordMatch) {
						const lastWord = lastWordMatch[0];
						if (/\b[A-Z]{2}[a-z]+\b/.test(lastWord)) {
							let uppercaseCount = 0;
							for (let i = 0; i < lastWord.length; i++) {
								const char = lastWord[i];
								if (char === char.toUpperCase() && char !== char.toLowerCase()) {
									uppercaseCount++;

									if (uppercaseCount === 2) {
										const start = cursor.ch - lastWord.length + i;
										const end = start + 1;
										doc.replaceRange(char.toLowerCase(), { line: cursor.line, ch: start }, { line: cursor.line, ch: end });
										return; 
									}
								}
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
}

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
				const lineUpToCursor = line.substring(0, cursor.ch); // Text bis zur Cursor-Position
				const lastChar = lineUpToCursor.slice(-1);
				var lastWordMatch;

				if (punctuation.includes(lastChar)) {
					if (lineUpToCursor.length > 0) {
						 // Finde das letzte Wort vor dem Cursor
						 lastWordMatch = lineUpToCursor.slice(0,-1).match(/\b\w+$/);
					}
					if (lastWordMatch) {
						const lastWord = lastWordMatch[0];
						// Überprüfe das Wort mit dem RegEx
						if (/\b(?:[A-Z]{2}[a-z]+|(?<=[A-Z]{2})[a-z]+)\b/.test(lastWord)) {

							let modifiedWord = '';
							let uppercaseCount = 0;
							// Iteriere durch das Wort
							for (const char of lastWord) {
								if (char === char.toUpperCase() && char !== char.toLowerCase()) {
									uppercaseCount++;
									// Ändere den zweiten Großbuchstaben in einen Kleinbuchstaben
									if (uppercaseCount === 2) {
										modifiedWord += char.toLowerCase();
										continue;
									}
								}
								modifiedWord += char;
							}
							const start = cursor.ch - lastWord.length - 1;
							doc.replaceRange(modifiedWord, { line: cursor.line, ch: start }, { line: cursor.line, ch: cursor.ch - 1});
							doc.setCursor({ line: cursor.line, ch: cursor.ch });
						}
					}
				}
			})
		)
	}

	onunload() {
		console.log('Unloading AutoCorrectPlugin');
	}
}
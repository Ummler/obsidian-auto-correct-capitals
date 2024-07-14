import { Plugin, Editor, MarkdownView } from 'obsidian';

export default class AutoCorrectPlugin extends Plugin {
	async onload() {
		console.log('Loading AutoCorrectPlugin');

		this.registerEvent(
			this.app.workspace.on('editor-change', (editor: Editor) => {
				const doc = editor.getDoc();
				const cursor = doc.getCursor();
				const line = doc.getLine(cursor.line);
				const words = line.split(' ');

				const lastChar = line[cursor.ch - 1];
				const punctuation = [' ', '.', ',', ';', ':', '!', '?', '\n'];
				
				if (punctuation.includes(lastChar)) {
					const lastWordIndex = words.length - 2;
					const lastWord = words[lastWordIndex];

					if (lastWord && lastWord.length > 2 && lastWord[0] === lastWord[0].toUpperCase() && lastWord[1] === lastWord[1].toUpperCase() && lastWord.slice(2).toLowerCase() === lastWord.slice(2)) {
						const correctedWord = lastWord[0] + lastWord.slice(1).toLowerCase();
						words[lastWordIndex] = correctedWord;
						doc.replaceRange(words.join(' '), { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
					}
				}
			})
		);
	}

	onunload() {
		console.log('Unloading AutoCorrectPlugin');
	}
}

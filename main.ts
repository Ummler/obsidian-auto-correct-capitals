import { Plugin, PluginSettingTab, Setting, Editor } from 'obsidian';

// ────────────────────────────────────────────────────────────────────────────────
// Globals
// ────────────────────────────────────────────────────────────────────────────────

const TRIGGER_CHARS: string[] = [' ', '.', ',', ';', ':', '!', '?', '{', '"', ')', ']', '%', '}'];
const LAST_WORD_REGEX: RegExp = /[\p{L}\p{M}']+(?=\W*$)/u;
const LIST_ITEM_REGEX: RegExp = /^[-*] (\S+)/;
const NUMBERED_LIST_REGEX: RegExp = /^(\d+)\.\s+(\S+)/;

// ────────────────────────────────────────────────────────────────────────────────
// Settings
// ────────────────────────────────────────────────────────────────────────────────

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
  abbreviations: ['e.g.', 'i.e.', 'etc.', 'vs.'],
};

// ────────────────────────────────────────────────────────────────────────────────
// Plugin implementation
// ────────────────────────────────────────────────────────────────────────────────

export default class AutoCorrectPlugin extends Plugin {
  settings: AutoCorrectSettings;

  private lastKeyWasEnter = false;
  private lastKeyTyped   = '';

  // Cache for protected‑block detection (reset every editor‑change)
  private _lookedForProtectedBlock = false;
  private _isInProtectedBlock      = false;

  // Ignore events triggered by our own replacements
  private _suppressChangeEvent = false;

  // Fast look‑up structures derived from settings
  private abbreviationsSet = new Set<string>();
  private exclusionSet     = new Set<string>();

  // ──────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────

  async onload() {
    console.log('Loading AutoCorrectPlugin');
    await this.loadSettings();
    this.updateInternalSets();
    this.addSettingTab(new AutoCorrectSettingTab(this.app, this));

    // Remember the last pressed key to decide whether an editor‑change was triggered by a “trigger character”
    this.app.workspace.containerEl.addEventListener(
      'keydown',
      (evt: KeyboardEvent) => {
        this.lastKeyWasEnter = evt.key === 'Enter';
        this.lastKeyTyped    = evt.key;
      },
      true,
    );

    this.registerEvent(
      this.app.workspace.on('editor-change', (editor: Editor) => {
        this.handleEditorChange(editor);
      }),
    );
  }

  onunload() {
    console.log('Unloading AutoCorrectPlugin');
  }

  // ──────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────

  private updateInternalSets() {
    this.abbreviationsSet = new Set(
      this.settings.abbreviations.map((a) => a.toLowerCase()),
    );
    this.exclusionSet = new Set(
      this.settings.exclusionList.map((e) => e.toLowerCase()),
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Main event handler
  // ──────────────────────────────────────────────────────────────────────

  private handleEditorChange(editor: Editor) {
    if (this._suppressChangeEvent) {
      this._suppressChangeEvent = false;
      return;
    }

    const doc    = editor.getDoc();
    const cursor = doc.getCursor();
    let   lineNo = cursor.line;

    const wasEnter       = this.lastKeyWasEnter;
    this.lastKeyWasEnter = false;

    // Reset cache for this event
    this._lookedForProtectedBlock = false;
    this._isInProtectedBlock      = false;

    if (wasEnter && lineNo > 0) lineNo--;             // process just‑finished line

    const fullLine = doc.getLine(lineNo);
    if (!fullLine) return;

    // Trigger detection
    const trigger = wasEnter || TRIGGER_CHARS.includes((fullLine.substring(0, cursor.ch).slice(-1) || ''));
    if (!trigger) return;

    // 1) List items ------------------------------------------------------
    if (this.settings.capitalizeListItem) {
      const trimmed = fullLine.trim();
      if (trimmed.startsWith('- ')) {
        this.correctListItem(editor, fullLine, lineNo);
      } else if (NUMBERED_LIST_REGEX.test(trimmed)) {
        this.correctNumberedList(editor, fullLine, lineNo);
      }
    }

    // 2) Word auto‑correction -------------------------------------------
    this.correctWord(editor, fullLine, lineNo);

    // 3) Sentence beginnings --------------------------------------------
    if (this.settings.capitalizeSentences) {
      this.correctSentence(editor, fullLine, lineNo);
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Corrections
  // ──────────────────────────────────────────────────────────────────────

  private correctListItem(editor: Editor, line: string, lineNo: number) {
    const doc   = editor.getDoc();
    const match = line.match(LIST_ITEM_REGEX);
    if (!match) return;

    const word      = match[1];
    const wordStart = line.indexOf(word);

    if (!/^[\p{L}\p{M}]/u.test(word[0])) return;               // non‑alphabetic start
    if (this.exclusionSet.has(word.toLowerCase())) return;      // user‑excluded

    let replacement = word;
    let changed     = false;

    // Primary capitalisation
    if (word[0] !== word[0].toUpperCase()) {
      replacement = word[0].toUpperCase() + word.slice(1);
      changed     = true;
    }

    // Secondary HEllo‑>Hello fix
    if (
      word.length >= 3 &&
      word[0] === word[0].toUpperCase() &&
      word[1] === word[1].toUpperCase() &&
      word[2] === word[2].toLowerCase()
    ) {
      replacement = replacement[0] + replacement[1].toLowerCase() + replacement.slice(2);
      changed     = true;
    }

    if (!changed || this.isInProtectedBlock(editor, wordStart, lineNo)) return;

    this._suppressChangeEvent = true;
    doc.replaceRange(
      replacement,
      { line: lineNo, ch: wordStart },
      { line: lineNo, ch: wordStart + word.length },
    );
  }

  private correctNumberedList(editor: Editor, line: string, lineNo: number) {
    const doc   = editor.getDoc();
    const match = line.trim().match(NUMBERED_LIST_REGEX);
    if (!match) return;

    const word         = match[2];
    const markerLength = match[1].length + 2;               // digits + '. '
    const wordStart    = line.indexOf(word, markerLength);
    if (wordStart === -1) return;

    if (!/^[\p{L}\p{M}]/u.test(word[0])) return;
    if (this.exclusionSet.has(word.toLowerCase())) return;
    if (this.isInProtectedBlock(editor, wordStart, lineNo)) return;

    if (word[0] !== word[0].toUpperCase()) {
      const newWord = word[0].toUpperCase() + word.slice(1);
      this._suppressChangeEvent = true;
      doc.replaceRange(newWord, { line: lineNo, ch: wordStart }, { line: lineNo, ch: wordStart + word.length });
    }
  }

  private correctWord(editor: Editor, line: string, lineNo: number) {
    const doc   = editor.getDoc();
    const match = line.match(LAST_WORD_REGEX);
    if (!match) return;

    const word = match[0];
    if (this.exclusionSet.has(word.toLowerCase())) return;

    const start = line.lastIndexOf(word);
    if (
      word.length >= 3 &&
      word[0] === word[0].toUpperCase() &&
      word[1] === word[1].toUpperCase() &&
      word[2] === word[2].toLowerCase() &&
      !this.isInProtectedBlock(editor, start, lineNo)
    ) {
      this._suppressChangeEvent = true;
      doc.replaceRange(word[1].toLowerCase(), { line: lineNo, ch: start + 1 }, { line: lineNo, ch: start + 2 });
    }
  }

  private correctSentence(editor: Editor, line: string, lineNo: number) {
    const doc          = editor.getDoc();
    const sentenceRegex = /(?:^|[.!?]\s+)([a-zäöüß])/gu;
    let match: RegExpExecArray | null;

    while ((match = sentenceRegex.exec(line))) {
      const charIdx = match.index + match[0].length - 1;

      if (this.isInProtectedBlock(editor, charIdx, lineNo)) continue;

      const prevText = line.substring(0, charIdx).trimEnd();
      const lastWord = prevText.split(/\s+/).pop();
      if (lastWord && this.abbreviationsSet.has(lastWord.toLowerCase())) continue; // abbreviation, skip

      const charToCheck = line[charIdx];
      if (
        !/[A-Za-zÄÖÜäöüß]/.test(charToCheck) ||
        this.exclusionSet.has(charToCheck.toLowerCase())
      ) continue;

      this._suppressChangeEvent = true;
      doc.replaceRange(charToCheck.toUpperCase(), { line: lineNo, ch: charIdx }, { line: lineNo, ch: charIdx + 1 });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Protected‑block detection (YAML, fenced code/math, inline code/math)
  // ──────────────────────────────────────────────────────────────────────

  private isInProtectedBlock(editor: Editor, pos: number, lineNo?: number): boolean {
    if (this._lookedForProtectedBlock) return this._isInProtectedBlock;

    const doc         = editor.getDoc();
    const currentLine = lineNo !== undefined ? lineNo : doc.getCursor().line;
    const line        = doc.getLine(currentLine);

    // 1) YAML front‑matter
    const firstLine = doc.getLine(0).trim();
    if (firstLine === '---') {
      let frontmatterEnd = -1;
      for (let i = 1; i < currentLine; i++) {
        if (doc.getLine(i).trim() === '---') { frontmatterEnd = i; break; }
      }
      if (frontmatterEnd === -1 || currentLine <= frontmatterEnd) {
        this._isInProtectedBlock = true;
        this._lookedForProtectedBlock = true;
        return true;
      }
    }

    // 2) fenced code blocks ```
    const linesAbove       = doc.getRange({ line: 0, ch: 0 }, { line: currentLine, ch: 0 });
    const codeBlockMatches = (linesAbove.match(/^```/gm) || []).length;
    if (codeBlockMatches % 2 !== 0) {
      this._isInProtectedBlock = true;
      this._lookedForProtectedBlock = true;
      return true;
    }

    // fenced math $$
    const mathBlockMatches = (linesAbove.match(/^\$\$/gm) || []).length;
    if (mathBlockMatches % 2 !== 0) {
      this._isInProtectedBlock = true;
      this._lookedForProtectedBlock = true;
      return true;
    }

    // 3) inline code/math in current line up to pos
    let backticks = 0;
    let dollars   = 0;
    for (let i = 0; i < pos && i < line.length; i++) {
      if (line[i] === '`' && (i === 0 || line[i - 1] !== '\\')) backticks++;
      if (line[i] === '$' && (i === 0 || line[i - 1] !== '\\')) dollars++;
    }
    if (backticks % 2 !== 0 || dollars % 2 !== 0) {
      this._isInProtectedBlock = true;
      this._lookedForProtectedBlock = true;
      return true;
    }

    this._isInProtectedBlock = false;
    this._lookedForProtectedBlock = true;
    return false;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Settings persistence
  // ──────────────────────────────────────────────────────────────────────

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.updateInternalSets();
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// Settings tab UI
// ────────────────────────────────────────────────────────────────────────────────

class AutoCorrectSettingTab extends PluginSettingTab {
  plugin: AutoCorrectPlugin;

  constructor(app: any, plugin: AutoCorrectPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'AutoCorrect Plugin Settings' });

    // Exclusion list
    new Setting(containerEl)
      .setName('Exclusion List')
      .setDesc('Words that should never be modified (comma separated).')
      .addTextArea((text) =>
        text
          .setValue(this.plugin.settings.exclusionList.join(', '))
          .onChange(async (value) => {
            this.plugin.settings.exclusionList = value.split(',').map((w) => w.trim());
            await this.plugin.saveSettings();
          }),
      );

    // Capitalize list items
    new Setting(containerEl)
      .setName('Capitalize list items')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.capitalizeListItem)
          .onChange(async (value) => {
            this.plugin.settings.capitalizeListItem = value;
            await this.plugin.saveSettings();
          }),
      );

    // Capitalize sentences
    new Setting(containerEl)
      .setName('Capitalize sentences')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.capitalizeSentences)
          .onChange(async (value) => {
            this.plugin.settings.capitalizeSentences = value;
            await this.plugin.saveSettings();
            this.display(); // refresh to show/hide abbreviation box
          }),
      );

    // Abbreviations (visible only if sentence cap is enabled)
    if (this.plugin.settings.capitalizeSentences) {
      new Setting(containerEl)
        .setName('Abbreviations')
        .setDesc('Comma separated list of abbreviations that end with a dot but should not end a sentence.')
        .addTextArea((text) =>
          text
            .setValue(this.plugin.settings.abbreviations.join(', '))
            .onChange(async (value) => {
              this.plugin.settings.abbreviations = value.split(',').map((w) => w.trim());
              await this.plugin.saveSettings();
            }),
        );
    }
  }
}

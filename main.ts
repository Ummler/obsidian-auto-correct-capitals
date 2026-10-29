import { Plugin, PluginSettingTab, Setting, Editor } from 'obsidian';

// ────────────────────────────────────────────────────────────────────────────────
// Globals
// ────────────────────────────────────────────────────────────────────────────────

const TRIGGER_CHARS: string[] = [' ', '.', ',', ';', ':', '!', '?', '{', '"', ')', ']', '%', '}'];
const LAST_WORD_REGEX = /[\p{L}\p{M}'’]+(?=[^\p{L}\p{M}'’]*$)/u;
const LIST_ITEM_REGEX = /^[\t ]*(?:[-*+]|\d+\.)[\t ]+(?:\[[ xX]\][\t ]+)?/;
const WORD_REGEX = /^[\p{L}][\p{L}\p{M}'’]*/u;
const DOUBLE_CAPITALS_REGEX = /^(\p{Lu})(\p{Lu})(\p{Ll})/u;

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

  // Only multiline context is position-independent within an editor change.
  private _isInBlock: boolean | undefined;

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
    this._isInBlock = undefined;

    if (wasEnter && lineNo > 0) lineNo--;             // process just‑finished line

    const fullLine = doc.getLine(lineNo);
    if (!fullLine) return;

    // Trigger detection
    const trigger = wasEnter || TRIGGER_CHARS.includes((fullLine.substring(0, cursor.ch).slice(-1) || ''));
    if (!trigger) return;

    // Read the updated line between corrections: Unicode casing can change length.
    this.correctWord(editor, doc.getLine(lineNo), lineNo);
    if (this.settings.capitalizeListItem) {
      this.correctListItem(editor, doc.getLine(lineNo), lineNo);
    }
    if (this.settings.capitalizeSentences) {
      this.correctSentence(editor, doc.getLine(lineNo), lineNo);
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Corrections
  // ──────────────────────────────────────────────────────────────────────

  private correctListItem(editor: Editor, line: string, lineNo: number) {
    const prefix = line.match(LIST_ITEM_REGEX);
    if (!prefix) return;
    const wordStart = prefix[0].length;
    const word = line.slice(wordStart).match(WORD_REGEX)?.[0];
    if (!word || this.exclusionSet.has(word.toLowerCase())) return;
    if (this.isInProtectedBlock(editor, wordStart, lineNo)) return;

    const first = Array.from(word)[0];
    const replacement = DOUBLE_CAPITALS_REGEX.test(word)
      ? word.replace(DOUBLE_CAPITALS_REGEX, (_, a, b, c) => a + b.toLowerCase() + c)
      : first.toUpperCase() + word.slice(first.length);
    if (replacement === word) return;
    this._suppressChangeEvent = true;
    editor.getDoc().replaceRange(replacement,
      { line: lineNo, ch: wordStart },
      { line: lineNo, ch: wordStart + word.length });
  }

  private correctWord(editor: Editor, line: string, lineNo: number) {
    const doc   = editor.getDoc();
    const match = line.match(LAST_WORD_REGEX);
    if (!match) return;

    const word = match[0];
    if (this.exclusionSet.has(word.toLowerCase())) return;

    const start = line.lastIndexOf(word);
    const capitals = word.match(DOUBLE_CAPITALS_REGEX);
    if (!capitals || this.isInProtectedBlock(editor, start, lineNo)) return;
    const secondStart = start + capitals[1].length;
    this._suppressChangeEvent = true;
    doc.replaceRange(capitals[2].toLowerCase(),
      { line: lineNo, ch: secondStart },
      { line: lineNo, ch: secondStart + capitals[2].length });
  }

  private correctSentence(editor: Editor, line: string, lineNo: number) {
    const sentenceRegex = /(?:^|[.!?]\s+)(\p{Ll})/gu;
    const replacements: { start: number; char: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = sentenceRegex.exec(line))) {
      const char = match[1];
      const start = match.index + match[0].length - char.length;
      if (this.isInProtectedBlock(editor, start, lineNo)) continue;

      // Ignore opening punctuation, but retain dots inside the abbreviation.
      const previous = line.slice(0, start).trimEnd().split(/\s+/).pop()
        ?.replace(/^[([{<"'“‘«]+/u, '');
      if (previous && this.abbreviationsSet.has(previous.toLowerCase())) continue;
      const word = line.slice(start).match(WORD_REGEX)?.[0];
      if (word && this.exclusionSet.has(word.toLowerCase())) continue;
      replacements.push({ start, char });
    }
    // Right-to-left replacements preserve offsets even for ß -> SS.
    for (const { start, char } of replacements.reverse()) {
      this._suppressChangeEvent = true;
      editor.getDoc().replaceRange(char.toUpperCase(),
        { line: lineNo, ch: start }, { line: lineNo, ch: start + char.length });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Protected-block detection (YAML, fenced code/math, inline code/math, URLs)
  // ──────────────────────────────────────────────────────────────────────

  private isInProtectedBlock(editor: Editor, pos: number, lineNo: number): boolean {
    const doc = editor.getDoc();
    const line = doc.getLine(lineNo);
    if (this._isInBlock === undefined) {
      this._isInBlock = this.isInMultilineBlock(editor, lineNo);
    }
    if (this._isInBlock) return true;

    // URL and inline protection must be checked for each individual position.
    // Protect the scheme as soon as ':' is typed, before the slashes exist.
    const urls = /https?:[^\s<>"`]*/gi;
    let url: RegExpExecArray | null;
    while ((url = urls.exec(line))) {
      if (pos >= url.index && pos < url.index + url[0].length) return true;
    }
    let backticks = 0;
    let dollars = 0;
    for (let i = 0; i < pos; i++) {
      if (line[i] === '\\') { i++; continue; }
      if (line[i] === '`') backticks++;
      if (line[i] === '$') dollars++;
    }
    return backticks % 2 !== 0 || dollars % 2 !== 0;
  }

  private isInMultilineBlock(editor: Editor, currentLine: number): boolean {
    const doc = editor.getDoc();
    // 1) YAML front‑matter
    const firstLine = doc.getLine(0).trim();
    if (firstLine === '---') {
      let frontmatterEnd = -1;
      for (let i = 1; i < currentLine; i++) {
        if (doc.getLine(i).trim() === '---') { frontmatterEnd = i; break; }
      }
      if (frontmatterEnd === -1 || currentLine <= frontmatterEnd) {
        return true;
      }
    }

    // 2) fenced code blocks ```
    const linesAbove       = doc.getRange({ line: 0, ch: 0 }, { line: currentLine, ch: 0 });
    const codeBlockMatches = (linesAbove.match(/^```/gm) || []).length;
    if (codeBlockMatches % 2 !== 0) {
      return true;
    }

    // fenced math $$
    const mathBlockMatches = (linesAbove.match(/^\$\$/gm) || []).length;
    if (mathBlockMatches % 2 !== 0) {
      return true;
    }

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

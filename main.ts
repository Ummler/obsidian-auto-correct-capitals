import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { editorExtension } from './src/editor';
import { AutoCorrectSettings, CorrectionPolicy, DEFAULT_SETTINGS, loadSettings } from './src/settings';

export default class AutoCorrectPlugin extends Plugin {
  settings: AutoCorrectSettings = { ...DEFAULT_SETTINGS };
  private policy = new CorrectionPolicy(this.settings);
  private paused = false;
  private status?: HTMLElement;

  async onload() {
    await this.loadSettings();
    this.registerEditorExtension(editorExtension(() => this.policy));
    this.addSettingTab(new AutoCorrectSettingTab(this.app, this));
    this.status = this.addStatusBarItem();
    this.updateStatus();
    this.addCommand({
      id: 'toggle-auto-correction',
      name: 'Pause/resume auto correction',
      callback: () => {
        this.paused = !this.paused;
        this.policy = new CorrectionPolicy(this.settings, this.paused);
        this.updateStatus();
        new Notice(this.paused ? 'Auto correction paused' : 'Auto correction resumed');
      },
    });
  }

  private updateStatus() {
    this.status?.setText(this.paused ? 'AutoCorrect: paused' : 'AutoCorrect: on');
  }

  async loadSettings() {
    this.settings = loadSettings(await this.loadData());
    this.policy = new CorrectionPolicy(this.settings, this.paused);
  }

  async saveSettings() {
    this.policy = new CorrectionPolicy(this.settings, this.paused);
    await this.saveData(this.settings);
  }
}

class AutoCorrectSettingTab extends PluginSettingTab {
  plugin: AutoCorrectPlugin;

  constructor(app: App, plugin: AutoCorrectPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'AutoCorrect Plugin Settings' });

    new Setting(containerEl)
      .setName('Excluded folders')
      .setDesc('One vault-relative folder per line. Subfolders are included. A note can also opt out with auto-correct-capitals: false in its frontmatter.')
      .addTextArea(text => text.setValue(this.plugin.settings.excludedFolders.join('\n'))
        .onChange(async value => {
          this.plugin.settings.excludedFolders = value.split('\n').map(folder => folder.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Respect repeated spelling')
      .setDesc('After a correction, keep an identical spelling retyped at the same location. Moving to another word clears this temporary exception.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.respectRepeatedSpelling)
        .onChange(async value => {
          this.plugin.settings.respectRepeatedSpelling = value;
          await this.plugin.saveSettings();
        }));

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

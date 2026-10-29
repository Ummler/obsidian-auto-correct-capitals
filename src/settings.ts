export interface AutoCorrectSettings {
  exclusionList: string[];
  capitalizeListItem: boolean;
  capitalizeSentences: boolean;
  abbreviations: string[];
  respectRepeatedSpelling: boolean;
  excludedFolders: string[];
}

export const DEFAULT_SETTINGS: AutoCorrectSettings = {
  exclusionList: [], capitalizeListItem: false, capitalizeSentences: false,
  abbreviations: ['e.g.', 'i.e.', 'etc.', 'vs.'],
  respectRepeatedSpelling: true,
  excludedFolders: [],
};

export const normalizeWord = (word: string): string => word.normalize('NFC').toLowerCase();

export class CorrectionPolicy {
  readonly exclusions: Set<string>;
  readonly abbreviations: Set<string>;
  private readonly folders: string[];
  constructor(readonly settings: AutoCorrectSettings) {
    this.exclusions = new Set(settings.exclusionList.map(normalizeWord));
    this.abbreviations = new Set(settings.abbreviations.map(normalizeWord));
    this.folders = settings.excludedFolders.map(folder => folder.replace(/\\/g, '/')
      .replace(/^\.\//, '').replace(/^\/+|\/+$/g, '')).filter(Boolean);
  }

  excludesPath(path: string): boolean {
    const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
    return this.folders.some(folder => parent === folder || parent.startsWith(folder + '/'));
  }
}

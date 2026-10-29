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
  constructor(readonly settings: AutoCorrectSettings, readonly paused = false) {
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

// Saved settings can predate new options or contain manually edited values.
export function loadSettings(data: unknown): AutoCorrectSettings {
  const raw = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const strings = (value: unknown, fallback: string[]) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean)
    : [...fallback];
  return {
    exclusionList: strings(raw.exclusionList, DEFAULT_SETTINGS.exclusionList),
    abbreviations: strings(raw.abbreviations, DEFAULT_SETTINGS.abbreviations),
    excludedFolders: strings(raw.excludedFolders, DEFAULT_SETTINGS.excludedFolders),
    capitalizeListItem: typeof raw.capitalizeListItem === 'boolean' ? raw.capitalizeListItem : false,
    capitalizeSentences: typeof raw.capitalizeSentences === 'boolean' ? raw.capitalizeSentences : false,
    respectRepeatedSpelling: typeof raw.respectRepeatedSpelling === 'boolean' ? raw.respectRepeatedSpelling : true,
  };
}

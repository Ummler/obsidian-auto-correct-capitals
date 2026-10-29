export interface AutoCorrectSettings {
  exclusionList: string[];
  capitalizeListItem: boolean;
  capitalizeSentences: boolean;
  abbreviations: string[];
}

export const DEFAULT_SETTINGS: AutoCorrectSettings = {
  exclusionList: [], capitalizeListItem: false, capitalizeSentences: false,
  abbreviations: ['e.g.', 'i.e.', 'etc.', 'vs.'],
};

export const normalizeWord = (word: string): string => word.normalize('NFC').toLowerCase();

export class CorrectionPolicy {
  readonly exclusions: Set<string>;
  readonly abbreviations: Set<string>;
  constructor(readonly settings: AutoCorrectSettings) {
    this.exclusions = new Set(settings.exclusionList.map(normalizeWord));
    this.abbreviations = new Set(settings.abbreviations.map(normalizeWord));
  }
}

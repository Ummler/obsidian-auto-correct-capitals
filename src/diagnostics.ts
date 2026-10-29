export interface CorrectionDiagnostic {
  reason: string;
  from?: number;
  to?: number;
  documentCharacters: number;
  userEvent?: string;
}
export class CorrectionDiagnostics {
  private listeners = new Set<(event: CorrectionDiagnostic) => void>();
  observe(listener: (event: CorrectionDiagnostic) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  emit(reason: string, documentCharacters: number, from?: number, to?: number, userEvent?: string) {
    if (!this.listeners.size) return;
    for (const listener of this.listeners) {
      try { listener({ reason, documentCharacters, from, to, userEvent }); } catch { /* Diagnostics cannot affect typing. */ }
    }
  }
  clear() { this.listeners.clear(); }
}

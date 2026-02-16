
import { CvConversionEvent, UsageSummary } from "../types";

const STORAGE_KEY = 'november_cv_usage_events';

class UsageService {
  private getEvents(): CvConversionEvent[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error("Failed to load usage events", e);
      return [];
    }
  }

  private saveEvents(events: CvConversionEvent[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch (e) {
      console.error("Failed to save usage events", e);
    }
  }

  public async generateHash(content: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Checks if this specific file content has already been processed.
   * Useful for informing the user, though we may still bill for re-processing.
   */
  public isDuplicate(sourceHash: string): string | null {
    const events = this.getEvents();
    // Sort by date to get the most recent one
    const matches = events
      .filter(e => e.source_hash === sourceHash)
      .sort((a, b) => new Date(b.converted_at).getTime() - new Date(a.converted_at).getTime());
    
    return matches.length > 0 ? matches[0].converted_at : null;
  }

  /**
   * Records a billable event.
   * Logic: +1 for every UNIQUE successful generation call.
   * To prevent double-counting on UI retries/refreshes, we use a unique generationId
   * provided by the caller that persists during the retry cycle.
   */
  public recordConversion(cvId: string, sourceHash: string, fileName: string, generationId?: string): boolean {
    const events = this.getEvents();
    
    // Idempotency check: if this specific generationId was already recorded, skip.
    // This prevents double-billing if the UI loop retries or the user double-clicks.
    if (generationId && events.some(e => e.event_id === generationId)) {
      return false;
    }

    const newEvent: CvConversionEvent = {
      event_id: generationId || crypto.randomUUID(),
      cv_id: cvId,
      source_hash: sourceHash,
      file_name: fileName,
      converted_at: new Date().toISOString()
    };

    events.push(newEvent);
    this.saveEvents(events);
    return true;
  }

  public getTotalCount(): number {
    return this.getEvents().length;
  }

  public getCurrentMonthCount(): number {
    const events = this.getEvents();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    return events.filter(e => {
      const d = new Date(e.converted_at);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    }).length;
  }

  public getUsageSummary(): UsageSummary[] {
    const events = this.getEvents();
    const summaryMap = new Map<string, number>();

    events.forEach(e => {
      const d = new Date(e.converted_at);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      summaryMap.set(ym, (summaryMap.get(ym) || 0) + 1);
    });

    const sortedKeys = Array.from(summaryMap.keys()).sort().reverse();

    return sortedKeys.map(ym => ({
      year_month: ym,
      count: summaryMap.get(ym) || 0,
      status: 'OPEN'
    }));
  }
}

export const usageService = new UsageService();

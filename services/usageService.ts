import { UsageSummary } from "../types";
import { config } from "../config";

const TRACKING_URL_KEY = 'november_cv_tracking_url';
const ADMIN_USER_KEY = 'november_cv_admin_user';
const CACHE_SUMMARY_KEY = 'november_cv_cache_summary';
const CACHE_TOTAL_KEY = 'november_cv_cache_total';
const CACHE_TS_KEY = 'november_cv_cache_ts';
const CACHE_TTL_MS = 60_000; // 60 seconds

class UsageService {

  // ─── Admin user ─────────────────────────────────────────────────────────────
  public getAdminUser(): string {
    return localStorage.getItem(ADMIN_USER_KEY) || '';
  }
  public setAdminUser(name: string) {
    localStorage.setItem(ADMIN_USER_KEY, name.trim());
  }

  // ─── Tracking URL ───────────────────────────────────────────────────────────
  public getTrackingUrl(): string {
    return config.trackingUrl || localStorage.getItem(TRACKING_URL_KEY) || '';
  }
  public setTrackingUrl(url: string) {
    localStorage.setItem(TRACKING_URL_KEY, url.trim());
  }

  // ─── Hash util ──────────────────────────────────────────────────────────────
  public async generateHash(content: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ─── POST: record a conversion ──────────────────────────────────────────────
  public async recordConversion(
    cvId: string,
    sourceHash: string,
    fileName: string,
    candidateName: string,
    generationId?: string
  ): Promise<boolean> {
    const url = this.getTrackingUrl();
    if (!url) return false;

    const eventId = generationId || crypto.randomUUID();
    const adminUser = this.getAdminUser() || 'Onbekend';

    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record',
          event_id: eventId,
          cv_id: cvId,
          source_hash: sourceHash,
          file_name: fileName,
          candidate_name: candidateName,
          admin_user: adminUser,
        }),
        mode: 'no-cors',
      });
      this.invalidateCache();
      return true;
    } catch (e) {
      console.error("Failed to record conversion:", e);
      return false;
    }
  }

  // ─── POST: record a regenerate (per-job rewrite) ────────────────────────────
  public async recordRegenerate(
    cvId: string,
    candidateName: string,
    jobRole: string
  ): Promise<boolean> {
    const url = this.getTrackingUrl();
    if (!url) return false;

    const adminUser = this.getAdminUser() || 'Onbekend';

    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'regenerate',
          event_id: crypto.randomUUID(),
          cv_id: cvId,
          file_name: jobRole,
          candidate_name: candidateName,
          admin_user: adminUser,
        }),
        mode: 'no-cors',
      });
      return true;
    } catch (e) {
      console.error('Failed to record regenerate:', e);
      return false;
    }
  }

  // ─── GET: live from Google Sheets ────────────────────────────────────────────
  public async fetchLiveSummary(): Promise<{ summary: UsageSummary[]; total: number }> {
    const url = this.getTrackingUrl();
    if (this.isCacheFresh()) return this.readCache();
    if (!url) return { summary: [], total: 0 };

    try {
      const res = await fetch(`${url}?action=summary`);
      const json = await res.json();
      if (json.ok) {
        const result = { summary: json.summary as UsageSummary[], total: Number(json.total) };
        this.writeCache(result);
        return result;
      }
    } catch (e) {
      console.warn("Tracking backend unreachable, using cache:", e);
    }
    return this.readCache();
  }

  public async fetchLog(month?: string, limit = 200): Promise<AuditEntry[]> {
    const url = this.getTrackingUrl();
    if (!url) return [];
    try {
      const params = new URLSearchParams({ action: 'log', limit: String(limit) });
      if (month) params.set('month', month);
      const res = await fetch(`${url}?${params}`);
      const json = await res.json();
      return json.ok ? (json.log as AuditEntry[]) : [];
    } catch (e) {
      console.error("Failed to fetch audit log:", e);
      return [];
    }
  }

  // ─── Synchronous cache reads (for instant UI) ────────────────────────────────
  public getCachedTotal(): number { return this.readCache().total; }
  public getCachedMonthCount(): number {
    const { summary } = this.readCache();
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return summary.find(s => s.year_month === month)?.count ?? 0;
  }

  // Legacy sync aliases (so App.tsx still compiles during migration)
  public getTotalCount(): number { return this.getCachedTotal(); }
  public getCurrentMonthCount(): number { return this.getCachedMonthCount(); }
  public getUsageSummary(): UsageSummary[] { return this.readCache().summary; }

  // ─── Cache helpers ───────────────────────────────────────────────────────────
  private isCacheFresh(): boolean {
    const ts = localStorage.getItem(CACHE_TS_KEY);
    return ts ? Date.now() - Number(ts) < CACHE_TTL_MS : false;
  }
  private writeCache(data: { summary: UsageSummary[]; total: number }) {
    try {
      localStorage.setItem(CACHE_SUMMARY_KEY, JSON.stringify(data.summary));
      localStorage.setItem(CACHE_TOTAL_KEY, String(data.total));
      localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
    } catch (_) { }
  }
  private readCache(): { summary: UsageSummary[]; total: number } {
    try {
      return {
        summary: JSON.parse(localStorage.getItem(CACHE_SUMMARY_KEY) || '[]') as UsageSummary[],
        total: Number(localStorage.getItem(CACHE_TOTAL_KEY) || '0'),
      };
    } catch (_) { return { summary: [], total: 0 }; }
  }
  private invalidateCache() { localStorage.removeItem(CACHE_TS_KEY); }
}

export interface AuditEntry {
  timestamp: string;
  event_id: string;
  admin_user: string;
  candidate_name: string;
  file_name: string;
  source_hash: string;
  cv_id: string;
  month: string;
}

export const usageService = new UsageService();
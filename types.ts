
export interface CVAnalysis {
  scores: {
    overall: number;
    relevance: number;
    skillMatch: number;
    completeness: number;
    consistency: number;
    professional: number;
  };
  profile: {
    sector: string;
    role: string;
    seniority: string;
  };
  tags: string[];
  strengths: string[];
  weaknesses: string[];
  summary: string;
  extendedSummary?: string;
  vacancyMatches?: Array<{
    title: string;
    score: number;
  }>;
  risks?: string[];
}

export interface ParsedCV {
  personalInfo: {
    name: string;
    availability: string;
    skj?: string;
    skjDate?: string;
    title?: string; // mevrouw/de heer
    roepnaam?: string;
    hours?: string;
    placeOfResidence?: string; // Punt 2 — Maria
    gender?: string;           // Punt 2 — Maria
    holidaySchedule?: string;  // Punt 2 — Maria
  };
  education: Array<{
    period: string;
    degree: string;
    status: string;
    school?: string;
    plaats?: string;
  }>;
  courses: Array<{
    period: string;
    title: string;
    institute?: string;
  }>;
  systems?: string[];
  languages: string[];
  references?: Array<{
    name: string;
    contact: string;
    role?: string;
    company?: string;
  }>;
  referencesOnRequest?: boolean;
  experience: Array<{
    period: string;
    employer: string;
    role: string;
    bullets: string[];
    pageBreakBefore?: boolean;
    pinned?: boolean;
  }>;
  hideSeparators?: boolean[];
  analysis?: CVAnalysis;
  motivationLetter?: string; // Punt 1 — cover letter (downloaded as separate PDF)
  manualOrder?: boolean;     // Punt 5 — when true, experience array is rendered in array order (not date-sorted)
  wasFinalGradeProcessed?: boolean; // Punt 13 — set true when final-grade mode was applied during conversion
}

export enum AppState {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface CVCheckResult {
  issues: string;
  questions: string;
  improvements: string;
}

export interface BatchItem {
  id: string;
  file: File;
  status: 'PENDING' | 'READY' | 'PROCESSING' | 'SUCCESS' | 'ERROR';
  statusMessage?: string;
  result?: ParsedCV;
  error?: string;
  textContext?: string;
  base64Data?: string;
  mimeType?: string;

  motivationLetter?: string;
  candidateProfile?: string;
  clientEmail?: string;
  cvCheck?: CVCheckResult;

  isDuplicate?: boolean;
  duplicateDate?: string;
}

export interface CvConversionEvent {
  event_id: string;
  cv_id: string;
  source_hash: string;
  file_name: string;
  converted_at: string;
}

export interface UsageSummary {
  year_month: string;
  count: number;
  status: 'OPEN' | 'INVOICED';
}
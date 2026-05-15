import React from 'react';
import { Document, Page, View, Text, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { ParsedCV } from '../types';

// ─── FONT REGISTRATION ───────────────────────────────────────────────────────
// IMPORTANT: Use .ttf (not .woff) to avoid character-drop bugs in @react-pdf
const FONT_BASE = (typeof window !== 'undefined' ? window.location.origin : '') + '/fonts/';

Font.register({
  family: 'Garet',
  fonts: [
    { src: FONT_BASE + 'Garet-Book.ttf', fontWeight: 'normal' },
    { src: FONT_BASE + 'Garet-Bold.ttf', fontWeight: 'bold' },
  ],
});

Font.registerHyphenationCallback(word => [word]);

// ─── COLORS ──────────────────────────────────────────────────────────────────
const COLOR_DARK_GREEN = '#284d32';
const COLOR_LIME = '#e3fd01';
const COLOR_TAG_ORANGE = '#f27f61';
const COLOR_ORANGE_SEP = '#FF6B35';
const COLOR_BLACK = '#000000';
const COLOR_WHITE = '#FFFFFF';
const COLOR_GREY = '#666666';

// ─── ASSET URLs ──────────────────────────────────────────────────────────────
const LOGO_PNG = (typeof window !== 'undefined' ? window.location.origin : '') + '/logo.png';
const ARROW_PNG = (typeof window !== 'undefined' ? window.location.origin : '') + '/logo-footer.png';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const toTitleCase = (str: string) => {
  if (!str) return str;
  return str.replace(/\b\w+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
};

const formatDateToNumbers = (text: string): string => {
  if (!text) return text;
  const monthMap: Record<string, string> = {
    'januari': '01', 'februari': '02', 'maart': '03', 'april': '04', 'mei': '05', 'juni': '06',
    'juli': '07', 'augustus': '08', 'september': '09', 'oktober': '10', 'november': '11', 'december': '12',
    'jan': '01', 'feb': '02', 'mrt': '03', 'apr': '04', 'jun': '06', 'jul': '07',
    'aug': '08', 'sep': '09', 'sept': '09', 'okt': '10', 'nov': '11', 'dec': '12',
  };
  let result = text.replace(/\s*[–—]\s*/g, ' - ');
  result = result.replace(/([a-zA-Z]+)'?\s+(\d{4})/g, (match, monthStr, yearStr) => {
    const key = monthStr.toLowerCase().replace(/['.]/g, '');
    const num = monthMap[key];
    return num ? num + '/' + yearStr : match;
  });
  result = result.replace(/(\s|^|-)(\d)\/(\d{4})/g, (m, pre, d, y) => pre + '0' + d + '/' + y);
  result = result.replace(/\b(nu|now|present|today)\b/gi, 'heden');
  return result;
};

const parsePeriodStart = (period: string): number => {
  if (!period) return 0;
  const p = formatDateToNumbers(period);
  const mmyyyy = p.match(/(\d{2})\/(\d{4})/);
  if (mmyyyy) return parseInt(mmyyyy[2]) * 100 + parseInt(mmyyyy[1]);
  const yyyy = p.match(/(\d{4})/);
  if (yyyy) return parseInt(yyyy[1]) * 100;
  return 0;
};

const parsePeriodEnd = (period: string): number => {
  if (!period) return 0;
  const p = formatDateToNumbers(period);
  const matches = [...p.matchAll(/(\d{2})\/(\d{4})/g)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    return parseInt(last[2]) * 100 + parseInt(last[1]);
  }
  const yearMatches = [...p.matchAll(/(\d{4})/g)];
  if (yearMatches.length > 0) {
    return parseInt(yearMatches[yearMatches.length - 1][1]) * 100;
  }
  return 0;
};

const yearOnly = (s: string): string => {
  if (!s) return '';
  const m = s.match(/\d{4}/);
  return m ? m[0] : s.trim();
};

const splitPeriod = (period: string): { start: string; end: string } => {
  if (!period) return { start: '', end: '' };
  const parts = formatDateToNumbers(period).split(/\s*-\s*/);
  return { start: parts[0] || '', end: parts[1] || '' };
};

const stripCoursePrefix = (title: string): string => {
  if (!title) return title;
  return title.replace(/^(Training|Cursus|Leergang|Workshop)\s+/i, '').trim();
};

const buildHeaderSubtitle = (data: ParsedCV): string[] => {
  const isValid = (v?: string | null) => {
    if (!v) return false;
    const trimmed = v.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    // Reject placeholders, field names, and "unspecified" markers
    if (lower.includes('niet gespecificeerd')) return false;
    if (lower.includes('onbekend')) return false;
    if (lower === 'skj' || lower === 'skjdate' || lower === 'availability' || lower === 'hours') return false;
    if (lower === 'n/a' || lower === 'na' || lower === '-') return false;
    return true;
  };
  const parts: string[] = [];
  const avail = (data.personalInfo?.availability || '').trim();
  const lowerAvail = avail.toLowerCase().trim();
  let availStr: string;
  if (lowerAvail.includes('direct')) {
    availStr = 'Per direct beschikbaar';
  } else if (lowerAvail.includes('beschikbaar')) {
    availStr = avail; // user wrote their own complete phrase
  } else {
    availStr = `Beschikbaar per ${avail}`;
  }
  parts.push(isValid(data.personalInfo?.availability) ? availStr : 'Beschikbaar op aanvraag');
  if (isValid(data.personalInfo?.hours)) {
    const h = data.personalInfo!.hours!;
    parts.push(`${h}${h.includes('uur per week') ? '' : ' uur per week'}`);
  }
  if (isValid(data.personalInfo?.skj)) {
    parts.push(`SKJ-Registratie: ${data.personalInfo!.skj}`);
    if (isValid(data.personalInfo?.skjDate)) parts.push(`Afgegeven op ${data.personalInfo!.skjDate}`);
  }
  return parts;
};

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Garet',
    fontSize: 9.5,
    color: COLOR_BLACK,
    backgroundColor: COLOR_WHITE,
    paddingTop: 30, // Breathing room on every page (including page 1 above header)
    paddingBottom: 90, // Reserve space for fixed footer (56) + safety gap
  },

  // HEADER (touches edges on page 1)
  header: {
    backgroundColor: COLOR_DARK_GREEN,
    color: COLOR_WHITE,
    paddingHorizontal: 40,
    paddingVertical: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 130,
  },
  headerLeft: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 20,
  },
  headerName: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLOR_WHITE,
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 10,
    color: COLOR_LIME,
    flexDirection: 'row',
    flexWrap: 'wrap',
    lineHeight: 1.5,
  },
  headerSubtitlePart: {
    color: COLOR_LIME,
  },
  headerSubtitleSep: {
    color: COLOR_LIME,
    marginHorizontal: 3,
  },
  headerLogo: {
    width: 75,
    height: 75,
    objectFit: 'contain',
  },

  // BODY
  body: {
    paddingHorizontal: 40,
    paddingTop: 20,
  },

  // TAGS SECTION
  tagsSection: {
    marginBottom: 18,
    alignItems: 'center',
  },
  tagsTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLOR_BLACK,
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: 0.5,
  },
  tagsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 10,
  },
  tag: {
    backgroundColor: COLOR_TAG_ORANGE,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6, // less bottom because @react-pdf baseline sits low; more top pushes text into visual center
    borderRadius: 999,
    minWidth: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagText: {
    color: COLOR_WHITE,
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 1.2,
    textTransform: 'uppercase',
  },

  // SECTION TITLE (lime green bar)
  sectionTitleWrap: {
    alignSelf: 'flex-start',
    backgroundColor: COLOR_LIME,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLOR_BLACK,
    letterSpacing: 0.3,
  },

  section: {
    marginBottom: 16,
  },

  // EDUCATION / COURSES rows
  eduRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  eduPeriod: {
    width: 80,
    fontSize: 9.5,
    color: COLOR_GREY,
  },
  eduContent: {
    flex: 1,
    fontSize: 9.5,
    color: COLOR_BLACK,
  },
  eduSchool: {
    color: COLOR_GREY,
  },

  // WORK EXPERIENCE
  expBlock: {
    marginBottom: 12,
  },
  expHeaderWrap: {
    marginBottom: 4,
  },
  expPeriod: {
    fontSize: 9.5,
    color: COLOR_GREY,
    marginBottom: 1,
  },
  expHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  expEmployer: {
    fontSize: 9.5,
    color: COLOR_BLACK,
  },
  expSep: {
    fontSize: 9.5,
    color: COLOR_BLACK,
    marginHorizontal: 3,
  },
  expRole: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLOR_BLACK,
    textTransform: 'uppercase',
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 1,
    paddingLeft: 4,
  },
  bulletDot: {
    fontSize: 9.5,
    marginRight: 4,
    color: COLOR_BLACK,
  },
  bulletText: {
    fontSize: 9.5,
    color: COLOR_BLACK,
    flex: 1,
    lineHeight: 1.35,
  },

  // SYSTEMS / LANGUAGES
  pipeText: {
    fontSize: 9.5,
    color: COLOR_BLACK,
    paddingLeft: 4,
  },

  // ORANGE SEPARATOR (matches CSS: #f27f61, full width, 1pt thin)
  orangeSep: {
    height: 1,
    backgroundColor: COLOR_TAG_ORANGE,
    marginTop: 8,
    marginBottom: 14,
    width: '100%',
  },

  // REFERENCES
  refBlock: {
    marginBottom: 8,
    paddingLeft: 4,
  },
  refMain: {
    fontSize: 9.5,
    color: COLOR_BLACK,
  },
  refSecondary: {
    fontSize: 9.5,
    color: COLOR_GREY,
  },

  // FIXED FOOTER (renders on every page) — matches CSS design: dark green band + lime stripes + arrow image
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: COLOR_DARK_GREEN,
  },
  footerLimeBarLeft: {
    position: 'absolute',
    left: 0,
    top: 28,
    height: 9,
    width: '65%',
    backgroundColor: COLOR_LIME,
  },
  footerLimeBarRight: {
    position: 'absolute',
    right: 0,
    top: 28,
    height: 9,
    width: '24%',
    backgroundColor: COLOR_LIME,
  },
  footerArrow: {
    position: 'absolute',
    left: '67%',
    top: 14,
    width: 28,
    height: 28,
    objectFit: 'contain',
  },
});

// ─── COMPONENT ────────────────────────────────────────────────────────────────

interface Props { data: ParsedCV; }

export const CVPdfDocument: React.FC<Props> = ({ data }) => {
  const subtitleParts = buildHeaderSubtitle(data);
  const tags = (data.analysis?.tags || []).slice(0, 5);
  const tagsRow1 = tags.slice(0, 3);
  const tagsRow2 = tags.slice(3, 5);

  // Sort education by most recent end-date, experience by most recent start-date
  const sortedEducation = [...(data.education || [])].sort(
    (a, b) => parsePeriodEnd(b.period) - parsePeriodEnd(a.period)
  );
  const sortedExperience = [...(data.experience || [])].sort(
    (a, b) => parsePeriodStart(b.period) - parsePeriodStart(a.period)
  );

  const hideSep = data.hideSeparators || [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEADER (only on first page) */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerName}>{toTitleCase(data.personalInfo?.name || 'Kandidaat Naam')}</Text>
            <View style={styles.headerSubtitle}>
              {subtitleParts.map((part, i) => (
                <React.Fragment key={i}>
                  <Text style={styles.headerSubtitlePart}>{part}</Text>
                  {i < subtitleParts.length - 1 && <Text style={styles.headerSubtitleSep}>|</Text>}
                </React.Fragment>
              ))}
            </View>
          </View>
          <Image src={LOGO_PNG} style={styles.headerLogo} />
        </View>

        <View style={styles.body}>
          {/* TAGS */}
          {tags.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={styles.tagsTitle}>WAAR DEZE PROFESSIONAL STERK IN IS</Text>
              {tagsRow1.length > 0 && (
                <View style={styles.tagsRow}>
                  {tagsRow1.map((t, i) => (
                    <View key={i} style={styles.tag}>
                      <Text style={styles.tagText}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
              {tagsRow2.length > 0 && (
                <View style={styles.tagsRow}>
                  {tagsRow2.map((t, i) => (
                    <View key={i} style={styles.tag}>
                      <Text style={styles.tagText}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* OPLEIDINGEN */}
          {sortedEducation.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleWrap}><Text style={styles.sectionTitle}>OPLEIDINGEN</Text></View>
              {sortedEducation.map((edu, i) => {
                const { start, end } = splitPeriod(edu.period);
                const periodStr = end ? `${yearOnly(start)} - ${yearOnly(end)}` : yearOnly(start);
                return (
                  <View key={i} style={styles.eduRow} wrap={false}>
                    <Text style={styles.eduPeriod}>{periodStr}</Text>
                    <Text style={styles.eduContent}>
                      {edu.degree}
                      {edu.school ? <Text style={styles.eduSchool}>, {edu.school}</Text> : null}
                      {edu.status ? <Text style={styles.eduSchool}> - {edu.status}</Text> : null}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* CURSUSSEN */}
          {data.courses && data.courses.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleWrap}><Text style={styles.sectionTitle}>CURSUSSEN</Text></View>
              <Text style={styles.pipeText}>
                {data.courses
                  .map(c => stripCoursePrefix(c.title))
                  .filter(t => t && t.trim())
                  .join(' | ')}
              </Text>
            </View>
          )}

          {/* Orange separator between Cursussen and Werkervaring */}
          {!hideSep[0] && (data.courses && data.courses.length > 0) && (
            <View style={styles.orangeSep} />
          )}

          {/* WERKERVARING */}
          {sortedExperience.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleWrap}><Text style={styles.sectionTitle}>WERKERVARING</Text></View>
              {sortedExperience.map((exp, i) => {
                // Strip employer prefix from role if duplicated
                let role = exp.role || '';
                if (exp.employer && role.toUpperCase().startsWith(exp.employer.toUpperCase())) {
                  const escaped = exp.employer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  role = role.replace(new RegExp(`^${escaped}\\s*\\|?\\s*`, 'i'), '').trim();
                }
                return (
                  <View key={i} style={styles.expBlock} break={!!exp.pageBreakBefore && i > 0}>
                    {/* period + employer + role MUST stay together */}
                    <View style={styles.expHeaderWrap} wrap={false}>
                      <Text style={styles.expPeriod}>{formatDateToNumbers(exp.period)}</Text>
                      <View style={styles.expHeaderRow}>
                        <Text style={styles.expEmployer}>{exp.employer}</Text>
                        {role && (
                          <>
                            <Text style={styles.expSep}>|</Text>
                            <Text style={styles.expRole}>{role.toUpperCase()}</Text>
                          </>
                        )}
                      </View>
                    </View>
                    {/* bullets — each can break across pages if needed, but a single bullet stays whole */}
                    {(exp.bullets || []).map((bullet, bi) => {
                      const clean = (bullet || '').trim().replace(/[.;]+$/, '');
                      const suffix = bi === exp.bullets.length - 1 ? '.' : ';';
                      return (
                        <View key={bi} style={styles.bulletRow} wrap={false}>
                          <Text style={styles.bulletDot}>•</Text>
                          <Text style={styles.bulletText}>{clean}{suffix}</Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          )}

          {/* Orange separator before Systemen/Talen */}
          {((data.systems && data.systems.length > 0) || (data.languages && data.languages.length > 0)) && !hideSep[1] && (
            <View style={styles.orangeSep} />
          )}

          {/* SYSTEEMKENNIS */}
          {data.systems && data.systems.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleWrap}><Text style={styles.sectionTitle}>SYSTEEMKENNIS</Text></View>
              <Text style={styles.pipeText}>{data.systems.join(' | ')}</Text>
            </View>
          )}

          {/* TALENKENNIS */}
          {data.languages && data.languages.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleWrap}><Text style={styles.sectionTitle}>TALENKENNIS</Text></View>
              <Text style={styles.pipeText}>{data.languages.join(' | ')}</Text>
            </View>
          )}

          {/* REFERENTIES */}
          {((data.references && data.references.length > 0) || data.referencesOnRequest) && (
            <>
              {!hideSep[2] && <View style={styles.orangeSep} />}
              <View style={styles.section}>
                <View style={styles.sectionTitleWrap}><Text style={styles.sectionTitle}>REFERENTIES</Text></View>
                {data.referencesOnRequest ? (
                  <Text style={[styles.pipeText, { color: COLOR_GREY }]}>Op aanvraag beschikbaar</Text>
                ) : (
                  (data.references || []).map((ref, ri) => (
                    <View key={ri} style={styles.refBlock} wrap={false}>
                      <Text style={styles.refMain}>
                        {ref.name}
                        {ref.contact ? <Text style={styles.refSecondary}> | {ref.contact}</Text> : null}
                      </Text>
                      {(ref.role || ref.company) && (
                        <Text style={styles.refSecondary}>
                          {ref.role}{ref.role && ref.company ? ' | ' : ''}{ref.company}
                        </Text>
                      )}
                    </View>
                  ))
                )}
              </View>
            </>
          )}
        </View>

        {/* Fixed Footer — renders on every page at bottom */}
        <View style={styles.footer} fixed>
          <View style={styles.footerLimeBarLeft} />
          <Image src={ARROW_PNG} style={styles.footerArrow} />
          <View style={styles.footerLimeBarRight} />
        </View>
      </Page>
    </Document>
  );
};

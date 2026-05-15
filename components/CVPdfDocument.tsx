import React from 'react';
import { Document, Page, View, Text, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { ParsedCV } from '../types';

// ─── FONT REGISTRATION ───────────────────────────────────────────────────────
// Garet font (local) — used for body text
Font.register({
  family: 'Garet',
  fonts: [
    { src: `${window.location.origin}/fonts/Garet-Book.woff`, fontWeight: 'normal' },
    { src: `${window.location.origin}/fonts/Garet-Bold.woff`, fontWeight: 'bold' },
  ],
});

// Helmet font fallback for "Agrandir" since Agrandir is not freely available
// Using a similar sans-serif fallback that comes with @react-pdf
Font.register({
  family: 'Helvetica',
  src: 'Helvetica',
});

// Disable hyphenation
Font.registerHyphenationCallback(word => [word]);

// ─── COLORS ──────────────────────────────────────────────────────────────────
const COLOR_DARK_GREEN = '#1E3A35';
const COLOR_LIME = '#e3fd01';
const COLOR_ORANGE = '#FF6B35';
const COLOR_BLACK = '#000000';
const COLOR_WHITE = '#FFFFFF';
const COLOR_GREY = '#666666';
const COLOR_LIGHT_GREY = '#999999';

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Garet',
    fontSize: 9,
    color: COLOR_BLACK,
    backgroundColor: COLOR_WHITE,
    padding: 0,
  },

  // Header
  header: {
    backgroundColor: COLOR_DARK_GREEN,
    color: COLOR_WHITE,
    padding: 24,
    marginBottom: 0,
  },
  headerName: {
    fontFamily: 'Helvetica',
    fontWeight: 'bold',
    fontSize: 28,
    color: COLOR_WHITE,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 10,
    color: COLOR_LIME,
    fontWeight: 'normal',
    lineHeight: 1.5,
  },

  // Body sections
  body: {
    padding: 24,
  },

  // Section titles (lime green background bar)
  sectionTitle: {
    backgroundColor: COLOR_LIME,
    color: COLOR_BLACK,
    fontFamily: 'Helvetica',
    fontWeight: 'bold',
    fontSize: 11,
    padding: '4 8',
    marginBottom: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
  },

  // Tags (analysis)
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  tag: {
    backgroundColor: COLOR_LIME,
    color: COLOR_BLACK,
    padding: '3 8',
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Orange separator line
  separator: {
    borderBottomWidth: 1.5,
    borderBottomColor: COLOR_ORANGE,
    marginVertical: 12,
  },

  // Education / Course rows
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  rowPeriod: {
    width: 100,
    fontSize: 9,
    color: COLOR_GREY,
  },
  rowContent: {
    flex: 1,
    fontSize: 9,
    color: COLOR_BLACK,
  },
  rowContentSecondary: {
    fontSize: 9,
    color: COLOR_GREY,
  },

  // Experience block
  expBlock: {
    marginBottom: 14,
  },
  expHeader: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  expPeriod: {
    width: 100,
    fontSize: 9,
    color: COLOR_GREY,
  },
  expDetails: {
    flex: 1,
  },
  expEmployer: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLOR_BLACK,
    marginBottom: 2,
  },
  expRole: {
    fontSize: 9,
    color: COLOR_GREY,
    marginBottom: 6,
  },
  bullet: {
    flexDirection: 'row',
    marginBottom: 2,
    paddingLeft: 8,
  },
  bulletDot: {
    width: 8,
    fontSize: 9,
    color: COLOR_BLACK,
  },
  bulletText: {
    flex: 1,
    fontSize: 9,
    color: COLOR_BLACK,
    lineHeight: 1.4,
  },

  // Systeemkennis / Talenkennis
  twoCol: {
    flexDirection: 'row',
    gap: 24,
  },
  col: {
    flex: 1,
  },
  colItem: {
    fontSize: 9,
    color: COLOR_BLACK,
    marginBottom: 2,
  },

  // References
  refBlock: {
    marginBottom: 8,
  },
  refName: {
    fontSize: 9,
    fontWeight: 'bold',
    color: COLOR_BLACK,
  },
  refContact: {
    fontSize: 9,
    color: COLOR_GREY,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLOR_DARK_GREEN,
    color: COLOR_WHITE,
    padding: 8,
    fontSize: 8,
    textAlign: 'center',
  },
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const isValid = (v?: string | null): boolean =>
  !!v && v.trim() !== '' &&
  !v.toLowerCase().includes('niet gespecificeerd') &&
  !v.toLowerCase().includes('onbekend');

const formatDateToNumbers = (text: string): string => {
  if (!text) return text;
  const monthMap: Record<string, string> = {
    'januari': '01', 'februari': '02', 'maart': '03', 'april': '04', 'mei': '05', 'juni': '06',
    'juli': '07', 'augustus': '08', 'september': '09', 'oktober': '10', 'november': '11', 'december': '12',
    'jan': '01', 'feb': '02', 'mrt': '03', 'mar': '03', 'apr': '04', 'jun': '06', 'jul': '07',
    'aug': '08', 'sep': '09', 'sept': '09', 'okt': '10', 'oct': '10', 'nov': '11', 'dec': '12',
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

// ─── HEADER SUBTITLE LINE ────────────────────────────────────────────────────
const buildHeaderSubtitle = (data: ParsedCV): string => {
  const parts: string[] = [];
  const avail = (data.personalInfo?.availability || '').trim();
  const isDirect = /^direct$/i.test(avail) || /^per\s+direct$/i.test(avail);
  if (isValid(avail)) {
    parts.push(isDirect ? 'Per direct beschikbaar' : `Beschikbaar per ${avail}`);
  } else {
    parts.push('Beschikbaar op aanvraag');
  }
  if (isValid(data.personalInfo?.hours)) {
    const h = data.personalInfo!.hours!;
    parts.push(h.includes('uur per week') ? h : `${h} uur per week`);
  }
  if (isValid(data.personalInfo?.skj)) {
    parts.push(`SKJ-Registratie: ${data.personalInfo!.skj}`);
    if (isValid(data.personalInfo?.skjDate)) {
      parts.push(`Afgegeven op ${data.personalInfo!.skjDate}`);
    }
  }
  return parts.join('  |  ');
};

// ─── DOCUMENT ────────────────────────────────────────────────────────────────
interface Props {
  data: ParsedCV;
}

export const CVPdfDocument: React.FC<Props> = ({ data }) => {
  const sortedExperience = [...(data.experience || [])].sort(
    (a, b) => parsePeriodStart(b.period) - parsePeriodStart(a.period)
  );
  const hideSeps = data.hideSeparators || [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ─── HEADER ─────────────────────────────────────────── */}
        <View style={styles.header} fixed>
          <Text style={styles.headerName}>{data.personalInfo?.name || 'Naam'}</Text>
          <Text style={styles.headerSubtitle}>{buildHeaderSubtitle(data)}</Text>
        </View>

        <View style={styles.body}>
          {/* ─── TAGS / ANALYSIS ────────────────────────────────── */}
          {data.analysis?.tags && data.analysis.tags.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>WAAR DEZE PROFESSIONAL STERK IN IS</Text>
              <View style={styles.tagsContainer}>
                {data.analysis.tags.map((tag, i) => (
                  <Text key={i} style={styles.tag}>{tag}</Text>
                ))}
              </View>
            </View>
          )}

          {/* ─── OPLEIDINGEN ─────────────────────────────────── */}
          {data.education && data.education.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>OPLEIDINGEN</Text>
              {data.education.map((edu, i) => (
                <View key={i} style={styles.row}>
                  <Text style={styles.rowPeriod}>{formatDateToNumbers(edu.period)}</Text>
                  <View style={styles.rowContent}>
                    <Text>
                      <Text>{edu.degree}</Text>
                      {edu.school ? <Text style={styles.rowContentSecondary}>, {edu.school}</Text> : null}
                      <Text style={styles.rowContentSecondary}> - {edu.status}</Text>
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ─── CURSUSSEN ───────────────────────────────────── */}
          {data.courses && data.courses.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.sectionTitle}>CURSUSSEN</Text>
              {data.courses.map((c, i) => (
                <View key={i} style={styles.row}>
                  <Text style={styles.rowPeriod}>{formatDateToNumbers(c.period)}</Text>
                  <View style={styles.rowContent}>
                    <Text>
                      <Text>{c.title}</Text>
                      {c.institute ? <Text style={styles.rowContentSecondary}>, {c.institute}</Text> : null}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ─── ORANGE SEPARATOR ─────────────────────────────── */}
          {!hideSeps[0] && <View style={styles.separator} />}

          {/* ─── WERKERVARING ────────────────────────────────── */}
          {sortedExperience.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>WERKERVARING</Text>
              {sortedExperience.map((exp, i) => (
                <View key={i} style={styles.expBlock} wrap={false} break={exp.pageBreakBefore && i > 0}>
                  <View style={styles.expHeader}>
                    <Text style={styles.expPeriod}>{formatDateToNumbers(exp.period)}</Text>
                    <View style={styles.expDetails}>
                      <Text style={styles.expEmployer}>{exp.employer}</Text>
                      <Text style={styles.expRole}>{exp.role}</Text>
                      {(exp.bullets || []).map((bullet, j) => (
                        <View key={j} style={styles.bullet}>
                          <Text style={styles.bulletDot}>•</Text>
                          <Text style={styles.bulletText}>{bullet}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ─── ORANGE SEPARATOR ─────────────────────────────── */}
          {!hideSeps[1] && <View style={styles.separator} />}

          {/* ─── SYSTEEMKENNIS + TALENKENNIS ──────────────────── */}
          {((data.systems && data.systems.length > 0) || (data.languages && data.languages.length > 0)) && (
            <View style={styles.twoCol}>
              {data.systems && data.systems.length > 0 && (
                <View style={styles.col}>
                  <Text style={styles.sectionTitle}>SYSTEEMKENNIS</Text>
                  {data.systems.map((s, i) => (
                    <Text key={i} style={styles.colItem}>• {s}</Text>
                  ))}
                </View>
              )}
              {data.languages && data.languages.length > 0 && (
                <View style={styles.col}>
                  <Text style={styles.sectionTitle}>TALENKENNIS</Text>
                  {data.languages.map((l, i) => (
                    <Text key={i} style={styles.colItem}>• {l}</Text>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ─── REFERENCES ──────────────────────────────────── */}
          {((data.references && data.references.length > 0) || data.referencesOnRequest) && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>REFERENTIES</Text>
              {data.referencesOnRequest ? (
                <Text style={{ fontSize: 9, color: COLOR_GREY }}>Op aanvraag beschikbaar</Text>
              ) : (
                (data.references || []).map((ref, i) => (
                  <View key={i} style={styles.refBlock}>
                    <Text style={styles.refName}>
                      {ref.name}
                      {ref.role ? <Text style={styles.refContact}>, {ref.role}</Text> : null}
                      {ref.company ? <Text style={styles.refContact}> bij {ref.company}</Text> : null}
                    </Text>
                    <Text style={styles.refContact}>{ref.contact}</Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>

        {/* ─── FOOTER ─────────────────────────────────────────── */}
        <View style={styles.footer} fixed>
          <Text>NOVÉMBER. RECRUITMENT</Text>
        </View>
      </Page>
    </Document>
  );
};

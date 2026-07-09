import React from 'react';
import { Document, Page, View, Text, StyleSheet, Image, Font } from '@react-pdf/renderer';
import { ParsedCV } from '../types';

// ─── FONT REGISTRATION (idempotent — safe to call even if CVPdfDocument also registers) ──
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
const COLOR_BLACK = '#000000';
const COLOR_WHITE = '#FFFFFF';

// ─── ASSET URLs ──────────────────────────────────────────────────────────────
const LOGO_PNG = (typeof window !== 'undefined' ? window.location.origin : '') + '/logo.png';
const ARROW_PNG = (typeof window !== 'undefined' ? window.location.origin : '') + '/logo-footer.png';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const toTitleCase = (str: string) => {
  if (!str) return str;
  return str.replace(/\b\w+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
};

// Split letter text into paragraphs on blank lines
const splitParagraphs = (text: string): string[] => {
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim().replace(/\n/g, ' ')) // collapse intra-paragraph newlines
    .filter(p => p.length > 0);
};

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Garet',
    fontSize: 10,
    color: COLOR_BLACK,
    backgroundColor: COLOR_WHITE,
    paddingTop: 0, // Maria July 9: green header must touch top edge (matches CV page)
    paddingBottom: 90,
  },
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
  },
  headerLogo: {
    width: 75,
    height: 75,
    objectFit: 'contain',
  },
  body: {
    paddingHorizontal: 50,
    paddingTop: 30,
  },
  titleBar: {
    alignSelf: 'flex-start',
    backgroundColor: COLOR_LIME,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 20,
  },
  title: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLOR_BLACK,
    letterSpacing: 0.3,
  },
  paragraph: {
    fontSize: 10.5,
    color: COLOR_BLACK,
    lineHeight: 1.55,
    marginBottom: 12,
    textAlign: 'justify',
  },
  // FOOTER (same as CV)
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

interface Props {
  data: ParsedCV;
  letterText: string;
}

/**
 * Reusable cover letter page — can be embedded inside another `<Document>`
 * (e.g. appended after CV pages in CVPdfDocument). Returns just the `<Page>`,
 * no surrounding Document.
 */
export const CoverLetterPage: React.FC<Props> = ({ data, letterText }) => {
  const paragraphs = splitParagraphs(letterText);

  return (
    <Page size="A4" style={styles.page}>
      {/* HEADER (same style as CV) */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerName}>{toTitleCase(data.personalInfo?.name || 'Kandidaat Naam')}</Text>
          {/* Maria juni 18: 'Motivatiebrief' in de header weg — staat al als kop (titleBar) in het document zelf, dubbel. */}
        </View>
        <Image src={LOGO_PNG} style={styles.headerLogo} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleBar}>
          <Text style={styles.title}>MOTIVATIEBRIEF</Text>
        </View>
        {paragraphs.map((p, i) => (
          <Text key={i} style={styles.paragraph}>{p}</Text>
        ))}
      </View>

      <View style={styles.footer} fixed>
        <View style={styles.footerLimeBarLeft} />
        <Image src={ARROW_PNG} style={styles.footerArrow} />
        <View style={styles.footerLimeBarRight} />
      </View>
    </Page>
  );
};

export const CoverLetterPdfDocument: React.FC<Props> = ({ data, letterText }) => {
  return (
    <Document>
      <CoverLetterPage data={data} letterText={letterText} />
    </Document>
  );
};

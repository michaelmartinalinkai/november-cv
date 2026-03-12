
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Footer,
  Header,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  VerticalAlign,
  HeightRule,
  ImageRun,
  ShadingType
} from "docx";
import { ParsedCV } from "../types";
import { LOGO_URL, WHITE_ARROW_URL } from "../assets";

const COLOR_GREEN = "284d32";
const COLOR_LIME = "e3fd01";
const COLOR_SALMON = "f27f61";
const COLOR_GREY = "4a4e57"; // #4a4e57
const COLOR_WHITE = "ffffff";
const COLOR_BLACK = "000000";

// Fallback sequence: Garet, then Verdana, then sans-serif
const FONT_BRAND = "Garet";

// Sort helper — mirrors CVPreview logic so DOCX order matches screen order
const parsePeriodStart = (period: string): number => {
  if (!period) return 0;
  const p = formatDateToNumbers(period); // normalize before parsing (mirrors CVPreview)
  const mmyyyy = p.match(/(\d{2})\/(\d{4})/);
  if (mmyyyy) return parseInt(mmyyyy[2]) * 100 + parseInt(mmyyyy[1]);
  const yyyy = p.match(/(\d{4})/);
  if (yyyy) return parseInt(yyyy[1]) * 100;
  return 0;
};

// Mirrors formatDateToNumbers in CVPreview — normalizes date strings for DOCX output
const formatDateToNumbers = (text: string): string => {
  if (!text) return text;
  const monthMap: Record<string, string> = {
    'januari': '01', 'februari': '02', 'maart': '03', 'april': '04', 'mei': '05', 'juni': '06',
    'juli': '07', 'augustus': '08', 'september': '09', 'oktober': '10', 'november': '11', 'december': '12',
    'january': '01', 'february': '02', 'march': '03', 'may': '05', 'june': '06',
    'july': '07', 'august': '08', 'october': '10',
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
  result = result.replace(/ \/ /g, ' - ');
  result = result.replace(/\b(\d{4})\/(\d{4})\b/g, '$1 - $2');
  result = result.replace(/\b(\d{4})-(\d{4})\b/g, '$1 - $2');
  return result;
};

// Strip redundant category prefix from course titles (e.g. "Cursus EHBO" → "EHBO")
const stripCoursePrefix = (title: string): string =>
  title.replace(/^(cursus|training|opleiding|workshop|e-learning|webinar)\s+/i, '').trim();

const noBorder = { style: BorderStyle.NONE, size: 0, color: "auto" };
const allNoBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

const TUSSENVOEGSELS = new Set(['van', 'de', 'den', 'der', 'het', 'ten', 'ter', 'te', 'op', 'aan', 'in', 'bij']);
const toTitleCase = (str: string) => {
  const words = str.toLowerCase().split(' ');
  return words.map((word, i) => {
    if (i > 0 && TUSSENVOEGSELS.has(word)) return word; // keep tussenvoegsel lowercase
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
};

const normalizeEducationLevel = (text: string): string => {
  if (!text) return text;
  const levels: Record<string, string> = {
    'HBO': 'Hbo', 'hbo': 'Hbo',
    'MBO': 'Mbo', 'mbo': 'Mbo',
    'MAVO': 'Mavo', 'mavo': 'Mavo',
    'HAVO': 'Havo', 'havo': 'Havo',
    'VWO': 'Vwo', 'vwo': 'Vwo',
    'VMBO': 'Vmbo', 'vmbo': 'Vmbo',
    'WO': 'Wo', 'wo': 'Wo',
  };
  return text.replace(/(HBO|MBO|MAVO|HAVO|VWO|VMBO|WO|hbo|mbo|mavo|havo|vwo|vmbo|wo)/g, (match) => levels[match] || match);
};

const fixEducationEntry = (edu: { period: string; degree: string; status: string; school?: string }) => {
  const levelPattern = /^(Hbo|Mbo|Mavo|Havo|Vwo|Vmbo|Wo|HBO|MBO|MAVO|HAVO|VWO|VMBO|WO|hbo|mbo|mavo|havo|vwo|vmbo|wo)$/i;
  let { degree, status } = edu;
  if (levelPattern.test(status.trim())) {
    const level = normalizeEducationLevel(status.trim());
    degree = degree.startsWith(level) ? degree : level + ' ' + degree;
    status = 'diploma behaald';
  }
  degree = normalizeEducationLevel(degree);
  // Normalize ongewenste statuswaarden → approved terms
  const s = status.trim().toLowerCase();
  if (/^(lopend|in uitvoering|bezig|in progress|ongoing|studerend)$/.test(s)) {
    status = 'studerend';
  } else if (/^(niet afgerond|diploma niet behaald|nee|niet behaald|afgebroken|stopped|dropped)$/.test(s)) {
    status = 'gestopt';
  }
  return { ...edu, degree, status };
};

const fetchImageAsBuffer = async (url: string): Promise<ArrayBuffer | null> => {
  try {
    if (url.startsWith('data:')) {
      const base64Part = url.split(',')[1];
      const binaryString = atob(base64Part);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    const finalUrl = url.startsWith('http') ? url : `${window.location.origin}/${url.replace(/^\//, '')}`;
    const response = await fetch(finalUrl);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
    return await response.arrayBuffer();
  } catch (err) {
    console.error(`Error fetching image from ${url}:`, err);
    return null;
  }
};

const createNewStyleDocument = (data: ParsedCV, logoBuffer: ArrayBuffer | null, arrowBuffer: ArrayBuffer | null): Document => {
  // Helper to strip employer prefix from role if duplicated
  const cleanRole = (employer: string, role: string): string => {
    if (role.toUpperCase().startsWith(employer.toUpperCase())) {
      return role.replace(new RegExp(`^${employer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|?\\s*`, 'i'), '').trim();
    }
    return role;
  };

  // --- HEADER ---
  const header = new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: allNoBorders,
        rows: [
          new TableRow({
            height: { value: 2400, rule: HeightRule.EXACT }, // 120px approx
            children: [
              new TableCell({
                shading: { fill: COLOR_GREEN, type: ShadingType.CLEAR, color: "auto" },
                margins: { left: 1000, right: 1000 },
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: toTitleCase(data.personalInfo.name || "Kandidaat Naam"),
                        color: COLOR_WHITE,
                        bold: true,
                        size: 82, // 41px * 2
                        font: FONT_BRAND,
                        characterSpacing: -16 // Approx -0.8pt. Twentieths of a point: -16/20 = -0.8pt.
                      })
                    ]
                  }),
                  new Paragraph({
                    spacing: { before: 80 },
                    children: [
                      new TextRun({
                        text: (() => {
                          const isValid = (v?: string | null) => v && v.trim() !== '' && !v.toLowerCase().includes('onbekend') && !v.toLowerCase().includes('niet gespecificeerd');
                          const parts: string[] = [];
                          if (isValid(data.personalInfo.availability)) {
                            const avail = (data.personalInfo.availability || '').trim();
                            const availStr = /^per\b/i.test(avail) ? `Beschikbaar ${avail}` : `Beschikbaar per ${avail}`;
                            parts.push(availStr);
                          } else {
                            parts.push('Beschikbaar op aanvraag');
                          }
                          if (isValid(data.personalInfo.hours)) {
                            const h = data.personalInfo.hours!;
                            parts.push(`${h}${h.includes('uur per week') ? '' : ' uur per week'}`);
                          }
                          if (isValid(data.personalInfo.skj)) {
                            const skj = data.personalInfo.skj!;
                            const skjDate = isValid(data.personalInfo.skjDate) ? ` (afgegeven op ${data.personalInfo.skjDate})` : '';
                            parts.push(`SKJ-Registratie: ${skj}${skjDate}`);
                          }
                          return parts.join(' | ') || 'Niet gespecificeerd | Niet gespecificeerd uur per week | SKJ-Registratie: Niet gespecificeerd';
                        })(),
                        color: COLOR_LIME,
                        size: 18, // 9px * 2
                        font: 'Agrandir'
                      })
                    ]
                  }),
                ],
              }),
              new TableCell({
                shading: { fill: COLOR_GREEN, type: ShadingType.CLEAR, color: "auto" },
                width: { size: 20, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: logoBuffer ? [new ImageRun({ data: logoBuffer, transformation: { width: 60, height: 60 }, type: "png" })] : []
                  })
                ]
              })
            ],
          }),
        ],
      }),
    ],
  });

  // --- FOOTER ---
  // UI: Green background, Yellow horizontal bars, White Arrow. No text.
  // Approx layout: Left Yellow Bar (65%), Arrow gap (10%), Right Yellow Bar (25%)
  const footer = new Footer({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: allNoBorders,
        rows: [
          // Top spacing (Green)
          new TableRow({
            height: { value: 500, rule: HeightRule.EXACT }, // ~25px
            children: [
              new TableCell({ shading: { fill: COLOR_GREEN }, children: [new Paragraph({})] })
            ]
          }),
          // The "Stripe" row
          new TableRow({
            height: { value: 400, rule: HeightRule.EXACT }, // ~20px (Arrow height)
            children: [
              new TableCell({
                width: { size: 65, type: WidthType.PERCENTAGE },
                shading: { fill: COLOR_LIME }, // Left yellow bar
                children: [new Paragraph({})]
              }),
              new TableCell({
                width: { size: 10, type: WidthType.PERCENTAGE },
                shading: { fill: COLOR_GREEN }, // Gap for arrow
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: arrowBuffer ? [new ImageRun({ data: arrowBuffer, transformation: { width: 35, height: 35 }, type: "png" })] : []
                  })
                ]
              }),
              new TableCell({
                width: { size: 25, type: WidthType.PERCENTAGE },
                shading: { fill: COLOR_LIME }, // Right yellow bar
                children: [new Paragraph({})]
              })
            ]
          }),
          // Bottom spacing (Green)
          new TableRow({
            height: { value: 500, rule: HeightRule.EXACT }, // ~25px
            children: [
              new TableCell({ shading: { fill: COLOR_GREEN }, children: [new Paragraph({})] })
            ]
          })
        ]
      })
    ]
  });

  // --- CONTENT ---
  const tags = data.analysis?.tags || [];
  const displayTags = [...tags.slice(0, 5)];
  while (displayTags.length < 5) displayTags.push("PROFESSIONAL");

  const children: any[] = [
    // Skills Header: 11pt, Medium (mapped to normal or semi-bold if possible, but DOCX mostly has bold/not bold. using Bold for visual weight match)
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: "WAAR DEZE PROFESSIONAL STERK IN IS", bold: false, size: 22, font: FONT_BRAND, color: COLOR_BLACK, characterSpacing: 20 })] // 11pt * 2
    }),

    // Skills Pills via Table: row 1 = 3 pills, row 2 = 2 pills centered
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: allNoBorders,
      rows: [
        // Row 1: first 3 tags
        new TableRow({
          children: displayTags.slice(0, 3).map(tag => new TableCell({
            shading: { fill: COLOR_SALMON, color: "auto" },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 100, bottom: 100, left: 200, right: 200 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: tag.toUpperCase(), color: COLOR_WHITE, bold: true, size: 24, font: FONT_BRAND })]
              })
            ]
          }))
        }),
        // Spacer row
        new TableRow({
          height: { value: 100, rule: HeightRule.EXACT },
          children: [new TableCell({ children: [new Paragraph({})], columnSpan: 3 })]
        }),
        // Row 2: last 2 tags, centered with empty flanking cells
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({})], borders: allNoBorders }),
            ...displayTags.slice(3, 5).map(tag => new TableCell({
              shading: { fill: COLOR_SALMON, color: "auto" },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 100, bottom: 100, left: 200, right: 200 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: tag.toUpperCase(), color: COLOR_WHITE, bold: true, size: 24, font: FONT_BRAND })]
                })
              ]
            })),
            new TableCell({ children: [new Paragraph({})], borders: allNoBorders }),
          ]
        }),
      ]
    }),

    new Paragraph({ spacing: { before: 600 } }),

    // OPLEIDINGEN SECTION
    new Paragraph({
      children: [
        new TextRun({ text: "  OPLEIDINGEN  ", bold: true, size: 24, font: "Agrandir", shading: { fill: COLOR_LIME, color: "auto" } }) // 12px * 2
      ]
    }),
    new Paragraph({ spacing: { before: 80 } }),
    // Education as 2-column table to match UI grid layout
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: allNoBorders,
      rows: [...(data.education || [])].sort((a, b) => parsePeriodStart(b.period) - parsePeriodStart(a.period)).map(edu => {
        const fixedEdu = fixEducationEntry(edu);
        return new TableRow({
          children: [
            new TableCell({
              width: { size: 20, type: WidthType.PERCENTAGE },
              borders: allNoBorders,
              margins: { top: 20, bottom: 20 },
              children: [
                new Paragraph({ children: [new TextRun({ text: formatDateToNumbers(fixedEdu.period), font: FONT_BRAND, size: 16, color: COLOR_GREY })] })
              ]
            }),
            new TableCell({
              width: { size: 80, type: WidthType.PERCENTAGE },
              borders: allNoBorders,
              margins: { top: 20, bottom: 20 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: fixedEdu.degree, color: COLOR_BLACK, size: 16, font: FONT_BRAND }),
                    ...(edu.school ? [new TextRun({ text: `, ${edu.school}`, color: COLOR_GREY, size: 16, font: FONT_BRAND })] : []),
                    new TextRun({ text: ` - ${fixedEdu.status}`, font: FONT_BRAND, size: 16, color: COLOR_GREY })
                  ]
                })
              ]
            })
          ]
        });
      })
    }),

    new Paragraph({ spacing: { before: 400, after: 200 }, border: { bottom: { color: COLOR_SALMON, size: 4, style: BorderStyle.SINGLE } } }),

    // CURSUSSEN SECTION (only if present) — rendered as single pipe-separated line
    ...((data.courses && data.courses.length > 0) ? [
      new Paragraph({
        children: [
          new TextRun({ text: "  CURSUSSEN  ", bold: true, size: 24, font: "Agrandir", shading: { fill: COLOR_LIME, color: "auto" } })
        ]
      }),
      new Paragraph({
        spacing: { before: 80 },
        children: [new TextRun({ text: (data.courses || []).map(c => stripCoursePrefix(c.title)).join(" | "), size: 16, font: FONT_BRAND })]
      }),
      new Paragraph({ spacing: { before: 200 } }),
    ] : []),


    // WERKERVARING SECTION
    new Paragraph({
      children: [
        new TextRun({ text: "  WERKERVARING  ", bold: true, size: 24, font: "Agrandir", shading: { fill: COLOR_LIME, color: "auto" } }) // 12px * 2
      ]
    }),

    ...[...(data.experience || [])].sort((a, b) => parsePeriodStart(b.period) - parsePeriodStart(a.period)).flatMap(exp => [
      // Period
      new Paragraph({
        spacing: { before: 240 },
        children: [
          new TextRun({ text: formatDateToNumbers(exp.period), color: COLOR_GREY, size: 16, font: FONT_BRAND }), // 8px * 2
        ]
      }),
      // Employer (own line, green)
      new Paragraph({
        spacing: { before: 40 },
        children: [
          new TextRun({ text: exp.employer, color: COLOR_GREEN, size: 16, font: FONT_BRAND }),
        ]
      }),
      // ROLE (own line, bold uppercase)
      new Paragraph({
        spacing: { before: 20 },
        children: [
          new TextRun({ text: cleanRole(exp.employer, exp.role).toUpperCase(), bold: true, size: 20, font: FONT_BRAND, color: COLOR_BLACK })
        ]
      }),
      // Bullets
      ...(exp.bullets || []).map((bullet, bi) => new Paragraph({
        indent: { left: 200 },
        spacing: { before: 20 },
        children: [
          new TextRun({ text: "\u2022  ", size: 16, font: FONT_BRAND }),
          new TextRun({ text: `${bullet.trim().replace(/[.;]+$/, '')}${bi === exp.bullets.length - 1 ? '.' : ';'}`, size: 16, font: FONT_BRAND }) // 8px * 2
        ]
      }))
    ]),

    new Paragraph({ spacing: { before: 400, after: 200 }, border: { bottom: { color: COLOR_SALMON, size: 4, style: BorderStyle.SINGLE } } }),

    // SYSTEEMKENNIS (stacked, matching UI)
    ...((data.systems && data.systems.length > 0) ? [
      new Paragraph({
        children: [
          new TextRun({ text: "  SYSTEEMKENNIS  ", bold: true, size: 24, font: "Agrandir", shading: { fill: COLOR_LIME, color: "auto" } })
        ]
      }),
      new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: (data.systems || []).join(" | "), size: 16, font: FONT_BRAND })] }),
      new Paragraph({ spacing: { before: 200 } }),
    ] : []),

    // TALENKENNIS (stacked, matching UI)
    ...((data.languages && data.languages.length > 0) ? [
      new Paragraph({
        children: [
          new TextRun({ text: "  TALENKENNIS  ", bold: true, size: 24, font: "Agrandir", shading: { fill: COLOR_LIME, color: "auto" } })
        ]
      }),
      new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: (data.languages || []).join(" | "), size: 16, font: FONT_BRAND })] }),
    ] : [])
  ];

  return new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 960, right: 960 } } }, // 0.5 inch top/bottom, ~0.67 inch left/right (matching UI padding)
      headers: { default: header },
      footers: { default: footer },
      children
    }]
  });
};

export const generateDocxBlob = async (data: ParsedCV): Promise<Blob> => {
  const [logoBuffer, arrowBuffer] = await Promise.all([
    fetchImageAsBuffer(LOGO_URL),
    fetchImageAsBuffer(WHITE_ARROW_URL)
  ]);

  const doc = createNewStyleDocument(data, logoBuffer, arrowBuffer);
  return await Packer.toBlob(doc);
};

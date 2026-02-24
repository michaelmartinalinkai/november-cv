
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

const noBorder = { style: BorderStyle.NONE, size: 0, color: "auto" };
const allNoBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

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

const createOldStyleDocument = (data: ParsedCV): Document => {
  // Existing implementation for old style - preserved as is but ensuring basic functionality
  const children: any[] = [];
  children.push(new Paragraph({
    children: [new TextRun({ text: "Old Style Not Updated - Please Use New Style", size: 24 })]
  }));
  return new Document({ sections: [{ children }] });
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
                        text: (data.personalInfo.name || "Kandidaat Naam").toUpperCase(),
                        color: COLOR_WHITE,
                        bold: true, // weight 600 map to bold
                        size: 64, // 32pt * 2
                        font: FONT_BRAND
                      })
                    ]
                  }),
                  new Paragraph({
                    spacing: { before: 80 }, // slight gap
                    children: [
                      new TextRun({
                        text: `${data.personalInfo.availability || "Beschikbaarheid onbekend"}${data.personalInfo.hours ? ` | ${data.personalInfo.hours}${data.personalInfo.hours.includes('uur per week') ? '' : ' uur per week'}` : ''}${data.personalInfo.skj ? ` | SKJ-Registratie: ${data.personalInfo.skj}${data.personalInfo.skjDate ? ` (afgegeven op ${data.personalInfo.skjDate})` : ''}` : ''}`,
                        color: COLOR_LIME,
                        size: 14, // 7pt * 2
                        font: FONT_BRAND
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

    // Skills Pills via Table
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: allNoBorders,
      rows: [new TableRow({
        children: displayTags.map(tag => new TableCell({
          shading: { fill: COLOR_SALMON, color: "auto" },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 100, bottom: 100, left: 200, right: 200 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: tag.toUpperCase(), color: COLOR_WHITE, bold: true, size: 17, font: FONT_BRAND })] // 8.5pt * 2
            })
          ]
        }))
      })]
    }),

    new Paragraph({ spacing: { before: 600 } }),

    // OPLEIDINGEN SECTION
    new Paragraph({
      children: [
        new TextRun({ text: "  OPLEIDINGEN  ", bold: true, size: 16, font: FONT_BRAND, shading: { fill: COLOR_LIME, color: "auto" }, characterSpacing: 20 }) // 8pt * 2
      ]
    }),
    ...(data.education || []).map(edu => new Paragraph({
      spacing: { before: 60 },
      children: [
        // Grid simulation with tabs or non-breaking spaces not ideal, using just text flow
        new TextRun({ text: `${edu.period}    `, font: FONT_BRAND, size: 16, color: COLOR_GREY }), // 8pt * 2. 70px approx width
        new TextRun({ text: edu.degree, color: COLOR_BLACK, size: 16, font: FONT_BRAND }),
        new TextRun({ text: ` - ${edu.status}`, font: FONT_BRAND, size: 16, color: COLOR_GREY })
      ]
    })),

    new Paragraph({ spacing: { before: 400, after: 200 }, border: { bottom: { color: COLOR_SALMON, size: 4, style: BorderStyle.SINGLE } } }),

    // WERKERVARING SECTION
    new Paragraph({
      children: [
        new TextRun({ text: "  WERKERVARING  ", bold: true, size: 16, font: FONT_BRAND, shading: { fill: COLOR_LIME, color: "auto" }, characterSpacing: 20 })
      ]
    }),

    ...(data.experience || []).flatMap(exp => [
      // Container div simulation
      new Paragraph({
        spacing: { before: 240 }, // space-y-8 approx
        children: [
          new TextRun({ text: exp.period, color: COLOR_GREY, size: 16, font: FONT_BRAND }),
        ]
      }),
      new Paragraph({
        spacing: { before: 40 },
        children: [
          new TextRun({ text: `${exp.employer}`, color: COLOR_GREEN, size: 16, font: FONT_BRAND }),
          new TextRun({ text: ` | `, color: "cccccc", size: 16, font: FONT_BRAND }),
          new TextRun({ text: cleanRole(exp.employer, exp.role).toUpperCase(), bold: true, size: 16, font: FONT_BRAND, color: COLOR_BLACK, characterSpacing: 10 })
        ]
      }),
      ...(exp.bullets || []).map((bullet, bi) => new Paragraph({
        indent: { left: 200 },
        spacing: { before: 20 }, // tight spacing
        children: [
          new TextRun({ text: "•  ", bold: true, size: 16, font: FONT_BRAND }),
          new TextRun({ text: `${bullet.trim().replace(/[.;]+$/, '')}${bi === exp.bullets.length - 1 ? '.' : ';'}`, size: 16, font: FONT_BRAND })
        ]
      }))
    ]),

    new Paragraph({ spacing: { before: 400, after: 200 }, border: { bottom: { color: COLOR_SALMON, size: 4, style: BorderStyle.SINGLE } } }),

    // LOWER SECTION TABLE
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: allNoBorders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: "  SYSTEEMKENNIS  ", bold: true, size: 16, font: FONT_BRAND, shading: { fill: COLOR_LIME, color: "auto" }, characterSpacing: 20 })] }),
                new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: (data.systems || []).join(" | "), size: 16, font: FONT_BRAND })] })
              ]
            }),
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: "  TALENKENNIS  ", bold: true, size: 16, font: FONT_BRAND, shading: { fill: COLOR_LIME, color: "auto" }, characterSpacing: 20 })] }),
                new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: (data.languages || []).join(" | "), size: 16, font: FONT_BRAND })] })
              ]
            })
          ]
        })
      ]
    })
  ];

  return new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 1440, right: 1440 } } }, // 0.5 inch top/bottom, 1 inch left/right
      headers: { default: header },
      footers: { default: footer },
      children
    }]
  });
};

export const generateDocxBlob = async (data: ParsedCV, template: 'old' | 'new' = 'new'): Promise<Blob> => {
  if (template === 'old') {
    return await Packer.toBlob(createOldStyleDocument(data));
  }

  const [logoBuffer, arrowBuffer] = await Promise.all([
    fetchImageAsBuffer(LOGO_URL),
    fetchImageAsBuffer(WHITE_ARROW_URL)
  ]);

  const doc = createNewStyleDocument(data, logoBuffer, arrowBuffer);
  return await Packer.toBlob(doc);
};

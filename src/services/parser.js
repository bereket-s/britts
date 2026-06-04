/**
 * Document Parser — extracts text from PDF, DOCX, PPTX, Excel, and image files.
 * All processing is done client-side in the browser.
 */

// ─── PDF ──────────────────────────────────────────────────────────────────────

async function parsePDF(file) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = `[PDF Document: ${file.name}]\n\n`;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += `--- Page ${i} ---\n${pageText}\n\n`;
  }
  return fullText;
}

// ─── DOCX ─────────────────────────────────────────────────────────────────────

async function parseDOCX(file) {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return `[Word Document: ${file.name}]\n\n${result.value}`;
}

// ─── PPTX ─────────────────────────────────────────────────────────────────────

async function parsePPTX(file) {
  const JSZip = (await import('jszip')).default;
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  let text = `[PowerPoint Presentation: ${file.name}]\n\n`;
  let slideNum = 1;

  // PPTX slides are in ppt/slides/slide*.xml
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0');
      const numB = parseInt(b.match(/\d+/)?.[0] || '0');
      return numA - numB;
    });

  for (const slideName of slideFiles) {
    const xmlContent = await zip.files[slideName].async('string');
    // Extract text from <a:t> tags
    const textMatches = xmlContent.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
    const slideText = textMatches
      .map(m => m.replace(/<[^>]+>/g, '').trim())
      .filter(t => t.length > 0)
      .join(' ');

    if (slideText.trim()) {
      text += `--- Slide ${slideNum} ---\n${slideText}\n\n`;
    }
    slideNum++;
  }

  // Also try to get slide notes
  const noteFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name));

  if (noteFiles.length > 0) {
    text += '--- Speaker Notes ---\n';
    for (const noteName of noteFiles) {
      const xmlContent = await zip.files[noteName].async('string');
      const noteMatches = xmlContent.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
      const noteText = noteMatches
        .map(m => m.replace(/<[^>]+>/g, '').trim())
        .filter(t => t.length > 0 && t !== 'Click to edit Master title style')
        .join(' ');
      if (noteText.trim()) text += `${noteText}\n`;
    }
  }

  return text;
}

// ─── Excel / CSV ──────────────────────────────────────────────────────────────

async function parseExcel(file) {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  let text = `[Excel Workbook: ${file.name}]\n\n`;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) {
      text += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
    }
  }
  return text;
}

// ─── Plain Text ───────────────────────────────────────────────────────────────

async function parseTXT(file) {
  const text = await file.text();
  return `[Text Document: ${file.name}]\n\n${text}`;
}

// ─── Image ────────────────────────────────────────────────────────────────────

async function parseImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      resolve({
        type: 'image',
        mimeType: file.type,
        base64,
        name: file.name,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

export const FILE_TYPES = {
  'application/pdf': { label: 'PDF', icon: '📄', color: 'pdf', parser: parsePDF },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { label: 'DOCX', icon: '📝', color: 'docx', parser: parseDOCX },
  'application/msword': { label: 'DOC', icon: '📝', color: 'docx', parser: parseDOCX },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { label: 'PPTX', icon: '📊', color: 'pptx', parser: parsePPTX },
  'application/vnd.ms-powerpoint': { label: 'PPT', icon: '📊', color: 'pptx', parser: parsePPTX },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { label: 'XLSX', icon: '📈', color: 'xlsx', parser: parseExcel },
  'application/vnd.ms-excel': { label: 'XLS', icon: '📈', color: 'xlsx', parser: parseExcel },
  'text/csv': { label: 'CSV', icon: '📈', color: 'xlsx', parser: parseExcel },
  'text/plain': { label: 'TXT', icon: '📃', color: 'txt', parser: parseTXT },
  'text/markdown': { label: 'MD', icon: '📃', color: 'txt', parser: parseTXT },
  'image/jpeg': { label: 'JPG', icon: '🖼️', color: 'img', parser: parseImage },
  'image/png': { label: 'PNG', icon: '🖼️', color: 'img', parser: parseImage },
  'image/webp': { label: 'WEBP', icon: '🖼️', color: 'img', parser: parseImage },
  'image/gif': { label: 'GIF', icon: '🖼️', color: 'img', parser: parseImage },
};

export function getFileTypeInfo(file) {
  const info = FILE_TYPES[file.type];
  if (info) return info;
  // Fallback by extension
  const ext = file.name.split('.').pop()?.toLowerCase();
  const extMap = {
    pdf: FILE_TYPES['application/pdf'],
    docx: FILE_TYPES['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    doc: FILE_TYPES['application/msword'],
    pptx: FILE_TYPES['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ppt: FILE_TYPES['application/vnd.ms-powerpoint'],
    xlsx: FILE_TYPES['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    xls: FILE_TYPES['application/vnd.ms-excel'],
    csv: FILE_TYPES['text/csv'],
    txt: FILE_TYPES['text/plain'],
    md: FILE_TYPES['text/markdown'],
    jpg: FILE_TYPES['image/jpeg'],
    jpeg: FILE_TYPES['image/jpeg'],
    png: FILE_TYPES['image/png'],
    webp: FILE_TYPES['image/webp'],
  };
  return extMap[ext] || { label: ext?.toUpperCase() || 'FILE', icon: '📎', color: 'txt', parser: parseTXT };
}

export function isFileSupported(file) {
  return !!getFileTypeInfo(file);
}

/**
 * Parse a single file and return either:
 * - { type: 'text', content: string }   for text-based files
 * - { type: 'image', mimeType, base64, name } for images
 */
export async function parseFile(file) {
  const info = getFileTypeInfo(file);
  const result = await info.parser(file);

  if (typeof result === 'string') {
    return { type: 'text', content: result };
  }
  return result; // image object
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

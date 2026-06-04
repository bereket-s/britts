/**
 * DocumentViewer — Full-screen in-app reader for all uploaded document formats.
 *
 * Supported formats (no download required):
 *   PDF   → rendered page-by-page with pdf.js (canvas)
 *   DOCX  → converted to rich HTML with mammoth.js
 *   XLSX  → rendered as styled table with SheetJS (sheet tabs)
 *   PPTX  → Microsoft Office Online embed (best in-browser PPTX viewer)
 *   Images → native <img> with zoom
 *   TXT/MD → syntax-highlighted text
 *   CSV   → parsed to HTML table
 */

// ─── Public API ──────────────────────────────────────────────────────────────

export async function openDocumentViewer(doc) {
  const name = doc.name || 'Document';
  const mime = doc.mimeType || '';
  const url  = doc.url  || '';

  if (!url) { alert('No URL available for this document.'); return; }

  const ext = name.split('.').pop().toLowerCase();

  const overlay = buildOverlay(name, url);
  document.body.appendChild(overlay);
  overlay.focus();

  const body     = overlay.querySelector('#dv-body');
  const controls = overlay.querySelector('#dv-controls');
  const metaEl   = overlay.querySelector('#dv-meta');
  const iconEl   = overlay.querySelector('#dv-icon');

  setLoading(body);

  try {
    if (['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext) || mime.startsWith('image/')) {
      renderImage(body, url, name, iconEl, metaEl);

    } else if (ext === 'pdf' || mime === 'application/pdf') {
      await renderPDF(body, url, controls, metaEl, iconEl);

    } else if (['doc','docx'].includes(ext)) {
      await renderDOCX(body, url, metaEl, iconEl);

    } else if (['xls','xlsx','csv'].includes(ext)) {
      await renderXLSX(body, url, controls, metaEl, iconEl, ext);

    } else if (['ppt','pptx'].includes(ext)) {
      renderOfficeEmbed(body, url, metaEl, iconEl);

    } else if (['txt','md','json'].includes(ext) || mime.startsWith('text/')) {
      await renderText(body, url, ext, metaEl, iconEl);

    } else {
      renderFallback(body, url, name, ext);
    }
  } catch (err) {
    body.innerHTML = `
      <div style="text-align:center;padding:3rem;color:var(--error)">
        <div style="font-size:3rem;margin-bottom:1rem">⚠️</div>
        <p style="font-weight:600">Could not load document</p>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0.5rem">${err.message}</p>
        <a href="${url}" download="${name}" class="btn btn-primary" style="margin-top:1.5rem">⬇️ Download instead</a>
      </div>`;
  }
}

// ─── Overlay Shell ────────────────────────────────────────────────────────────

function buildOverlay(name, url) {
  const el = document.createElement('div');
  el.id = 'doc-viewer-overlay';
  el.setAttribute('tabindex', '-1');
  el.style.cssText = `
    position:fixed;inset:0;z-index:3000;
    background:var(--bg-base,#080d1a);
    display:flex;flex-direction:column;
    animation:fadeIn 0.2s ease;
  `;
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;
                padding:0.75rem 1.25rem;border-bottom:1px solid var(--border,#1e2a3a);
                background:var(--bg-card,#0d1628);flex-shrink:0;gap:1rem">
      <div style="display:flex;align-items:center;gap:0.75rem;min-width:0">
        <span id="dv-icon" style="font-size:1.4rem;flex-shrink:0">📄</span>
        <div style="min-width:0">
          <div style="font-weight:600;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40vw"
               title="${name}">${name}</div>
          <div id="dv-meta" style="font-size:0.72rem;color:var(--text-muted,#64748b)"></div>
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center;flex-shrink:0">
        <div id="dv-controls" style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap"></div>
        <a href="${url}" download="${name}"
           style="padding:0.35rem 0.75rem;border-radius:6px;background:var(--bg-elevated,#1e2a3a);
                  border:1px solid var(--border,#1e2a3a);color:var(--text-primary,#e2e8f0);
                  font-size:0.8rem;text-decoration:none;white-space:nowrap">⬇️ Download</a>
        <button id="dv-close"
                style="width:30px;height:30px;border-radius:6px;background:var(--bg-elevated,#1e2a3a);
                       border:1px solid var(--border,#1e2a3a);color:var(--text-muted,#64748b);
                       cursor:pointer;font-size:1.1rem;display:flex;align-items:center;justify-content:center">✕</button>
      </div>
    </div>
    <div id="dv-body"
         style="flex:1;overflow:auto;display:flex;flex-direction:column;align-items:center;padding:1.5rem;gap:1rem">
    </div>
  `;

  // Close handlers
  el.querySelector('#dv-close').addEventListener('click', () => el.remove());
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') el.remove(); });
  return el;
}

function setLoading(body) {
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1rem;color:var(--text-muted,#64748b)">
      <div style="font-size:3rem;animation:spin 1s linear infinite">⏳</div>
      <p>Loading document…</p>
    </div>`;
}

// ─── Renderers ────────────────────────────────────────────────────────────────

// ── Images ────────────────────────────────────────────────────────────────────
function renderImage(body, url, name, iconEl, metaEl) {
  iconEl.textContent = '🖼️';
  metaEl.textContent = 'Image';
  body.style.justifyContent = 'center';
  body.innerHTML = `
    <div style="position:relative;max-width:100%">
      <img src="${url}" alt="${name}"
           style="max-width:100%;max-height:85vh;object-fit:contain;border-radius:8px;
                  box-shadow:0 8px 32px rgba(0,0,0,0.5);display:block" />
    </div>`;
}

// ── PDF (pdf.js canvas renderer) ──────────────────────────────────────────────
async function renderPDF(body, url, controls, metaEl, iconEl) {
  iconEl.textContent = '📄';
  metaEl.textContent = 'Loading PDF…';

  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs', import.meta.url
  ).toString();

  const resp = await fetch(url);
  const arrayBuffer = await resp.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;

  metaEl.textContent = `${numPages} page${numPages > 1 ? 's' : ''}`;

  let currentPage = 1;
  let scale = 1.5;

  // Controls
  controls.innerHTML = `
    <button id="dv-prev" style="${ctrlBtn()}" title="Previous page">‹</button>
    <span id="dv-pageinfo" style="font-size:0.78rem;color:var(--text-muted,#64748b);padding:0 0.25rem;white-space:nowrap">
      1 / ${numPages}
    </span>
    <button id="dv-next" style="${ctrlBtn()}" title="Next page">›</button>
    <select id="dv-zoom" style="padding:0.3rem 0.5rem;border-radius:5px;background:var(--bg-elevated,#1e2a3a);
                                border:1px solid var(--border,#2d3a4a);color:var(--text-primary,#e2e8f0);
                                font-size:0.78rem;cursor:pointer">
      <option value="1">100%</option>
      <option value="1.25">125%</option>
      <option value="1.5" selected>150%</option>
      <option value="2">200%</option>
      <option value="0.75">75%</option>
    </select>
  `;

  body.innerHTML = `<div id="dv-pdf-canvas-wrap" style="width:100%;display:flex;justify-content:center"></div>`;
  const wrap = body.querySelector('#dv-pdf-canvas-wrap');

  async function drawPage(n) {
    wrap.innerHTML = `<p style="color:var(--text-muted,#64748b);font-size:0.85rem">Rendering page ${n}…</p>`;
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    canvas.style.cssText = `max-width:100%;border-radius:6px;box-shadow:0 8px 32px rgba(0,0,0,0.5);display:block`;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    wrap.innerHTML = '';
    wrap.appendChild(canvas);
    controls.querySelector('#dv-pageinfo').textContent = `${n} / ${numPages}`;
    body.scrollTop = 0;
  }

  await drawPage(currentPage);

  controls.querySelector('#dv-prev').addEventListener('click', async () => {
    if (currentPage > 1) { currentPage--; await drawPage(currentPage); }
  });
  controls.querySelector('#dv-next').addEventListener('click', async () => {
    if (currentPage < numPages) { currentPage++; await drawPage(currentPage); }
  });
  controls.querySelector('#dv-zoom').addEventListener('change', async (e) => {
    scale = parseFloat(e.target.value);
    await drawPage(currentPage);
  });

  // Keyboard navigation
  document.getElementById('doc-viewer-overlay')?.addEventListener('keydown', async (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (currentPage < numPages) { currentPage++; await drawPage(currentPage); }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (currentPage > 1) { currentPage--; await drawPage(currentPage); }
    }
  });
}

// ── DOCX (mammoth → rich HTML) ────────────────────────────────────────────────
async function renderDOCX(body, url, metaEl, iconEl) {
  iconEl.textContent = '📝';
  metaEl.textContent = 'Word Document';

  const mammoth = await import('mammoth');
  const resp = await fetch(url);
  const arrayBuffer = await resp.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });

  body.style.padding = '1.5rem';
  body.innerHTML = `
    <div style="width:100%;max-width:820px;background:#ffffff;color:#1a1a2e;
                border-radius:8px;padding:4rem 5rem;
                box-shadow:0 8px 32px rgba(0,0,0,0.4);
                font-family:Georgia,'Times New Roman',serif;font-size:1rem;line-height:1.9;
                word-break:break-word">
      <style>
        #dv-docx-content h1,#dv-docx-content h2,#dv-docx-content h3 { font-family:Arial,sans-serif; color:#1a1a2e; margin:1.5em 0 0.5em; }
        #dv-docx-content h1 { font-size:1.75rem; border-bottom:2px solid #e0e0e0; padding-bottom:0.3em; }
        #dv-docx-content h2 { font-size:1.35rem; }
        #dv-docx-content h3 { font-size:1.1rem; }
        #dv-docx-content p  { margin:0.6em 0; }
        #dv-docx-content ul,#dv-docx-content ol { padding-left:2em; margin:0.5em 0; }
        #dv-docx-content li { margin:0.3em 0; }
        #dv-docx-content table { border-collapse:collapse; width:100%; margin:1em 0; }
        #dv-docx-content td,#dv-docx-content th { border:1px solid #ccc; padding:0.4em 0.75em; }
        #dv-docx-content th { background:#f5f5f5; font-weight:600; }
        #dv-docx-content img { max-width:100%; border-radius:4px; margin:0.5em 0; }
        #dv-docx-content strong { color:#111; }
        #dv-docx-content em { font-style:italic; }
        #dv-docx-content blockquote { border-left:3px solid #6366f1; padding-left:1em; color:#555; margin:1em 0; }
      </style>
      <div id="dv-docx-content">${result.value || '<p style="color:#888">Document appears to be empty.</p>'}</div>
    </div>`;

  if (result.messages?.length) {
    console.warn('[DocumentViewer] DOCX conversion warnings:', result.messages);
  }
}

// ── XLSX / CSV (SheetJS → styled table) ───────────────────────────────────────
async function renderXLSX(body, url, controls, metaEl, iconEl, ext) {
  iconEl.textContent = ext === 'csv' ? '📊' : '📈';

  const XLSX = await import('xlsx');
  const resp = await fetch(url);
  const arrayBuffer = await resp.arrayBuffer();

  let workbook;
  if (ext === 'csv') {
    const text = new TextDecoder().decode(arrayBuffer);
    workbook = XLSX.read(text, { type: 'string' });
  } else {
    workbook = XLSX.read(arrayBuffer, { type: 'array' });
  }

  const sheetNames = workbook.SheetNames;
  metaEl.textContent = `${sheetNames.length} sheet${sheetNames.length !== 1 ? 's' : ''}`;

  body.style.padding = '0';
  body.innerHTML = `
    <style>
      #dv-xlsx-table { border-collapse:collapse; font-size:0.82rem; background:#fff; color:#1a1a2e; min-width:100%; }
      #dv-xlsx-table td, #dv-xlsx-table th {
        border:1px solid #d1d5db; padding:0.4rem 0.75rem;
        white-space:nowrap; vertical-align:top; max-width:300px;
        overflow:hidden; text-overflow:ellipsis;
      }
      #dv-xlsx-table th { background:#f0f4f8; font-weight:700; position:sticky; top:0; z-index:1; }
      #dv-xlsx-table tr:nth-child(even) td { background:#f9fafb; }
      #dv-xlsx-table tr:hover td { background:#eff6ff; }
    </style>
    <div id="dv-sheet-content" style="width:100%;overflow:auto;flex:1"></div>`;

  // Sheet tab buttons in controls
  if (sheetNames.length > 1) {
    controls.innerHTML = sheetNames.map((n, i) =>
      `<button class="dv-sheet-tab" data-sheet="${n}"
               style="${ctrlBtn(i === 0)}">${n}</button>`
    ).join('');
    controls.querySelectorAll('.dv-sheet-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        controls.querySelectorAll('.dv-sheet-tab').forEach(b => {
          b.style.background = btn === b ? 'var(--accent,#6366f1)' : 'var(--bg-elevated,#1e2a3a)';
          b.style.color = btn === b ? '#fff' : 'var(--text-primary,#e2e8f0)';
        });
        showSheet(btn.dataset.sheet);
      });
    });
  }

  function showSheet(name) {
    const ws = workbook.Sheets[name];
    const html = XLSX.utils.sheet_to_html(ws, { id: 'dv-xlsx-table', editable: false });
    body.querySelector('#dv-sheet-content').innerHTML = html;
  }
  showSheet(sheetNames[0]);
}

// ── PPTX (Microsoft Office Online — best browser PPTX renderer) ───────────────
function renderOfficeEmbed(body, url, metaEl, iconEl) {
  iconEl.textContent = '📊';
  metaEl.textContent = 'PowerPoint — via Office Online';
  body.style.padding = '0';
  body.innerHTML = `
    <iframe
      src="https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}"
      style="width:100%;height:100%;border:none;flex:1"
      title="PowerPoint Viewer"
      allowfullscreen
      loading="lazy">
    </iframe>`;
}

// ── Plain text / Markdown ──────────────────────────────────────────────────────
async function renderText(body, url, ext, metaEl, iconEl) {
  iconEl.textContent = ext === 'md' ? '📓' : '📃';

  const resp = await fetch(url);
  const text = await resp.text();
  metaEl.textContent = `${text.length.toLocaleString()} characters`;

  if (ext === 'md') {
    // Render markdown if marked is available
    try {
      const { marked } = await import('marked');
      body.innerHTML = `
        <div style="width:100%;max-width:820px;background:#ffffff;color:#1a1a2e;
                    border-radius:8px;padding:3rem 4rem;
                    box-shadow:0 8px 32px rgba(0,0,0,0.4);
                    font-family:Georgia,serif;font-size:1rem;line-height:1.8">
          <style>
            #dv-md h1,#dv-md h2,#dv-md h3{font-family:Arial,sans-serif;margin:1.2em 0 0.4em}
            #dv-md code{background:#f5f5f5;padding:0.1em 0.4em;border-radius:3px;font-size:0.85em}
            #dv-md pre{background:#f5f5f5;padding:1em;border-radius:6px;overflow-x:auto}
            #dv-md blockquote{border-left:3px solid #6366f1;padding-left:1em;color:#555}
            #dv-md table{border-collapse:collapse;width:100%;margin:1em 0}
            #dv-md td,#dv-md th{border:1px solid #ddd;padding:0.4em 0.75em}
            #dv-md th{background:#f5f5f5;font-weight:700}
          </style>
          <div id="dv-md">${marked.parse(text)}</div>
        </div>`;
      return;
    } catch {}
  }

  // Plain text fallback
  const escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  body.innerHTML = `
    <div style="width:100%;max-width:900px;background:var(--bg-card,#0d1628);
                border:1px solid var(--border,#1e2a3a);border-radius:8px;padding:2rem;
                font-family:'Courier New',Courier,monospace;font-size:0.85rem;
                color:var(--text-secondary,#94a3b8);line-height:1.7;
                white-space:pre-wrap;word-break:break-word;
                box-shadow:0 8px 32px rgba(0,0,0,0.4)">
      ${escaped}
    </div>`;
}

// ── Fallback ───────────────────────────────────────────────────────────────────
function renderFallback(body, url, name, ext) {
  body.innerHTML = `
    <div style="text-align:center;padding:3rem;color:var(--text-secondary,#94a3b8)">
      <div style="font-size:4rem;margin-bottom:1rem">📎</div>
      <p style="font-weight:600;margin-bottom:0.5rem">${name}</p>
      <p style="font-size:0.85rem;color:var(--text-muted,#64748b);margin-bottom:1.5rem">
        ${ext.toUpperCase()} files cannot be previewed in-browser.<br/>
        Download to open with your local app.
      </p>
      <a href="${url}" download="${name}" target="_blank" rel="noopener"
         style="padding:0.6rem 1.25rem;border-radius:6px;background:var(--accent,#6366f1);
                color:#fff;font-weight:600;text-decoration:none;font-size:0.9rem">
        ⬇️ Download File
      </a>
    </div>`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ctrlBtn(active = false) {
  return `padding:0.3rem 0.6rem;border-radius:5px;cursor:pointer;font-size:0.8rem;
          border:1px solid var(--border,#1e2a3a);white-space:nowrap;
          background:${active ? 'var(--accent,#6366f1)' : 'var(--bg-elevated,#1e2a3a)'};
          color:${active ? '#fff' : 'var(--text-primary,#e2e8f0)'}`;
}

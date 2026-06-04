/**
 * Upload Zone component — drag & drop multi-file upload
 */

import { getFileTypeInfo, isFileSupported, formatFileSize } from '../services/parser.js';
import { showToast } from './Toast.js';

export function createUploadZone(container, onFilesSelected) {
  container.innerHTML = `
    <div class="upload-zone" id="upload-zone" tabindex="0" role="button"
         aria-label="Upload documents — click or drag and drop">
      <span class="upload-icon">☁️</span>
      <div class="upload-title">Drop your documents here</div>
      <div class="upload-subtitle">or click to browse your files</div>
      <div class="upload-types">
        <span class="type-badge">📄 PDF</span>
        <span class="type-badge">📝 DOCX</span>
        <span class="type-badge">📊 PPTX</span>
        <span class="type-badge">📈 Excel</span>
        <span class="type-badge">🖼️ Images</span>
        <span class="type-badge">📃 TXT</span>
      </div>
      <input type="file" id="file-input" multiple
             accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.jpg,.jpeg,.png,.webp,.gif"
             style="display:none" aria-hidden="true" />
    </div>
  `;

  const zone = container.querySelector('#upload-zone');
  const input = container.querySelector('#file-input');

  // Click to open file dialog
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') input.click(); });

  // File input change
  input.addEventListener('change', (e) => {
    if (e.target.files?.length) handleFiles(Array.from(e.target.files));
    input.value = ''; // Reset so same files can be re-selected
  });

  // Drag events
  zone.addEventListener('dragenter', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  });

  // Also support global document drag
  document.addEventListener('dragenter', (e) => { e.preventDefault(); });
  document.addEventListener('dragover', (e) => { e.preventDefault(); });

  function handleFiles(files) {
    const supported = files.filter(f => isFileSupported(f));
    const unsupported = files.filter(f => !isFileSupported(f));

    if (unsupported.length > 0) {
      showToast(`${unsupported.length} file(s) not supported and were skipped`, 'warning');
    }

    if (supported.length > 0) {
      onFilesSelected(supported);
    } else if (files.length > 0) {
      showToast('None of the selected files are supported', 'error');
    }
  }
}

export function renderFileList(files, onDelete) {
  if (!files || files.length === 0) {
    return '<div class="empty-state" style="padding:2rem"><span class="empty-icon">📂</span><p class="empty-desc">No documents uploaded yet</p></div>';
  }

  return `
    <div class="file-list">
      ${files.map(file => {
        const info = getFileTypeInfo({ name: file.name, type: file.mimeType || '' }) || { icon: '📎', color: 'txt', label: 'FILE' };
        return `
          <div class="file-item" data-id="${file.id}">
            <div class="file-icon ${info.color}">${info.icon}</div>
            <div class="file-info">
              <div class="file-name" title="${file.name}">${file.name}</div>
              <div class="file-meta">${info.label} · ${file.size ? formatFileSize(file.size) : ''} · Uploaded ${formatDate(file.uploadedAt)}</div>
            </div>
            <div class="file-status">
              <span class="status-badge ready">✓ Ready</span>
              ${onDelete ? `<button class="btn btn-icon btn-ghost btn-sm" data-delete="${file.id}" aria-label="Remove ${file.name}" title="Remove file">🗑️</button>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

/**
 * Modal dialog component
 */

export function showModal({ title, body, footer, onClose }) {
  const container = document.getElementById('modal-container');
  if (!container) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 class="modal-title" id="modal-title">${title}</h2>
        <button class="modal-close" aria-label="Close dialog">✕</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;

  const close = () => {
    backdrop.remove();
    onClose?.();
  };

  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', handler); }
  });

  container.appendChild(backdrop);
  return { el: backdrop, close };
}

export function showConfirm({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const modal = showModal({
      title,
      body: `<p style="color: var(--text-secondary); line-height: 1.6;">${message}</p>`,
      footer: `
        <button class="btn btn-secondary" id="modal-cancel">${cancelText}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modal-confirm">${confirmText}</button>
      `,
      onClose: () => resolve(false),
    });

    modal.el.querySelector('#modal-cancel').addEventListener('click', () => { modal.close(); resolve(false); });
    modal.el.querySelector('#modal-confirm').addEventListener('click', () => { modal.close(); resolve(true); });
  });
}

export function showInputModal({ title, label, placeholder, defaultValue = '', confirmText = 'Save' }) {
  return new Promise((resolve) => {
    let resolved = false;

    const modal = showModal({
      title,
      body: `
        <div class="form-group">
          <label class="form-label">${label}</label>
          <input id="modal-input" class="form-input" type="text" placeholder="${placeholder}" value="${defaultValue}" />
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-confirm">${confirmText}</button>
      `,
      onClose: () => { if (!resolved) resolve(null); },
    });

    const input = modal.el.querySelector('#modal-input');
    input.focus();
    input.select();

    const confirm = () => {
      const val = input.value.trim();
      if (!val) { input.style.borderColor = 'var(--error)'; return; }
      resolved = true;   // mark resolved BEFORE close() fires onClose
      modal.close();
      resolve(val);
    };

    modal.el.querySelector('#modal-cancel').addEventListener('click', () => { modal.close(); resolve(null); });
    modal.el.querySelector('#modal-confirm').addEventListener('click', confirm);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirm(); });
  });
}

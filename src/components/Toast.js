/**
 * Toast notification system
 */

const toastContainer = () => document.getElementById('toast-container');

export function showToast(message, type = 'info', duration = 4000) {
  const container = toastContainer();
  if (!container) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-text">${message}</span>
    <button class="toast-close" aria-label="Close">✕</button>
  `;

  const close = toast.querySelector('.toast-close');
  const remove = () => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  };
  close.addEventListener('click', remove);

  container.appendChild(toast);
  setTimeout(remove, duration);
  return toast;
}

/**
 * main.js — Application entry point.
 * Wires up form submission, sample data prefill, clear button, and key visibility toggle.
 */

import { runAudit, resetDashboard } from './audit.js';
import { clearErrors, populateSampleData } from './form.js';

// ── Form submit → run the audit ──────────────────────────
const auditForm = document.getElementById('audit-form');
if (auditForm) {
  auditForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runAudit();
  });
}

// ── Clear Form button ────────────────────────────────────
const clearBtn = document.getElementById('clear-form-btn');
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    auditForm?.reset();
    clearErrors();
    resetDashboard();
  });
}

// ── Sample Data buttons ──────────────────────────────────
const loadSampleBtn = document.getElementById('load-sample-btn');
if (loadSampleBtn) {
  loadSampleBtn.addEventListener('click', () => {
    populateSampleData();
  });
}

const emptyStateSampleBtn = document.getElementById('empty-state-sample-btn');
if (emptyStateSampleBtn) {
  emptyStateSampleBtn.addEventListener('click', () => {
    populateSampleData();
    runAudit();
  });
}

// ── Toggle Gemini API key visibility ─────────────────────
const toggleKeyBtn = document.getElementById('toggle-key-visibility');
const geminiKeyInput = document.getElementById('gemini-key');
const eyeIcon = document.getElementById('eye-icon');

if (toggleKeyBtn && geminiKeyInput) {
  toggleKeyBtn.addEventListener('click', () => {
    const isPassword = geminiKeyInput.type === 'password';
    geminiKeyInput.type = isPassword ? 'text' : 'password';

    if (isPassword) {
      eyeIcon.innerHTML = `
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      `;
      toggleKeyBtn.setAttribute('aria-label', 'Hide API key');
    } else {
      eyeIcon.innerHTML = `
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      `;
      toggleKeyBtn.setAttribute('aria-label', 'Show API key');
    }
  });
}

// ── Clear field error on input ───────────────────────────
document.querySelectorAll('#audit-form input, #audit-form textarea').forEach((field) => {
  field.addEventListener('input', () => {
    const name = field.getAttribute('name');
    if (!name) return;
    const errorEl = document.querySelector(`[data-error-for="${name}"]`);
    if (errorEl && !errorEl.classList.contains('hidden')) {
      errorEl.classList.add('hidden');
      field.classList.remove('border-rose-500', 'ring-1', 'ring-rose-500');
    }
  });
});

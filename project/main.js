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

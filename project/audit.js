/**
 * audit.js — Orchestrates the audit pipeline and renders results into the dashboard.
 *
 * Implements:
 *  - Dual-instrument gauge rendering (Overall Score & ATS Score)
 *  - Dimensional progress bars
 *  - Categorized strengths & recruiter flag cards
 *  - ATS keyword analysis & screening rationale
 *  - Actionable before/after bullet rewrites with robust clipboard fallback
 */

import { collectFormData, validateForm, clearErrors } from './form.js';
import { callGemini, hasApiKey } from './gemini.js';

const GAUGE_CIRCUMFERENCE = 283; // 2 * PI * 45 for r=45

/**
 * Main execution handler triggered on form submit.
 */
export async function runAudit() {
  const errors = validateForm();
  if (errors) return;

  const formData = collectFormData();
  const isDemoMode = !hasApiKey(formData.geminiApiKey);

  setButtonLoading(true, isDemoMode);
  showLoadingState(isDemoMode);

  try {
    if (isDemoMode) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    const results = await callGemini(formData);
    renderAuditResults(results, isDemoMode);
  } catch (err) {
    renderError(err.message || 'An unexpected error occurred during analysis.');
  } finally {
    setButtonLoading(false, isDemoMode);
  }
}

/**
 * Renders complete audit results into the dashboard.
 * @param {Object} results
 * @param {boolean} isDemoMode
 */
export function renderAuditResults(results, isDemoMode) {
  // Hide empty state and error state, show dashboard content
  const emptyState = document.getElementById('dashboard-empty-state');
  const errorState = document.getElementById('dashboard-error-state');
  const contentState = document.getElementById('dashboard-content');

  if (emptyState) emptyState.classList.add('hidden');
  if (errorState) errorState.classList.add('hidden');
  if (contentState) contentState.classList.remove('hidden');

  // Update audit status mode chip
  const modeChip = document.getElementById('audit-mode-chip');
  if (modeChip) {
    if (isDemoMode) {
      modeChip.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
        <span class="text-amber-300 font-mono">Demo Mode (Deterministic Evaluation)</span>
      `;
      modeChip.className = 'inline-flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs';
    } else {
      modeChip.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        <span class="text-emerald-300 font-mono">Live Gemini 3.8 Flash Analysis</span>
      `;
      modeChip.className = 'inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs';
    }
  }

  // 1. Overall Score Gauge
  const overall = results.overallScore || 0;
  const overallRing = document.getElementById('overall-score-ring');
  const overallVal = document.getElementById('overall-score-value');
  const overallBadge = document.getElementById('overall-score-badge');

  if (overallRing) {
    const offset = GAUGE_CIRCUMFERENCE - (overall / 100) * GAUGE_CIRCUMFERENCE;
    overallRing.style.strokeDashoffset = offset;
    overallRing.style.stroke = getScoreColor(overall);
  }
  if (overallVal) animateScoreNumber(overallVal, 0, overall, 800);
  if (overallBadge) {
    overallBadge.textContent = overall >= 80 ? 'Strong' : overall >= 65 ? 'Adequate' : 'Needs Expansion';
    overallBadge.className = `text-[11px] font-mono px-2 py-0.5 rounded border ${getScoreBadgeStyle(overall)}`;
  }

  // 2. ATS Readiness Gauge
  const ats = results.atsScore || 0;
  const atsRing = document.getElementById('ats-score-ring');
  const atsVal = document.getElementById('ats-score-value');
  const atsBadge = document.getElementById('ats-score-badge');

  if (atsRing) {
    const offset = GAUGE_CIRCUMFERENCE - (ats / 100) * GAUGE_CIRCUMFERENCE;
    atsRing.style.strokeDashoffset = offset;
    atsRing.style.stroke = getScoreColor(ats);
  }
  if (atsVal) animateScoreNumber(atsVal, 0, ats, 800);
  if (atsBadge) {
    atsBadge.textContent = ats >= 80 ? 'Optimized' : ats >= 65 ? 'Fair' : 'Low Match';
    atsBadge.className = `text-[11px] font-mono px-2 py-0.5 rounded border ${getScoreBadgeStyle(ats)}`;
  }

  // 3. Dimensional Progress Bars
  const dims = results.dimensions || {};
  renderDimensionBar('dim-technical-bar', 'dim-technical-val', dims.technicalDepth || overall);
  renderDimensionBar('dim-impact-bar', 'dim-impact-val', dims.bulletImpact || ats);
  renderDimensionBar('dim-ats-bar', 'dim-ats-val', dims.atsAlignment || ats);

  // 4. "What This Means" Verdict Callout
  const verdictEl = document.getElementById('audit-verdict-text');
  if (verdictEl) {
    verdictEl.textContent = results.verdict || 'Project demonstrates solid hands-on development. Addressing specific action verbs and incorporating industry keywords will maximize recruiter engagement.';
  }

  // 5. Strengths List
  renderStrengthsList('strengths-list', results.strengths || []);

  // 6. Gaps & Improvements List
  renderImprovementsList('improvements-list', results.improvements || []);

  // 7. ATS & Keyword Intelligence
  renderAtsCard('ats-analysis-container', results.atsAnalysis);

  // 8. Bullet Rewrites (Before vs. After)
  renderBulletRewrites('bullet-rewrites-container', results.bulletRewrites || []);
}

/**
 * Updates a dimensional progress bar and label.
 */
function renderDimensionBar(barId, valId, score) {
  const bar = document.getElementById(barId);
  const val = document.getElementById(valId);
  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  if (bar) {
    bar.style.width = '0%';
    setTimeout(() => {
      bar.style.width = `${clamped}%`;
      bar.style.backgroundColor = getScoreColor(clamped);
    }, 50);
  }
  if (val) val.textContent = `${clamped}%`;
}

/**
 * Renders categorized strengths.
 */
function renderStrengthsList(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (items.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-500 italic py-2">No specific strengths identified.</p>';
    return;
  }

  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className =
      'rounded-lg border border-slate-800 bg-[#0c1017] p-3 text-sm flex items-start gap-3 transition-colors hover:border-slate-700';
    card.style.animation = `fadeInUp 0.3s ease-out both ${idx * 60}ms`;

    const category = item.category || 'Asset';
    const text = typeof item === 'string' ? item : item.text;

    card.innerHTML = `
      <span class="mt-0.5 inline-block w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0"></span>
      <div class="flex-1 min-w-0">
        <span class="inline-block text-[11px] font-mono font-medium text-emerald-400 uppercase tracking-wider mb-1">${escapeHtml(category)}</span>
        <p class="text-slate-300 text-xs sm:text-sm leading-relaxed">${escapeHtml(text)}</p>
      </div>
    `;
    container.appendChild(card);
  });
}

/**
 * Renders prioritized improvements with "Why this matters".
 */
function renderImprovementsList(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (items.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-500 italic py-2">No critical gaps identified.</p>';
    return;
  }

  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className =
      'rounded-lg border border-slate-800 bg-[#0c1017] p-3 text-sm flex items-start gap-3 transition-colors hover:border-slate-700';
    card.style.animation = `fadeInUp 0.3s ease-out both ${idx * 60}ms`;

    const category = item.category || 'Recruiter Flag';
    const text = typeof item === 'string' ? item : item.text;
    const why = item.whyItMatters || 'Recruiters scan for quantifiable evidence during screening.';

    card.innerHTML = `
      <span class="mt-0.5 inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"></span>
      <div class="flex-1 min-w-0">
        <span class="inline-block text-[11px] font-mono font-medium text-amber-400 uppercase tracking-wider mb-1">${escapeHtml(category)}</span>
        <p class="text-slate-300 text-xs sm:text-sm leading-relaxed mb-2">${escapeHtml(text)}</p>
        <div class="rounded border border-slate-800/80 bg-slate-900/60 px-2.5 py-1.5 text-[11px] text-slate-400">
          <span class="font-medium text-slate-300">Why this matters:</span> ${escapeHtml(why)}
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

/**
 * Renders ATS keywords and recruiter screening rationale.
 */
function renderAtsCard(containerId, atsData) {
  const container = document.getElementById(containerId);
  if (!container || !atsData) return;

  const detected = atsData.detectedKeywords || [];
  const recommended = atsData.recommendedKeywords || [];
  const note = atsData.screeningNote || 'ATS filters screen for explicit framework, architecture, and testing terms.';

  container.innerHTML = `
    <div class="space-y-4">
      <!-- Detected Keywords -->
      <div>
        <div class="text-[11px] font-mono uppercase text-slate-400 tracking-wider mb-2">Detected Stack Keywords</div>
        <div class="flex flex-wrap gap-1.5">
          ${detected.map((kw) => `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-slate-800 text-slate-200 border border-slate-700">${escapeHtml(kw)}</span>`).join('')}
        </div>
      </div>

      <!-- Recommended Keywords -->
      <div>
        <div class="text-[11px] font-mono uppercase text-slate-400 tracking-wider mb-2">Recommended Industry Keywords</div>
        <div class="flex flex-wrap gap-1.5">
          ${recommended.map((kw) => `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-blue-950/40 text-blue-300 border border-blue-800/50">+ ${escapeHtml(kw)}</span>`).join('')}
        </div>
      </div>

      <!-- Screening Note -->
      <div class="rounded-lg border border-slate-800 bg-[#0c1017] p-3 text-xs text-slate-400 leading-relaxed">
        <span class="font-medium text-slate-300">Recruiter Screening Note:</span> ${escapeHtml(note)}
      </div>
    </div>
  `;
}

/**
 * Renders actionable before/after bullet comparison cards.
 */
function renderBulletRewrites(containerId, rewrites) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (rewrites.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-500 italic py-2">No bullets available to rewrite.</p>';
    return;
  }

  rewrites.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className =
      'rounded-xl border border-slate-800 bg-[#0c1017] p-4 space-y-3 transition-colors hover:border-slate-700';
    card.style.animation = `fadeInUp 0.3s ease-out both ${idx * 80}ms`;

    const hasOriginal = !!(item.original && item.original.trim());
    const originalHtml = hasOriginal
      ? `
        <div class="rounded border border-slate-800/80 bg-slate-900/40 p-2.5">
          <div class="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">Original Draft</div>
          <p class="text-xs text-slate-400 line-through opacity-75">${escapeHtml(item.original)}</p>
        </div>`
      : '';

    card.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <span class="inline-flex items-center gap-1.5 text-xs font-mono text-blue-400">
          <span class="w-4 h-4 rounded bg-blue-500/10 flex items-center justify-center text-[10px] font-bold">${idx + 1}</span>
          ${escapeHtml(item.rationale || 'Action-Oriented Engineering Bullet')}
        </span>
        <button type="button" class="bullet-copy-btn inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white" data-bullet-text="${escapeHtml(item.improved)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <span class="btn-label">Copy</span>
        </button>
      </div>

      ${originalHtml}

      <div class="rounded border border-blue-950/60 bg-blue-950/20 p-3">
        <div class="text-[10px] font-mono uppercase tracking-wider text-blue-400 mb-1">Audited Bullet</div>
        <p class="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal">${escapeHtml(item.improved)}</p>
      </div>
    `;

    container.appendChild(card);
  });

  // Wire copy buttons with fallback
  container.querySelectorAll('.bullet-copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-bullet-text') || '';
      copyTextWithFeedback(btn, text);
    });
  });
}

/**
 * Robust copy helper with visual feedback and fallback.
 */
function copyTextWithFeedback(btn, text) {
  const originalLabel = btn.querySelector('.btn-label');

  const onCopied = () => {
    if (originalLabel) originalLabel.textContent = 'Copied!';
    btn.classList.add('border-emerald-500', 'text-emerald-400');
    setTimeout(() => {
      if (originalLabel) originalLabel.textContent = 'Copy';
      btn.classList.remove('border-emerald-500', 'text-emerald-400');
    }, 2000);
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(text)
      .then(onCopied)
      .catch(() => fallbackCopy(text, onCopied));
  } else {
    fallbackCopy(text, onCopied);
  }
}

/**
 * Textarea fallback for clipboard copying in non-secure or restricted environments.
 */
function fallbackCopy(text, callback) {
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    if (callback) callback();
  } catch (e) {
    console.error('Clipboard copy failed', e);
  }
}

/**
 * Resets dashboard to initial standby state.
 */
export function resetDashboard() {
  const emptyState = document.getElementById('dashboard-empty-state');
  const errorState = document.getElementById('dashboard-error-state');
  const contentState = document.getElementById('dashboard-content');

  if (emptyState) emptyState.classList.remove('hidden');
  if (errorState) errorState.classList.add('hidden');
  if (contentState) contentState.classList.add('hidden');

  clearErrors();
}

/**
 * Shows loading placeholder on the dashboard.
 */
function showLoadingState(isDemoMode) {
  const emptyState = document.getElementById('dashboard-empty-state');
  const errorState = document.getElementById('dashboard-error-state');
  const contentState = document.getElementById('dashboard-content');

  if (emptyState) emptyState.classList.add('hidden');
  if (errorState) errorState.classList.add('hidden');
  if (contentState) contentState.classList.remove('hidden');

  const modeChip = document.getElementById('audit-mode-chip');
  if (modeChip) {
    modeChip.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
      <span class="text-blue-300 font-mono">${isDemoMode ? 'Running Local Evaluation Engine...' : 'Calling Gemini 3.8 Flash...'}</span>
    `;
    modeChip.className = 'inline-flex items-center gap-1.5 rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs';
  }

  // Set gauges to indeterminate / resetting
  const overallRing = document.getElementById('overall-score-ring');
  const atsRing = document.getElementById('ats-score-ring');
  if (overallRing) overallRing.style.strokeDashoffset = GAUGE_CIRCUMFERENCE;
  if (atsRing) atsRing.style.strokeDashoffset = GAUGE_CIRCUMFERENCE;

  const overallVal = document.getElementById('overall-score-value');
  const atsVal = document.getElementById('ats-score-value');
  if (overallVal) overallVal.textContent = '...';
  if (atsVal) atsVal.textContent = '...';

  const verdictEl = document.getElementById('audit-verdict-text');
  if (verdictEl) verdictEl.textContent = 'Analyzing architecture, technical scope, and resume evidence...';
}

/**
 * Renders technical error into dashboard.
 */
function renderError(message) {
  const emptyState = document.getElementById('dashboard-empty-state');
  const errorState = document.getElementById('dashboard-error-state');
  const contentState = document.getElementById('dashboard-content');

  if (emptyState) emptyState.classList.add('hidden');
  if (contentState) contentState.classList.add('hidden');
  if (errorState) {
    errorState.classList.remove('hidden');
    const msgEl = document.getElementById('error-message-text');
    if (msgEl) msgEl.textContent = message;
  }
}

/**
 * Toggles audit button loading state.
 */
function setButtonLoading(loading, isDemoMode) {
  const btn = document.getElementById('run-audit-btn');
  const runIcon = document.getElementById('run-icon');
  const loadingIcon = document.getElementById('loading-icon');
  const btnText = document.getElementById('run-btn-text');

  if (!btn) return;

  if (loading) {
    btn.disabled = true;
    if (runIcon) runIcon.classList.add('hidden');
    if (loadingIcon) loadingIcon.classList.remove('hidden');
    if (btnText) {
      btnText.textContent = isDemoMode ? 'Evaluating (Demo Engine)...' : 'Auditing with Gemini 3.8...';
    }
  } else {
    btn.disabled = false;
    if (runIcon) runIcon.classList.remove('hidden');
    if (loadingIcon) loadingIcon.classList.add('hidden');
    if (btnText) btnText.textContent = 'Run Technical Audit';
  }
}

/**
 * Animates score value from start to end number.
 */
function animateScoreNumber(el, from, to, duration) {
  const start = performance.now();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * easeOut);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/**
 * Returns color hex corresponding to score band.
 */
function getScoreColor(score) {
  if (score >= 80) return '#10b981'; // Emerald
  if (score >= 65) return '#f59e0b'; // Amber
  return '#f43f5e'; // Rose
}

/**
 * Returns badge CSS styles for score.
 */
function getScoreBadgeStyle(score) {
  if (score >= 80) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
  if (score >= 65) return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
  return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
}

/**
 * Escapes HTML characters.
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

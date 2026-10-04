/**
 * form.js — Form data extraction, inline validation, and sample prefill.
 */

/**
 * Extracts and trims all input values from the audit form.
 * @returns {Object|null}
 */
export function collectFormData() {
  const form = document.getElementById('audit-form');
  if (!form) return null;

  const data = new FormData(form);

  const rawBullets = (data.get('resumeBullets') || '').trim();
  const bullets = rawBullets
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return {
    studentName: (data.get('studentName') || '').trim(),
    projectTitle: (data.get('projectTitle') || '').trim(),
    techStack: (data.get('techStack') || '').trim(),
    resumeBullets: bullets,
    githubLink: (data.get('githubLink') || '').trim(),
    geminiApiKey: (data.get('geminiApiKey') || '').trim(),
  };
}

/**
 * Validates required inputs and URL structure.
 * @returns {Object|null} Errors map or null if valid.
 */
export function validateForm() {
  const errors = {};
  const data = collectFormData();

  if (!data) return { _form: 'Form not found' };

  if (!data.studentName) {
    errors.studentName = 'Student or candidate name is required.';
  }

  if (!data.projectTitle) {
    errors.projectTitle = 'Project title is required.';
  }

  if (data.githubLink) {
    try {
      const parsed = new URL(data.githubLink);
      if (!parsed.protocol.startsWith('http')) {
        errors.githubLink = 'Please provide a valid https:// URL.';
      }
    } catch {
      errors.githubLink = 'Enter a valid URL (e.g. https://github.com/username/project).';
    }
  }

  clearErrors();

  if (Object.keys(errors).length > 0) {
    Object.entries(errors).forEach(([field, msg]) => {
      const errorEl = document.querySelector(`[data-error-for="${field}"]`);
      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
      }
      const input = document.querySelector(`[name="${field}"]`);
      if (input) {
        input.classList.add('border-rose-500', 'ring-1', 'ring-rose-500');
      }
    });
    return errors;
  }

  return null;
}

/**
 * Clears all inline error styles and messages.
 */
export function clearErrors() {
  document.querySelectorAll('[data-error-for]').forEach((el) => {
    el.classList.add('hidden');
    el.textContent = '';
  });
  document.querySelectorAll('.border-rose-500').forEach((el) => {
    el.classList.remove('border-rose-500', 'ring-1', 'ring-rose-500');
  });
}

/**
 * Prefills the form with a realistic engineering student project.
 * Enables 1-click evaluation testing.
 */
export function populateSampleData() {
  const studentNameInput = document.getElementById('student-name');
  const projectTitleInput = document.getElementById('project-title');
  const techStackInput = document.getElementById('tech-stack');
  const resumeBulletsInput = document.getElementById('resume-bullets');
  const githubLinkInput = document.getElementById('github-link');

  if (studentNameInput) studentNameInput.value = 'Alex Chen';
  if (projectTitleInput) projectTitleInput.value = 'Distributed Task Queue & Background Job Engine';
  if (techStackInput) techStackInput.value = 'Go, Redis, PostgreSQL, Docker, Prometheus';
  if (resumeBulletsInput) {
    resumeBulletsInput.value =
      '• Built a worker pool system to process background tasks asynchronously with Redis queues\n' +
      '• Added automated retry mechanisms with backoff for failed database transactions in PostgreSQL\n' +
      '• Containerized services using Docker and exposed Prometheus metrics endpoint for queue latency monitoring';
  }
  if (githubLinkInput) githubLinkInput.value = 'https://github.com/alexchen-dev/distributed-task-engine';

  clearErrors();
}

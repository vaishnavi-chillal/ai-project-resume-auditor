/**
 * gemini.js — Client-side audit API caller and deterministic demo engine.
 *
 * Secure Vercel Architecture:
 * The frontend never communicates directly with Google's Gemini API and has no access
 * to GEMINI_API_KEY. All audit requests are dispatched to the serverless proxy /api/audit.
 */

/**
 * Dispatches the candidate's project details to the serverless /api/audit endpoint.
 * @param {Object} formData
 * @returns {Promise<Object>}
 */
export async function callGemini(formData) {
  let response;

  try {
    response = await fetch('/api/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentName: formData.studentName,
        projectTitle: formData.projectTitle,
        techStack: formData.techStack,
        resumeBullets: formData.resumeBullets,
        githubLink: formData.githubLink,
      }),
    });
  } catch (netErr) {
    const error = new Error('Network error: Unable to reach the audit API endpoint (/api/audit). Check your internet connection.');
    error.code = 'NETWORK_ERROR';
    throw error;
  }

  let data;
  try {
    data = await response.json();
  } catch (jsonErr) {
    const error = new Error('The audit server returned an invalid non-JSON response.');
    error.code = 'MALFORMED_RESPONSE';
    throw error;
  }

  if (!response.ok) {
    const errorMessage = data?.error || `Audit API request failed with HTTP ${response.status}.`;
    const error = new Error(errorMessage);
    error.code = data?.code || 'API_ERROR';
    error.status = response.status;
    throw error;
  }

  return validateAuditResult(data);
}

/**
 * Validates, clamps, and normalizes audit result structure.
 * Supports both rich format and standard schema.
 * @param {Object} data
 * @returns {Object}
 */
export function validateAuditResult(data) {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid audit result format received from server.');
  }

  // overallScore
  let overallScore = parseInt(data.overallScore, 10);
  if (isNaN(overallScore)) overallScore = 75;
  overallScore = Math.max(0, Math.min(100, overallScore));

  // scoreLabel
  const scoreLabel =
    typeof data.scoreLabel === 'string' && data.scoreLabel.trim()
      ? data.scoreLabel.trim()
      : overallScore >= 80
      ? 'Strong'
      : overallScore >= 65
      ? 'Proficient'
      : 'Developing';

  // atsScore
  let atsScore = parseInt(data.atsScore, 10);
  if (isNaN(atsScore)) {
    atsScore = Math.max(0, Math.min(100, Math.round(overallScore * 0.92)));
  } else {
    atsScore = Math.max(0, Math.min(100, atsScore));
  }

  // verdict
  const verdict =
    typeof data.verdict === 'string' && data.verdict.trim().length > 0
      ? data.verdict.trim()
      : 'Solid technical baseline. Strengthening bullet evidence and incorporating domain keywords will maximize recruiter engagement.';

  // dimensions
  const dims = data.dimensions || {};
  const dimensions = {
    technicalDepth: clampScore(dims.technicalDepth, Math.round(overallScore * 0.96)),
    bulletImpact: clampScore(dims.bulletImpact, Math.round(atsScore * 0.94)),
    atsAlignment: clampScore(dims.atsAlignment, atsScore),
  };

  // strengths (array of strings)
  const strengths = [];
  if (Array.isArray(data.strengths)) {
    data.strengths.forEach((item) => {
      if (typeof item === 'string' && item.trim()) {
        strengths.push({ category: 'Key Asset', text: item.trim() });
      } else if (item && typeof item === 'object' && item.text) {
        strengths.push({
          category: item.category || 'Architecture',
          text: item.text.trim(),
        });
      }
    });
  }
  if (strengths.length === 0) {
    strengths.push(
      { category: 'Implementation', text: 'Demonstrates functional hands-on development skills.' },
      { category: 'Stack Alignment', text: 'Clear relevance between selected stack and problem domain.' },
    );
  }

  // improvements (array of strings)
  const improvements = [];
  if (Array.isArray(data.improvements)) {
    data.improvements.forEach((item) => {
      if (typeof item === 'string' && item.trim()) {
        improvements.push({
          category: 'Action Item',
          text: item.trim(),
          whyItMatters: 'Recruiters look for verifiable evidence when screening projects.',
        });
      } else if (item && typeof item === 'object' && item.text) {
        improvements.push({
          category: item.category || 'Refinement',
          text: item.text.trim(),
          whyItMatters: item.whyItMatters || 'Helps resume bullets stand out during technical evaluation.',
        });
      }
    });
  }
  if (improvements.length === 0) {
    improvements.push({
      category: 'Evidence',
      text: 'Add verifiable technical benchmarks or scale where available.',
      whyItMatters: 'Recruiters prioritize candidates with measurable impact.',
    });
  }

  // atsAnalysis
  const ats = data.atsAnalysis || {};
  const rawKeywords = Array.isArray(data.atsKeywords) ? data.atsKeywords : ats.detectedKeywords;
  const atsAnalysis = {
    detectedKeywords: Array.isArray(rawKeywords) && rawKeywords.length > 0
      ? rawKeywords.filter((k) => typeof k === 'string').map((k) => k.trim())
      : ['Web Development', 'JavaScript'],
    recommendedKeywords: Array.isArray(ats.recommendedKeywords) && ats.recommendedKeywords.length > 0
      ? ats.recommendedKeywords.filter((k) => typeof k === 'string').map((k) => k.trim())
      : ['Unit Testing', 'CI/CD', 'API Design'],
    screeningNote:
      typeof data.atsSummary === 'string' && data.atsSummary.trim().length > 0
        ? data.atsSummary.trim()
        : typeof ats.screeningNote === 'string' && ats.screeningNote.trim().length > 0
        ? ats.screeningNote.trim()
        : 'Applicant Tracking Systems filter candidate resumes using specific stack keywords and action verbs.',
  };

  // bulletRewrites
  const bulletRewrites = [];
  if (Array.isArray(data.bulletRewrites) && data.bulletRewrites.length > 0) {
    data.bulletRewrites.forEach((item) => {
      if (typeof item === 'object' && item.improved) {
        bulletRewrites.push({
          original: item.original || '',
          improved: item.improved.trim(),
          rationale: item.rationale || 'Enhanced action verb and architectural clarity.',
        });
      }
    });
  } else if (Array.isArray(data.optimizedBullets)) {
    data.optimizedBullets.forEach((bullet) => {
      if (typeof bullet === 'string' && bullet.trim()) {
        bulletRewrites.push({
          original: '',
          improved: bullet.trim(),
          rationale: 'Refined into an action-oriented technical statement.',
        });
      }
    });
  }

  if (bulletRewrites.length === 0) {
    bulletRewrites.push({
      original: 'Developed project using selected technologies.',
      improved: 'Architected modular application implementing responsive UI components and structured data persistence.',
      rationale: 'Replaces generic description with active engineering terminology.',
    });
  }

  return {
    overallScore,
    scoreLabel,
    atsScore,
    verdict,
    dimensions,
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
    atsAnalysis,
    bulletRewrites,
    optimizedBullets: bulletRewrites.map((r) => r.improved),
    atsKeywords: atsAnalysis.detectedKeywords,
    atsSummary: atsAnalysis.screeningNote,
  };
}

function clampScore(val, fallback = 75) {
  const num = parseInt(val, 10);
  if (isNaN(num)) return fallback;
  return Math.max(0, Math.min(100, num));
}

/**
 * Deterministic offline evaluation engine.
 * Fully preserves client-side demo evaluation when Gemini is unavailable.
 * @param {Object} formData
 * @returns {Object}
 */
export function getDemoResults(formData) {
  const rawTech = formData.techStack || '';
  const techTokens = rawTech
    .split(/[,/|]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const bullets = formData.resumeBullets || [];
  const projectTitle = formData.projectTitle || 'Technical Project';

  const detectedKeywords = techTokens.length > 0 ? techTokens.slice(0, 6) : ['Core Development', 'Problem Solving'];

  const lowerTech = rawTech.toLowerCase();
  let recommendedKeywords = [];
  let domainNote = '';

  if (lowerTech.includes('react') || lowerTech.includes('vue') || lowerTech.includes('frontend') || lowerTech.includes('tailwind')) {
    recommendedKeywords = ['TypeScript', 'State Management', 'Web Vitals', 'Accessibility (a11y)', 'Component Testing'];
    domainNote = 'Frontend ATS filters scan for TypeScript adoption, state management architecture, and performance optimization.';
  } else if (lowerTech.includes('python') || lowerTech.includes('ml') || lowerTech.includes('data') || lowerTech.includes('ai')) {
    recommendedKeywords = ['Model Evaluation', 'Data Pipelines', 'Feature Engineering', 'Pandas/NumPy', 'API Serving'];
    domainNote = 'Data & AI technical screeners filter heavily for data preprocessing pipelines and explicit model evaluation benchmarks.';
  } else if (lowerTech.includes('node') || lowerTech.includes('go') || lowerTech.includes('java') || lowerTech.includes('backend') || lowerTech.includes('sql')) {
    recommendedKeywords = ['REST / gRPC', 'Database Indexing', 'Concurrency', 'Docker', 'Unit Testing'];
    domainNote = 'Backend ATS parsers prioritize database indexing, distributed message handling, and test suite coverage.';
  } else {
    recommendedKeywords = ['Version Control (Git)', 'Unit Testing', 'CI/CD Pipelines', 'System Architecture', 'Code Refactoring'];
    domainNote = 'General engineering filters look for automated testing, version control best practices, and structured documentation.';
  }

  let overallScore = 78;
  let atsScore = 72;

  if (techTokens.length >= 3) {
    overallScore += 4;
    atsScore += 3;
  }
  if (formData.githubLink) {
    overallScore += 2;
    atsScore += 3;
  }
  if (bullets.length >= 2) {
    overallScore += 2;
    atsScore += 3;
  }

  overallScore = Math.min(88, Math.max(76, overallScore));
  atsScore = Math.min(84, Math.max(70, atsScore));

  const scoreLabel = overallScore >= 80 ? 'Strong' : overallScore >= 65 ? 'Proficient' : 'Developing';
  const technicalDepth = Math.min(95, overallScore + 3);
  const bulletImpact = Math.min(90, atsScore - 2);
  const atsAlignment = atsScore;

  const bulletRewrites = [];
  const primaryTech = techTokens.slice(0, 2).join(' and ') || 'modern engineering tooling';
  const secondaryTech = techTokens.slice(2, 4).join(', ') || 'structured persistence';

  if (bullets.length > 0) {
    bullets.forEach((orig, idx) => {
      let improved = '';
      let rationale = '';

      if (idx === 0) {
        improved = `Architected ${projectTitle} leveraging ${primaryTech}, establishing modular code structure and standard error handling workflows.`;
        rationale = 'Replaced passive verb with "Architected" and highlighted modular design decisions.';
      } else if (idx === 1) {
        improved = `Implemented core business logic with ${secondaryTech || primaryTech}, ensuring reliable data consistency and input validation.`;
        rationale = 'Emphasized technical validation and architectural reliability over generic descriptions.';
      } else {
        improved = `Optimized application workflow by integrating ${orig.replace(/^[•\-\*]\s*/, '')}, improving codebase maintainability and testability.`;
        rationale = 'Highlighted maintainability and clear engineering outcome.';
      }

      bulletRewrites.push({
        original: orig,
        improved,
        rationale,
      });
    });
  } else {
    bulletRewrites.push(
      {
        original: `Developed ${projectTitle} using ${primaryTech}.`,
        improved: `Architected and deployed ${projectTitle} using ${primaryTech}, implementing modular component patterns and strict schema validation.`,
        rationale: 'Elevated technical vocabulary and stated specific architecture patterns.',
      },
      {
        original: 'Worked on team project features and bug fixes.',
        improved: 'Spearheaded core feature implementation using Git version control and collaborative peer reviews, reducing bug recurrence.',
        rationale: 'Transformed vague participation into verifiable engineering ownership.',
      },
    );
  }

  return {
    overallScore,
    scoreLabel,
    atsScore,
    verdict: `Strong architectural baseline in ${techTokens.length > 0 ? techTokens[0] : 'the chosen stack'}. To maximize screening callbacks, quantify project scale (e.g. data records, response times) and incorporate standard industry testing keywords.`,
    dimensions: {
      technicalDepth,
      bulletImpact,
      atsAlignment,
    },
    strengths: [
      {
        category: 'Stack Cohesion',
        text: techTokens.length > 0
          ? `Solid technical synergy across ${techTokens.slice(0, 3).join(', ')} for the project scope.`
          : 'Clear problem-oriented technical approach with structured implementation goals.',
      },
      {
        category: 'Project Definition',
        text: `The project "${projectTitle}" addresses a concrete software use-case with defined architectural boundaries.`,
      },
    ],
    improvements: [
      {
        category: 'Quantifiable Metrics',
        text: 'Incorporate factual numbers (e.g., query response times, test coverage percentage, dataset size).',
        whyItMatters: 'Recruiters scan for numbers within the first 6 seconds of reading a technical resume.',
      },
      {
        category: 'ATS Keywords',
        text: `Consider introducing industry terms such as "${recommendedKeywords.slice(0, 2).join('" and "')}" if applicable.`,
        whyItMatters: domainNote,
      },
    ],
    atsAnalysis: {
      detectedKeywords,
      recommendedKeywords,
      screeningNote: domainNote,
    },
    bulletRewrites,
    optimizedBullets: bulletRewrites.map((r) => r.improved),
    atsKeywords: detectedKeywords,
    atsSummary: domainNote,
  };
}

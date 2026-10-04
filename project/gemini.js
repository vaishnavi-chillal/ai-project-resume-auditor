/**
 * gemini.js — Google Gemini API integration and deterministic demo engine.
 *
 * Supports two operational modes:
 *  1. Live Gemini API (gemini-3.8-flash)
 *  2. Offline Demo Mode (contextual deterministic evaluation engine)
 */

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

/**
 * Checks whether an API key has been provided.
 * @param {string} apiKey
 * @returns {boolean}
 */
export function hasApiKey(apiKey) {
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}

/**
 * Executes the audit via Gemini API or falls back to local demo results.
 * @param {Object} formData
 * @returns {Promise<Object>}
 */
export async function callGemini(formData) {
  if (!hasApiKey(formData.geminiApiKey)) {
    return getDemoResults(formData);
  }
  return callGeminiAPI(formData);
}

/**
 * Sends request to the Gemini 3.8 Flash REST API.
 * @param {Object} formData
 * @returns {Promise<Object>}
 */
async function callGeminiAPI(formData) {
  const requestBody = buildRequestBody(formData);

  let response;
  try {
    response = await fetch(
      `${GEMINI_ENDPOINT}?key=${encodeURIComponent(formData.geminiApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
    );
  } catch (err) {
    throw new Error(
      'Network connection failed. Unable to reach Gemini API endpoint. Check your internet connection.',
    );
  }

  if (!response.ok) {
    throw new Error(parseHttpError(response.status));
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error('Gemini API returned an invalid response format.');
  }

  return parseGeminiResponse(json);
}

/**
 * Constructs the Gemini request payload with strict JSON formatting.
 * @param {Object} formData
 * @returns {Object}
 */
function buildRequestBody(formData) {
  const prompt = buildAuditPrompt(formData);

  return {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      topP: 0.9,
      maxOutputTokens: 2500,
      responseMimeType: 'application/json',
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };
}

/**
 * Generates the technical audit prompt sent to Gemini.
 * @param {Object} formData
 * @returns {string}
 */
function buildAuditPrompt(formData) {
  const bulletsText =
    formData.resumeBullets.length > 0
      ? formData.resumeBullets.map((b, i) => `  ${i + 1}. "${b}"`).join('\n')
      : '  (No resume bullets provided)';

  const githubLine = formData.githubLink
    ? `\nGitHub Link: ${formData.githubLink}`
    : '\nGitHub Link: (not provided)';

  return `You are an expert engineering hiring manager and technical resume auditor evaluating a software engineering candidate's project.

Analyze the submission with technical rigor and practical objectivity.

CRITICAL EVALUATION RULES:
1. Do NOT invent technologies, metrics, team sizes, or accomplishments not stated in the input.
2. Evaluate two distinct benchmarks:
   - "overallScore" (0-100): Engineering complexity, architectural cohesion, and technical depth.
   - "atsScore" (0-100): ATS parser readiness, keyword density, and quantifiable evidence strength in resume bullets.
3. Provide realistic, critical feedback that helps candidates understand how technical screeners and automated ATS filters evaluate their project.
4. If bullets are provided, rewrite each one to replace passive verbs ("helped", "worked on", "built") with high-impact engineering verbs, integrating technologies and clear technical evidence without fabricating unverifiable numbers.

SUBMISSION DETAILS:
Candidate Name: ${formData.studentName}
Project Title: ${formData.projectTitle}
Tech Stack: ${formData.techStack || '(not specified)'}
Current Resume Bullets:
${bulletsText}${githubLine}

RESPOND WITH ONLY A STRICT JSON OBJECT MATCHING THIS EXACT SCHEMA:
{
  "overallScore": <integer 0-100>,
  "atsScore": <integer 0-100>,
  "verdict": "<concise 1-2 sentence executive assessment of project and resume readiness>",
  "dimensions": {
    "technicalDepth": <integer 0-100>,
    "bulletImpact": <integer 0-100>,
    "atsAlignment": <integer 0-100>
  },
  "strengths": [
    { "category": "<short category tag, e.g. Stack Cohesion>", "text": "<concrete strength observation>" },
    { "category": "<short category tag, e.g. Implementation>", "text": "<concrete strength observation>" }
  ],
  "improvements": [
    { "category": "<short category tag, e.g. Quantifiable Evidence>", "text": "<actionable fix>", "whyItMatters": "<why recruiters care>" },
    { "category": "<short category tag, e.g. Action Verbs>", "text": "<actionable fix>", "whyItMatters": "<why recruiters care>" }
  ],
  "atsAnalysis": {
    "detectedKeywords": ["<keyword1>", "<keyword2>", ...],
    "recommendedKeywords": ["<industry keyword1 relevant to stack>", "<industry keyword2>", ...],
    "screeningNote": "<brief technical explanation of what automated parsers look for in this domain>"
  },
  "bulletRewrites": [
    {
      "original": "<original bullet text or primary responsibility>",
      "improved": "<audited action-oriented bullet with technical clarity>",
      "rationale": "<brief explanation of what was changed and why>"
    }
  ]
}`;
}

/**
 * Extracts and parses the Gemini response.
 * @param {Object} json
 * @returns {Object}
 */
function parseGeminiResponse(json) {
  const candidates = json?.candidates;
  if (!candidates || candidates.length === 0) {
    const blockReason = json?.promptFeedback?.blockReason;
    if (blockReason) {
      throw new Error(`Request was filtered by safety policies (${blockReason}). Revise input and retry.`);
    }
    throw new Error('Gemini API returned an empty candidate list.');
  }

  const candidate = candidates[0];
  if (candidate.finishReason === 'SAFETY') {
    throw new Error('Response was blocked by content safety filters.');
  }

  const parts = candidate?.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error('Gemini API returned empty response content.');
  }

  const rawText = parts.map((p) => p.text || '').join('').trim();
  if (!rawText) {
    throw new Error('Gemini API returned blank text output.');
  }

  const cleanJson = stripCodeFences(rawText);

  let parsed;
  try {
    parsed = JSON.parse(cleanJson);
  } catch {
    throw new Error('Gemini output could not be parsed as valid JSON.');
  }

  return validateAuditResult(parsed);
}

/**
 * Strips markdown code fences from JSON output.
 * @param {string} text
 * @returns {string}
 */
function stripCodeFences(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?```\s*$/i, '');

  if (cleaned.includes('```')) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
  }

  return cleaned.trim();
}

/**
 * Validates, clamps, and normalizes audit result structure.
 * Supports both rich format and legacy schema for backwards safety.
 * @param {Object} data
 * @returns {Object}
 */
export function validateAuditResult(data) {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid audit result format.');
  }

  // overallScore
  let overallScore = parseInt(data.overallScore, 10);
  if (isNaN(overallScore)) overallScore = 75;
  overallScore = Math.max(0, Math.min(100, overallScore));

  // atsScore
  let atsScore = parseInt(data.atsScore, 10);
  if (isNaN(atsScore)) {
    // If not provided in older responses, calculate sensible heuristic based on overall score
    atsScore = Math.max(0, Math.min(100, Math.round(overallScore * 0.92)));
  } else {
    atsScore = Math.max(0, Math.min(100, atsScore));
  }

  // verdict
  const verdict =
    typeof data.verdict === 'string' && data.verdict.trim().length > 0
      ? data.verdict.trim()
      : 'Solid technical foundation. Strengthening bullet evidence and incorporating domain keywords will improve recruiter visibility.';

  // dimensions
  const dims = data.dimensions || {};
  const dimensions = {
    technicalDepth: clampScore(dims.technicalDepth, Math.round(overallScore * 0.96)),
    bulletImpact: clampScore(dims.bulletImpact, Math.round(atsScore * 0.94)),
    atsAlignment: clampScore(dims.atsAlignment, atsScore),
  };

  // strengths (normalized to array of { category, text })
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

  // improvements (normalized to array of { category, text, whyItMatters })
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
    improvements.push(
      {
        category: 'Evidence',
        text: 'Add verifiable technical benchmarks or scale where available.',
        whyItMatters: 'Recruiters prioritize candidates with measurable impact.',
      },
    );
  }

  // atsAnalysis
  const ats = data.atsAnalysis || {};
  const atsAnalysis = {
    detectedKeywords: Array.isArray(ats.detectedKeywords) && ats.detectedKeywords.length > 0
      ? ats.detectedKeywords.filter((k) => typeof k === 'string').map((k) => k.trim())
      : ['Web Development', 'JavaScript'],
    recommendedKeywords: Array.isArray(ats.recommendedKeywords) && ats.recommendedKeywords.length > 0
      ? ats.recommendedKeywords.filter((k) => typeof k === 'string').map((k) => k.trim())
      : ['Unit Testing', 'CI/CD', 'API Design'],
    screeningNote:
      typeof ats.screeningNote === 'string' && ats.screeningNote.trim().length > 0
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
    // Legacy support
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
    atsScore,
    verdict,
    dimensions,
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
    atsAnalysis,
    bulletRewrites,
  };
}

/**
 * Clamps numeric score between 0 and 100.
 */
function clampScore(val, fallback = 75) {
  const num = parseInt(val, 10);
  if (isNaN(num)) return fallback;
  return Math.max(0, Math.min(100, num));
}

/**
 * Maps HTTP status codes to user-friendly messages.
 */
function parseHttpError(status) {
  switch (status) {
    case 400:
      return 'Bad request. The Gemini API rejected the submission payload format.';
    case 401:
    case 403:
      return 'Invalid or unauthorized API key. Verify that your Gemini key is active and has Generative Language API permissions.';
    case 404:
      return 'The Gemini 3.8 Flash model endpoint was not found. Please verify API model availability for your key.';
    case 429:
      return 'Gemini API rate limit exceeded. Please wait a few seconds before submitting again.';
    case 500:
    case 502:
    case 503:
      return 'Gemini API servers are temporarily experiencing high load. Please try again shortly.';
    default:
      return `Gemini API returned HTTP status ${status}. Check key and network settings.`;
  }
}

/**
 * Deterministic offline evaluation engine.
 * Generates realistic, tailored feedback based on actual user input.
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

  // Evaluate tech stack keywords
  const detectedKeywords = techTokens.length > 0 ? techTokens.slice(0, 6) : ['Core Development', 'Problem Solving'];

  // Determine domain-specific recommended keywords
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

  // Calculate scores deterministically based on input completeness
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
  // Cap demo scores to realistic student ranges (76 - 86)
  overallScore = Math.min(88, Math.max(76, overallScore));
  atsScore = Math.min(84, Math.max(70, atsScore));

  const technicalDepth = Math.min(95, overallScore + 3);
  const bulletImpact = Math.min(90, atsScore - 2);
  const atsAlignment = atsScore;

  // Generate actionable bullet rewrites based on actual user bullets or project title
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
  };
}

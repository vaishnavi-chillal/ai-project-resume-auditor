/**
 * /api/audit — Vercel Serverless Function
 *
 * Secure server-side proxy for Google Gemini 3.8 Flash.
 * Reads GEMINI_API_KEY exclusively from process.env.GEMINI_API_KEY.
 * Never exposes the key to the client or logs sensitive data.
 */

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

export default async function handler(req, res) {
  // CORS & Method verification
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return sendJson(res, 204, {});
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, {
      error: 'Method not allowed. Use POST /api/audit.',
      code: 'METHOD_NOT_ALLOWED',
    });
  }

  // 1. Verify Server API Key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return sendJson(res, 503, {
      error: 'GEMINI_API_KEY is not configured in server environment variables.',
      code: 'MISSING_SERVER_KEY',
    });
  }

  // 2. Parse and Validate Request Payload
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return sendJson(res, 400, {
        error: 'Malformed JSON payload.',
        code: 'INVALID_JSON',
      });
    }
  }
  body = body || {};

  const studentName = (body.studentName || '').trim();
  const projectTitle = (body.projectTitle || '').trim();
  const techStack = (body.techStack || '').trim();
  const resumeBullets = Array.isArray(body.resumeBullets)
    ? body.resumeBullets.map((b) => String(b).trim()).filter(Boolean)
    : [];
  const githubLink = (body.githubLink || '').trim();

  if (!studentName || !projectTitle) {
    return sendJson(res, 400, {
      error: 'Student name and project title are required fields.',
      code: 'MISSING_REQUIRED_FIELDS',
    });
  }

  // 3. Construct Gemini Prompt adhering to audit rubric
  const prompt = buildAuditPrompt({
    studentName,
    projectTitle,
    techStack,
    resumeBullets,
    githubLink,
  });

  const requestPayload = {
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

  // 4. Execute Gemini REST API Call
  let geminiRes;
  try {
    geminiRes = await fetch(
      `${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey.trim())}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      },
    );
  } catch (err) {
    return sendJson(res, 502, {
      error: 'Network connection failed while reaching Gemini API servers.',
      code: 'NETWORK_ERROR',
    });
  }

  // 5. Handle HTTP Status Codes from Gemini
  if (!geminiRes.ok) {
    const status = geminiRes.status;
    if (status === 401 || status === 403) {
      return sendJson(res, 403, {
        error: 'Invalid or unauthorized Gemini API key configured on the server.',
        code: 'INVALID_API_KEY',
      });
    }
    if (status === 404) {
      return sendJson(res, 404, {
        error: 'Gemini 3.8 Flash model endpoint was not found.',
        code: 'MODEL_NOT_FOUND',
      });
    }
    if (status === 429) {
      return sendJson(res, 429, {
        error: 'Gemini API rate limit exceeded. Please wait a moment before trying again.',
        code: 'RATE_LIMITED',
      });
    }
    if (status >= 500) {
      return sendJson(res, 503, {
        error: 'Gemini API servers are temporarily experiencing high load. Please try again shortly.',
        code: 'GEMINI_SERVER_ERROR',
      });
    }
    return sendJson(res, status, {
      error: `Gemini API returned HTTP status ${status}.`,
      code: 'GEMINI_API_ERROR',
    });
  }

  // 6. Parse Gemini JSON Output
  let geminiJson;
  try {
    geminiJson = await geminiRes.json();
  } catch {
    return sendJson(res, 502, {
      error: 'Gemini API returned an invalid non-JSON response.',
      code: 'MALFORMED_RESPONSE',
    });
  }

  // 7. Check Safety Filtering & Content Structure
  const candidates = geminiJson?.candidates;
  if (!candidates || candidates.length === 0) {
    const blockReason = geminiJson?.promptFeedback?.blockReason;
    return sendJson(res, 400, {
      error: `The audit submission was filtered by content safety policies (${blockReason || 'SAFETY'}).`,
      code: 'SAFETY_BLOCKED',
    });
  }

  const candidate = candidates[0];
  if (candidate.finishReason === 'SAFETY') {
    return sendJson(res, 400, {
      error: 'The generated audit was blocked by content safety filters.',
      code: 'SAFETY_BLOCKED',
    });
  }

  const parts = candidate?.content?.parts;
  if (!parts || parts.length === 0 || !parts[0].text) {
    return sendJson(res, 502, {
      error: 'Gemini returned an empty candidate response.',
      code: 'MALFORMED_RESPONSE',
    });
  }

  const rawText = parts.map((p) => p.text || '').join('').trim();
  const cleanJsonText = stripCodeFences(rawText);

  let parsedOutput;
  try {
    parsedOutput = JSON.parse(cleanJsonText);
  } catch {
    return sendJson(res, 502, {
      error: 'Gemini response could not be parsed as valid JSON.',
      code: 'MALFORMED_RESPONSE',
    });
  }

  // 8. Normalize & Format Response matching both required schemas
  const normalized = normalizeAuditResponse(parsedOutput, {
    studentName,
    projectTitle,
    techStack,
    resumeBullets,
  });

  return sendJson(res, 200, normalized);
}

/**
 * Sends JSON HTTP response safely across environments.
 */
function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  return res.end(JSON.stringify(data));
}

/**
 * Builds the technical audit prompt sent to Gemini.
 */
function buildAuditPrompt({ studentName, projectTitle, techStack, resumeBullets, githubLink }) {
  const bulletsText =
    resumeBullets.length > 0
      ? resumeBullets.map((b, i) => `  ${i + 1}. "${b}"`).join('\n')
      : '  (No resume bullets provided)';

  const githubText = githubLink ? `\nGitHub Link: ${githubLink}` : '\nGitHub Link: (not provided)';

  return `You are an expert engineering hiring manager and technical resume auditor evaluating a software engineering candidate's project.

AUDIT RUBRIC:
1. Technical Project Quality: Architectural depth, modular design, and technical complexity.
2. Technical Skill / Stack Relevance: Cohesion between selected technologies and problem domain.
3. Resume Bullet Quality: Active verbs, architectural clarity, and verifiable evidence.
4. ATS Keyword / Role Relevance: Presence of standard industry frameworks and recruiter keywords.
5. Clarity & Professionalism: Objective, concise documentation free of fluffy marketing claims.
6. Evidence / Impact: Grounded technical outcomes without fabricating unverified metrics.

CRITICAL RULES:
- NEVER invent or fabricate metrics, technologies, responsibilities, achievements, users, deployment claims, or business impact not present in the input.
- Evaluate two distinct benchmark scores:
  * "overallScore" (0-100): Engineering complexity, architectural cohesion, and technical depth.
  * "atsScore" (0-100): ATS parser readiness, keyword density, and quantifiable evidence strength.
- "scoreLabel": "Strong" (80-100), "Proficient" (65-79), or "Developing" (<65).
- If bullets are provided, rewrite each one to replace passive verbs ("helped", "worked on", "built") with high-impact engineering verbs, integrating technical context without fabricating unverifiable numbers.

SUBMISSION DETAILS:
Candidate Name: ${studentName}
Project Title: ${projectTitle}
Tech Stack: ${techStack || '(not specified)'}
Current Resume Bullets:
${bulletsText}${githubText}

RESPOND WITH ONLY A STRICT JSON OBJECT MATCHING THIS EXACT SCHEMA:
{
  "overallScore": <integer 0-100>,
  "scoreLabel": "<Strong | Proficient | Developing>",
  "atsScore": <integer 0-100>,
  "verdict": "<concise 1-2 sentence executive assessment of project and resume readiness>",
  "dimensions": {
    "technicalDepth": <integer 0-100>,
    "bulletImpact": <integer 0-100>,
    "atsAlignment": <integer 0-100>
  },
  "strengths": ["<concise strength 1>", "<concise strength 2>"],
  "improvements": ["<actionable improvement 1>", "<actionable improvement 2>"],
  "optimizedBullets": ["<audited bullet 1>", "<audited bullet 2>"],
  "atsKeywords": ["<detected or recommended keyword 1>", "<keyword 2>", "<keyword 3>"],
  "atsSummary": "<brief technical explanation of ATS keyword and parser compatibility>",
  "bulletRewrites": [
    {
      "original": "<original bullet text>",
      "improved": "<audited bullet text>",
      "rationale": "<brief explanation of change>"
    }
  ]
}`;
}

/**
 * Strips markdown code fences from JSON output.
 */
function stripCodeFences(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?```\s*$/i, '');
  if (cleaned.includes('```')) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];
  }
  return cleaned.trim();
}

/**
 * Normalizes output ensuring all required fields from Requirement 9
 * and rich UI fields are present and safe.
 */
function normalizeAuditResponse(data, context) {
  let overallScore = parseInt(data.overallScore, 10);
  if (isNaN(overallScore)) overallScore = 75;
  overallScore = Math.max(0, Math.min(100, overallScore));

  let atsScore = parseInt(data.atsScore, 10);
  if (isNaN(atsScore)) atsScore = Math.max(0, Math.min(100, Math.round(overallScore * 0.92)));
  atsScore = Math.max(0, Math.min(100, atsScore));

  const scoreLabel =
    typeof data.scoreLabel === 'string' && data.scoreLabel.trim()
      ? data.scoreLabel.trim()
      : overallScore >= 80
      ? 'Strong'
      : overallScore >= 65
      ? 'Proficient'
      : 'Developing';

  const verdict =
    typeof data.verdict === 'string' && data.verdict.trim()
      ? data.verdict.trim()
      : 'Solid technical baseline. Strengthening bullet evidence and incorporating domain keywords will maximize recruiter engagement.';

  const dims = data.dimensions || {};
  const dimensions = {
    technicalDepth: clamp(dims.technicalDepth, Math.round(overallScore * 0.96)),
    bulletImpact: clamp(dims.bulletImpact, Math.round(atsScore * 0.94)),
    atsAlignment: clamp(dims.atsAlignment, atsScore),
  };

  // Strengths (array of strings)
  const strengths = [];
  if (Array.isArray(data.strengths)) {
    data.strengths.forEach((s) => {
      if (typeof s === 'string' && s.trim()) strengths.push(s.trim());
      else if (s && typeof s === 'object' && s.text) strengths.push(s.text.trim());
    });
  }
  while (strengths.length < 2) {
    strengths.push('Demonstrates practical, applied software engineering skills.');
  }

  // Improvements (array of strings)
  const improvements = [];
  if (Array.isArray(data.improvements)) {
    data.improvements.forEach((imp) => {
      if (typeof imp === 'string' && imp.trim()) improvements.push(imp.trim());
      else if (imp && typeof imp === 'object' && imp.text) improvements.push(imp.text.trim());
    });
  }
  while (improvements.length < 2) {
    improvements.push('Add verifiable benchmarks or dataset scale where genuine metrics exist.');
  }

  // Optimized bullets (array of strings)
  const optimizedBullets = [];
  if (Array.isArray(data.optimizedBullets)) {
    data.optimizedBullets.forEach((b) => {
      if (typeof b === 'string' && b.trim()) optimizedBullets.push(b.trim());
      else if (b && typeof b === 'object' && b.improved) optimizedBullets.push(b.improved.trim());
    });
  }
  if (optimizedBullets.length === 0 && Array.isArray(data.bulletRewrites)) {
    data.bulletRewrites.forEach((rw) => {
      if (rw && rw.improved) optimizedBullets.push(rw.improved.trim());
    });
  }
  if (optimizedBullets.length === 0) {
    optimizedBullets.push(
      `Architected ${context.projectTitle} implementing modular components and structured data persistence.`,
    );
  }

  // Bullet rewrites (array of { original, improved, rationale })
  const bulletRewrites = [];
  if (Array.isArray(data.bulletRewrites) && data.bulletRewrites.length > 0) {
    data.bulletRewrites.forEach((rw, idx) => {
      if (rw && typeof rw === 'object') {
        bulletRewrites.push({
          original: rw.original || (context.resumeBullets[idx] || ''),
          improved: rw.improved || (optimizedBullets[idx] || ''),
          rationale: rw.rationale || 'Action-oriented engineering rewrite.',
        });
      }
    });
  } else {
    optimizedBullets.forEach((opt, idx) => {
      bulletRewrites.push({
        original: context.resumeBullets[idx] || '',
        improved: opt,
        rationale: 'Action-oriented engineering rewrite.',
      });
    });
  }

  // ATS Keywords & Summary
  const atsKeywords = [];
  if (Array.isArray(data.atsKeywords)) {
    data.atsKeywords.forEach((kw) => {
      if (typeof kw === 'string' && kw.trim()) atsKeywords.push(kw.trim());
    });
  }
  if (atsKeywords.length === 0 && data.atsAnalysis?.detectedKeywords) {
    data.atsAnalysis.detectedKeywords.forEach((kw) => {
      if (typeof kw === 'string' && kw.trim()) atsKeywords.push(kw.trim());
    });
  }
  if (atsKeywords.length === 0) {
    atsKeywords.push('Web Development', 'API Design', 'System Architecture');
  }

  const atsSummary =
    typeof data.atsSummary === 'string' && data.atsSummary.trim()
      ? data.atsSummary.trim()
      : typeof data.atsAnalysis?.screeningNote === 'string' && data.atsAnalysis.screeningNote.trim()
      ? data.atsAnalysis.screeningNote.trim()
      : 'Applicant Tracking Systems filter resumes based on specific framework keywords, active verbs, and testing practices.';

  const atsAnalysis = {
    detectedKeywords: atsKeywords,
    recommendedKeywords: Array.isArray(data.atsAnalysis?.recommendedKeywords)
      ? data.atsAnalysis.recommendedKeywords
      : ['Unit Testing', 'CI/CD Pipelines', 'Performance Optimization'],
    screeningNote: atsSummary,
  };

  return {
    overallScore,
    scoreLabel,
    atsScore,
    verdict,
    dimensions,
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
    optimizedBullets,
    atsKeywords,
    atsSummary,
    atsAnalysis,
    bulletRewrites,
  };
}

function clamp(val, fallback) {
  const num = parseInt(val, 10);
  if (isNaN(num)) return fallback;
  return Math.max(0, Math.min(100, num));
}

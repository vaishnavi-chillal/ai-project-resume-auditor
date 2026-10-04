# AI Project & Resume Auditor

A technical evaluation instrument for engineering students and software developers. The auditor analyzes project specifications, technical stack choices, and resume bullet points to deliver an objective evaluation of architectural depth, recruiter-facing impact evidence, and ATS readiness.

## Overview

Recruiters and hiring managers spend seconds scanning project sections. Most student project descriptions either understate their technical contributions or lack the quantifiable evidence needed to pass initial automated screening.

This auditor evaluates submissions across three core dimensions:

1. **Project Scope & Architecture** — Evaluates technical depth, stack cohesion, and architectural complexity.
2. **Recruiter Evidence & Impact** — Audits resume bullet points for quantifiable outcomes, strong action verbs, and technical credibility.
3. **ATS & Keyword Readiness** — Diagnoses keyword alignment with industry expectations and automated screening parser compatibility.

## Core Features

- **Dual-Benchmark Scoring**: Generates an Overall Technical Score alongside a dedicated ATS Readiness Score.
- **Dimensional Breakdown**: Granular metrics across Technical Depth, Bullet Impact, and ATS Keyword Alignment.
- **Recruiter & ATS Keyword Diagnostics**: Identifies detected technical keywords and suggests high-signal domain keywords commonly screened by applicant tracking systems.
- **Actionable Bullet Rewrites**: Structured before-and-after bullet rewrites replacing passive descriptions with measurable, action-oriented engineering statements.
- **Dual Execution Modes**:
  - **Live Gemini Mode**: Connects directly to Google's `gemini-3.8-flash` model via user-supplied API key.
  - **Offline Demo Mode**: Runs deterministic local evaluation rules with contextual sample data when no API key is provided.
- **One-Click Sample Loader**: Prefills realistic project data for fast demonstrations and testing.
- **Private & Client-Side**: No backend database; API keys and project inputs are processed directly in-browser.

## Project Structure

```
├── package.json          Root script delegation
└── project/
    ├── index.html        Semantic HTML structure and audit dashboard
    ├── style.css         Design system, component tokens, and animations
    ├── main.js           Application entry point and event orchestration
    ├── form.js           Input validation and sample project prefilling
    ├── gemini.js         Gemini API integration, schema validation, and demo engine
    ├── audit.js          Dashboard rendering, dual gauges, and clipboard logic
    ├── package.json      Project dependencies and build scripts
    └── public/
        └── favicon.svg   Custom audit instrument favicon
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm

### Installation & Development

```bash
# Install dependencies
npm --prefix project install

# Start the local development server
npm run dev
```

Open your browser to `http://localhost:5173/`.

### Production Build

```bash
# Build the optimized production bundle
npm run build

# Preview the production build locally
npm run preview
```

## Security & API Key Usage

This application runs client-side. When an API key is entered, requests are transmitted directly from your browser to Google's Generative Language API. API keys are never cached in persistent browser storage (`localStorage` or `cookies`) and clear upon page reload.

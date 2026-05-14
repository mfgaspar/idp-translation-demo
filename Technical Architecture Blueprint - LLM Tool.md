Technical Architecture Blueprint — LLM Translation Tool

Below is an **enterprise‑grade, LLM‑based, cloud‑agnostic technical architecture blueprint** for the CMC Translation Tool, aligned to what’s been raised in the CMC-facing requirement questions: **processing PDFs/images, logging/monitoring, strict storage constraints, audit evidence retention, PII/legal constraints, where the agent runs (container/internal compute), and (potentially) SSO/2FA**. 

***

# Technical Architecture Blueprint — Cloud‑Agnostic LLM Translation Tool (Enterprise‑Grade)

## 1) Architectural Goals (mapped to requirements)

**G1 — Process documents (PDF/images) via an “agent”** and return **extracted text + translated text + metadata (language/confidence/timestamp) + errors.**\
**G2 — Human review supported** and the UI shows **original document** plus **side‑by‑side extracted vs translated text** (your added requirement).\
**G3 — Auditability**: retain **input reference, translation output, agent/model metadata** (and logs).\
**G4 — Compliance & data controls**: enforce restrictions on **temporary storage / in‑memory processing / persistence** and address **PII/legal requirements**.\
**G5 — Cloud agnostic deployment**: runnable as **containerised service / internal compute**.\
**G6 — Operational throughput** driven by current BAU: **20–30 new cases/day** with current manual translation contributing to **10–20 min/case**. 

***

## 2) High‑Level Logical Architecture

### 2.1 Component Diagram (logical)

flowchart LR
  U[CMC User] --> UI[Reviewer Web UI]
  UI --> API[API Gateway and BFF]

  API --> AUTH[Identity and Access Integration]
  API --> ORCH[Workflow Orchestrator]

  ORCH --> ING[Ingestion Service]
  ORCH --> EXT[Document Extraction Service]
  ORCH --> TRN[LLM Translation Service]
  ORCH --> QAS[Quality and Confidence Service]
  ORCH --> AUD[Audit and Evidence Service]

  ING --> DOC[Controlled Document Store]
  EXT --> SEG[Controlled Segment Store]
  TRN --> SEG
  QAS --> SEG

  ORCH --> OBS[Observability Collector]
  API --> OBS
  AUD --> OBS

  POL[Policy Engine] --> ING
  POL --> EXT
  POL --> TRN
  POL --> AUD

  KMS[Key Management and Secrets] --> DOC
  KMS --> SEG
  KMS --> AUD

  Notes (why these boxes exist)

CMC asked for logging/monitoring requirements for agent activity → Observability Collector. 
CMC asked whether documents (images, PDFs) can be passed to the agent → Extraction + Translation services. 
CMC asked about restrictions on temporary storage / in-memory / persisting extracted text & translations → Policy Engine + Controlled Stores. 
CMC asked what must be retained for audit (input reference, translation output, agent/model metadata) → Audit and Evidence Service. 
CMC asked about SSO and 2FA → Identity and Access Integration. 



## 3) Reference Deployment Topology (Cloud‑Agnostic)

### 3.1 Recommended runtime

*   **Kubernetes** (or equivalent container orchestration) hosting stateless services: UI, API/BFF, Orchestrator, Extraction, Translation, Audit, Policy, Observability agents.\
    This matches the requirement to run in **containerised service / internal compute**. 

### 3.2 Pluggable infrastructure primitives (no cloud lock‑in)

Implement via abstraction interfaces so each can map to: on‑prem, AWS, Azure, GCP, private cloud:

*   **Object Storage** (documents, redacted originals, render artifacts)
*   **Database** (case metadata, segment index, reviewer actions)
*   **Queue/Event Bus** (async jobs for OCR/LLM)
*   **Secrets/KMS** (keys, credentials)
*   **Logging/Tracing backend** (SIEM integration where needed)

> This blueprint stays cloud‑agnostic by treating these as *capabilities*, not vendor services.

***

## 4) Data Flow (end‑to‑end)

### 4.1 Sequence (happy path)




## 5) Core Services (what each does)

### 5.1 Web UI / Reviewer Workspace

**Purpose:** meet your UX requirement: show original doc + side‑by‑side extracted vs translated text; enable human review.\
Key capabilities:

*   Document viewer (PDF/image) + page navigation
*   Segment overlay highlighting (bbox) and alignment list
*   Confidence flags (low confidence) and reviewer actions (approve/edit/reject)
*   Evidence export trigger (optional, policy controlled)

### 5.2 API Gateway / BFF (Backend‑for‑Frontend)

**Purpose:** secure boundary, SSO integration point, consistent API for UI + integrations.\
Supports:

*   AuthN/AuthZ hooks for **SSO/2FA** (TBD per CMC). 
*   Rate limiting, request validation, content‑type controls

### 5.3 Workflow Orchestrator

**Purpose:** coordinate long-running OCR/LLM steps; provide idempotency and retries.\
Why: enterprise reliability + audit steps + async processing.

### 5.4 Ingestion Service

**Purpose:** accept docs, compute hashes, store references, enforce size/type checks.\
Must support PDFs/images as per requirement questions. 

### 5.5 Document Extraction Service (OCR + Parsing)

**Purpose:** turn PDF/image into text segments with coordinates.

*   Output: segments with `page`, `bbox`, `extracted_text`\
    This is required because CMC asked if images/PDFs can be passed to agent and expects extracted text output. 

### 5.6 LLM Translation Service (Provider‑Agnostic)

**Purpose:** translate segments using an LLM with pluggable connectors.

*   Connector interface examples:
    *   “Local model runtime” (on‑prem inference)
    *   “Private endpoint model API” (cloud but private)
*   Must return model metadata for audit: model id/version, prompt template id, inference params. 

### 5.7 Quality & Confidence Service

**Purpose:** compute translation confidence and provide review flags.\
CMC explicitly asked about quality score/thresholds and metadata including confidence.\
Implementation note (suggestion, not sourced): confidence can be derived from LLM self‑rating + consistency checks + language detection agreement. 

### 5.8 Audit & Evidence Service (Immutable)

**Purpose:** write tamper‑evident logs and evidence bundles:

*   Required retention items: input reference, translation output, agent/model metadata. 
*   Append‑only log model; supports export for audits.

### 5.9 Policy Engine (Data handling + model governance)

**Purpose:** enforce constraints CMC asked about:

*   temporary storage rules
*   in‑memory processing restrictions
*   persistence rules for extracted text/translations
*   PII/legal handling responsibilities\
    Also enforces model allowlists and blocks unapproved egress routes (enterprise governance). 

***

## 6) Security, Privacy, and Compliance Blueprint

### 6.1 Identity & Access

*   Integrate with CMC IdP for **SSO/2FA** (explicit question in requirements). 
*   Role‑based access (Operator/Reviewer/Auditor/Admin)
*   Least privilege service identities for internal components

### 6.2 Data Residency / “within CMC environments”

Design to keep all workloads and data inside CMC boundary (network + storage), consistent with the assumption stated. 

*   Private networking only; restrict outbound internet egress from translation service unless explicitly allowed.

### 6.3 PII handling

CMC asked who handles PII and legal requirements.\
Blueprint supports either model: 

*   **Option A (CMC-controlled):** CMC provides redacted inputs; tool treats documents as already compliant. (Matches “redacted sample docs” referenced.)
*   **Option B (tool-assisted):** add an internal redaction/pre‑processing step before LLM translation. *(Recommendation; still within CMC boundary.)*

### 6.4 Encryption & secrets

*   Encrypt at rest (documents, segments, audit logs) using KMS
*   Encrypt in transit (mTLS between services)

### 6.5 Audit controls

*   Every action produces an audit event:
    *   ingestion, extraction, translation, reviewer actions, export
*   Evidence retains model metadata as requested. 

***

## 7) Observability & Operations (Enterprise-grade)

CMC explicitly asked about **logging / monitoring requirements** for agent activity.\
Blueprint includes: 

*   **Structured logs** (case\_id correlation, component, action, outcome)
*   **Metrics** (queue depth, latency per stage, OCR failures, LLM errors, reviewer turnaround)
*   **Distributed tracing** (per case workflow)
*   **Alerting** (SLO breaches, error spikes, stalled workflows)
*   **SIEM integration** for security events (auth failures, privilege errors, blocked egress)

***

## 8) Storage & Retention Controls (Policy-driven)

Because CMC asked about restrictions on temporary storage / in-memory processing / persisting extracted text/translations, storage is **policy-controlled** everywhere. 

### 8.1 Storage classes

*   **Transient scratch**: in‑memory or tmpfs, TTL minutes
*   **Working store**: TTL hours/days
*   **Evidence vault**: retention per audit policy (TBD by CMC)

### 8.2 Data minimization by design

*   Store only pointers/hashes unless explicitly allowed to persist content
*   Segment store can be configured as “no‑persist” (generate on demand) if required.

***

## 9) Scaling & Performance Considerations (grounded)

Input workload: **20–30 new cases/day** currently; system should support bursty intake and asynchronous processing.\
Blueprint scaling mechanisms:

*   Async queues between ingestion → extraction → translation
*   Horizontal scaling on extraction and translation workers
*   Backpressure when model capacity is constrained\
    *(Latency targets remain TBD because they are not specified in the accessible requirements.)* 

***

## 10) Integration Surfaces (API blueprint)

CMC asked “Where do we need to integrate (input/output)?” and “Any system where translated documents should be saved/exported to?” 

### 10.1 Core APIs (examples)

*   `POST /cases` — create case
*   `POST /cases/{id}/documents` — upload doc / provide reference
*   `GET /cases/{id}` — status + summary metadata
*   `GET /cases/{id}/viewer` — original render + segments + translations
*   `POST /cases/{id}/review` — approve/edit/reject with comments
*   `GET /cases/{id}/evidence` — export evidence bundle (policy-controlled)

### 10.2 Future integration adapters (Phase 2+)

*   “Inbound adapter” for upstream systems (e.g., case management)
*   “Outbound adapter” for archiving systems (audit store / evidence repository)\
    (Exact systems are TBD per requirements questions.) 

***

## 11) Implementation Notes (LLM enterprise patterns) — *Recommendations*

*(These are suggestions to make the system robust; not claimed as CMC requirements.)*

*   Prompt templates versioned and stored (for reproducibility in audits)
*   Model version pinning (audit traceability)
*   Offline evaluation harness on redacted samples to validate translation quality (ties to “tool will need to be tested for accuracy”). 

***

# Deliverable Snapshot (what you can paste into a solution deck)

**“We propose a cloud-agnostic, containerised translation platform running inside CMC environments. It ingests PDFs/images, extracts text, translates using a pluggable LLM layer, produces confidence + metadata, and provides a reviewer UI that shows the original document with side-by-side extracted vs translated text. The platform includes policy-driven storage controls, enterprise observability, and an immutable audit/evidence vault retaining input references, translation outputs, and model metadata.”** 

***

## One quick follow-up (strictly to bind to concrete design choices)

Do you want the **LLM runtime** to be **(A) fully on‑prem/local inference** or **(B) private endpoint to a managed model service**, assuming data stays within CMC boundaries? 

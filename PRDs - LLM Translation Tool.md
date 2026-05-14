PRD — Cloud‑Agnostic LLM Translation Tool for CMC Markets (Bermuda BAU)
Document status: Draft v1.0 (LLM-first, cloud-agnostic)
Primary stakeholders: CMC Markets Cash Ops / Payments Ops; Hitachi delivery team
Source threads: CMC, Re: CMC x Hitachi - Bermuda Crypto Wallet & Bank account linkages, Translation Solution for CMC Market 

1) Problem Statement / Background
CMC’s Bermuda BAU verification process currently requires manual translation of documents, contributing to 10–20 minutes per case and ~20–30 new cases per day. 
CMC requested that the Hitachi/WNS partnership assess the technical feasibility to perform equivalent tasks as part of the global transition. 
Documents may be fully or partially non‑English and include Chinese and potentially other languages. 
CMC shared process flow and sample documents (with client personal information redacted) and a verification document sample. 

2) Goals & Success Criteria
2.1 Goals (What success looks like)

Reduce time per case by eliminating most manual translation effort while keeping human verification where required. 
Provide an AI translation utility that supports document processing (PDF/images) and returns extracted text + translated text + metadata. 
Provide auditability and evidence retention (input reference, outputs, model/agent metadata). 
Respect data handling constraints (temporary storage, in‑memory processing, persistence restrictions) and PII/legal constraints. 
Be deployable where CMC allows (e.g., containerised service / internal compute) and remain cloud‑provider agnostic (design choice requested). 

2.2 Non-goals (Explicitly out of scope for v1 / Phase 1)

Deep integration into downstream systems (e.g., Pega/Bermuda) is treated as a later phase in your discussions. 
Any “people solution” staffing plan is out of scope of this PRD (this PRD is for the technology tool), though CMC indicated they may consider tech or people solutions. 


3) Users & Personas

CMC Payments/Cash Ops Operator — processes Bermuda BAU verification cases; needs quick, reliable translations and evidence for review. 
CMC Reviewer / Approver — validates translation adequacy and signs off on decisions; needs traceability and audit logs. 
CMC Compliance / Audit Stakeholder — requires evidence retention, model metadata, and adherence to PII/legal requirements. 
IT / Platform Owner (CMC) — cares about deployment constraints (where agent can run), authentication, monitoring, storage rules. 


4) Primary Use Cases (MVP)
UC‑1: Translate a document (PDF/image) for Bermuda verification

Operator uploads or submits a PDF/image and receives extracted + translated text and metadata. 

UC‑2: Validate translation against original document (NEW requirement)

Operator/reviewer views the original document and a side‑by‑side alignment of extracted source text vs translated text (with navigation/highlighting). (User requirement — added by you; not from email sources.)

UC‑3: Produce audit evidence package

For a case, system must retain input reference, translation outputs, and agent/model metadata for audit/evidence. 

UC‑4: Support “equivalent tasks” feasibility with structured outputs

Provide outputs that can be used to support the process (e.g., extracted address fields, translation, etc.) as part of feasibility to replicate tasks. , 


5) End-to-End Workflow (MVP)

Ingest document (PDF/JPG/PNG). 
Render original document in viewer (PDF/image). (User requirement)
Extract text (OCR as needed) into segments/blocks. 
Translate via LLM (cloud-agnostic model integration). (Design choice requested by you)
Produce metadata: detected language, confidence, timestamp, errors. 
Review UI: side-by-side extracted vs translated, with highlight/scroll sync. (User requirement)
Human validation (approve/edit/flag). 
Export / persist evidence per retention rules and restrictions. 


6) Functional Requirements (FR)
FR‑1 Document ingestion & supported formats

The tool must accept document inputs including PDF and images (JPG/JPEG/PNG). 
The tool must support documents that are fully or partially non‑English. 

FR‑2 Original document display (NEW)

The tool must display the original document (PDF viewer / image viewer). (User requirement)
The viewer must support multi‑page navigation for PDFs. (User requirement)

FR‑3 Text extraction (OCR + parsing)

The tool must be able to accept images/PDFs passed to an agent for processing, implying OCR/extraction capability. 
The tool must return extracted text as part of the minimal response. 

FR‑4 Translation (LLM-based; cloud-agnostic)

The tool must translate extracted content into English (translation requirement is central to the request; languages mentioned include Chinese/Vietnamese/Spanish in your questions, while CMC stated Chinese and other languages may appear). , 
The translation component must be model/provider pluggable to remain cloud-agnostic. (Design choice requested by you)

FR‑5 Side-by-side alignment: extracted vs translated (NEW)

After translation, the tool must present extracted original text against translated text, side‑by‑side. (User requirement)
The tool should maintain segment-level alignment (block/paragraph/field) between extracted text and translation to support validation. (User requirement)

FR‑6 Metadata & error handling

The minimal response must include metadata (language, confidence, timestamp) and error handling expectations. 
The tool must provide a confidence indicator per translated segment and/or per document. , 

FR‑7 Human-in-the-loop validation

The tool must support human approval for machine-assisted translation as part of the workflow. 
The tool must allow reviewers to approve, reject, and (optionally) edit translated text. (Editability is a product requirement implied by human validation; not explicitly stated in email — treat as design choice.)

FR‑8 Audit evidence capture (critical)

The tool must retain for audit:

Input reference
Translation output
Agent/model metadata 



FR‑9 Logging & monitoring (agent activity)

The tool must provide logging/monitoring for agent activity. 

FR‑10 Storage controls / restrictions

The tool must comply with restrictions on:

temporary storage
in-memory processing
persisting extracted text/translations 



FR‑11 Deployment location / runtime constraints

The tool must be deployable where the agent can run (examples raised: containerised service, internal compute). 
The tool must be cloud-provider agnostic. (Design requirement requested by you.)

FR‑12 Output interfaces (integration readiness)

The tool must define input/output integration points (even if not implemented in Phase 1). 


7) Non-Functional Requirements (NFR)
NFR‑1 Security: authentication & access

The tool must support SSO and 2FA if required by CMC and align to CMC identity systems. 

NFR‑2 Data residency / “data stays within CMC”

The solution must align with the assumption/requirement that data stays fully within CMC environments. 

NFR‑3 Privacy / PII / legal compliance

The tool must comply with PII/legal requirements, including clarifying whether CMC provides controls or the agent must strip/handle PII. 

NFR‑4 Auditability & evidence retention

The tool must provide “full audit controls” style evidence:

who processed what
what outputs were generated
model/agent metadata retained for traceability 



NFR‑5 Observability

Logging and monitoring must be sufficient to answer:

what the agent did
when it did it
whether it failed, and why 



NFR‑6 Performance (throughput driver)

The tool must support operational throughput implied by 20–30 new cases per day (and current manual cycle time driver). 
(Exact latency/SLO targets are not defined in the emails and remain an open item.)  

NFR‑7 Cloud/provider neutrality

The solution must not hard-depend on a single cloud provider service for translation (LLM pluggability + container deployment). (Design requirement requested by you.)


8) UI/UX Requirements (High-value “push further”)
These are designed to maximize reviewer speed and auditability (and are consistent with the audit + human validation needs raised). 
UX‑1 Document viewer + alignment workspace (NEW + expanded)

Three-pane layout recommended:

Original document viewer
Extracted text segments
Translated text segments
(User requirement + recommended implementation pattern.)



UX‑2 Segment mapping & highlighting

Selecting a region/segment should highlight corresponding extracted + translated segments for fast validation. (Recommended; supports human review requirement.) 

UX‑3 Confidence-driven triage

Visual flags for low-confidence segments to focus human review effort where it matters. , 

UX‑4 Evidence export

“Case evidence bundle” export that includes:

original doc reference
extracted text
translated text
metadata + audit trail
(Recommended; supports audit retention requirement.) 




9) Data Model (Logical)
Minimum persisted (subject to CMC storage restrictions). 
JSON{  "case_id": "string",  "input_reference": {    "type": "pdf|image|text",    "uri_or_id": "string",    "hash": "string"  },  "document_pages": [    {      "page_number": 1,      "render_reference": "string"    }  ],  "segments": [    {      "segment_id": "string",      "page_number": 1,      "bbox": [x, y, w, h],      "extracted_text": "string",      "translated_text": "string",      "detected_language": "string",      "confidence": 0.0,      "status": "auto|needs_review|approved|edited|rejected"    }  ],  "processing_metadata": {    "timestamp": "ISO-8601",    "agent_id": "string",    "model_id": "string",    "model_version": "string",    "errors": []  },  "audit_trail": [    {      "actor": "user|system",      "action": "ingest|translate|approve|edit|export",      "timestamp": "ISO-8601",      "details": {}    }  ]}Show more lines
(Fields reflect the required outputs: extracted text, translated text, metadata + audit retention needs; actual persistence must follow storage restrictions.) 

10) “Push Further” — High-Value Capabilities (Roadmap aligned to your thread)
These go beyond the MVP but are explicitly aligned with the phased thinking captured in the thread. , 
10.1 Phase 1 (MVP focus)

Translate and extract from Binance screenshots (Chinese/Vietnamese) and bank statement address extraction. , 
Auto-fill a verification template using extracted fields. , 
Human review remains mandatory. 

10.2 Phase 2 (Scale + accuracy)

Add Spanish and other supported languages. 
Train custom extraction per “document family” (templates/variants). 
Add confidence-driven straight-through approval only for simplest, highest-confidence cases. 

10.3 Phase 3 (Operational intelligence + continuous improvement)

Analytics on mismatch rates, reviewer overrides, document fraud indicators. 
Feedback loop to improve prompts and extraction models. 

Additional “High Value” extensions (recommended, not explicitly requested by CMC)
These are consistent with CMC’s audit + compliance posture but not explicitly stated in the emails:

Audit Mode UI: immutable “before/after” diff for edits; reviewer signature capture. (Recommended)
Redaction pipeline: optional PII masking pre-LLM to minimize exposure. (Recommended; supports PII concerns.) 
Evaluation harness: regression tests on a fixed set of redacted sample docs to prevent accuracy degradation. (Recommended; supports “tool needs to be tested for accuracy”.) 
Model governance: per-model allowlist, version pinning, and change management logs. (Recommended; supports auditability.) 


11) Open Questions / Decisions Required (explicitly raised)
These are the exact gaps your team asked to clarify and should be tracked as PRD “TBDs”:

Scope confirmation: translation-only vs integration (Phase 1 vs later). , 
Document variance: how many structural variants of Binance screenshots exist. 
Quality scoring: required thresholds for translation acceptance. , 
Auth requirements: SSO/2FA specifics and identity provider details. , 
Where agent runs: containerised vs internal compute constraints. 
Storage restrictions: temporary storage/in-memory/persistence rules for extracted text/translations. 
PII/legal: who provides PII controls vs agent responsibilities. 
Audit retention: what must be retained, where, and for how long. 
Output destination: where translated docs/results should be saved/exported. 


12) Acceptance Criteria (MVP)

Given a PDF/image document, when the user submits it, then the system returns extracted text + translated text + metadata (language, confidence, timestamp) and handles errors gracefully. 
The UI displays the original document and shows extracted vs translated text side-by-side with segment mapping. (User requirement.)
The system logs agent activity and retains required audit evidence: input reference, translation output, agent/model metadata. 
The system supports human validation (approve/review flow) consistent with the human-approval question and “human review remains mandatory” guidance. 
The system adheres to storage handling constraints and does not persist data beyond configured policies. 
Deployment is feasible in containerised/internal compute environments (cloud-agnostic design). 


13) What I can do next (immediately useful)
If you want to operationalize this PRD into delivery artifacts, I can generate in the next message (no extra searching needed):

Epics → user stories → acceptance criteria aligned to Phase 1/2/3 (including the side-by-side UI). 
A test plan for “accuracy needs to be tested” with a scoring rubric, confidence thresholds, and reviewer workflow. 
A demo script tailored to the “show & tell” expectation and the CMC throughput context (20–30 cases/day). 

If you tell me which of the three you prefer, I’ll produce it as a ready-to-use document.
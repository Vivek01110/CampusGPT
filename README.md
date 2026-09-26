# AskCampusAi — AI-Powered University Campus Assistant

AskCampusAi is a production-oriented AI-powered University and Campus Assistant platform designed to provide students with reliable, official, and grounded information regarding university regulations, course catalogs, academic deadlines, hostel rules, and examination policies.

> **Project Phase Status**: **PHASE 7 (NIT KKR 2025–26 Document Crawler & Automated Ingestion)**  
> Complete detailed phase specs are documented in:
> - [docs/phases/PHASE_1.md](docs/phases/PHASE_1.md) — Foundation & Authentication
> - [docs/phases/PHASE_2.md](docs/phases/PHASE_2.md) — Document Ingestion & Basic RAG Pipeline
> - [docs/phases/PHASE_3.md](docs/phases/PHASE_3.md) — Advanced Hybrid Retrieval, BM25, RRF & Reranking
> - [docs/phases/PHASE_4.md](docs/phases/PHASE_4.md) — Redis Caching, Semantic Caching & Rate Limiting
> - [docs/phases/PHASE_6.md](docs/phases/PHASE_6.md) — Intelligent Query Routing, Structured University Data & Hybrid Assistant
> - [docs/phases/PHASE_7.md](docs/phases/PHASE_7.md) — NIT KKR 2025–26 Polite Crawler, Year Detection & Automated Ingestion
> 
> 💡 **Phase 7 Notice**: AskCampusAi includes a polite, controlled crawler targeting official NIT Kurukshetra public portals (`https://nitkkr.ac.in/`). It enforces strict **2025–26 Academic Year Eligibility**, skips older historical documents without guessing, provides **SSRF/robots.txt protection**, preserves original **public PDF URLs** in Qdrant and citations, deduplicates via SHA-256, and integrates seamlessly with Phase 5 atomic versioning.

---

## 1. Features Implemented in Phase 2

- **PDF Document Ingestion Pipeline**:
  - Authenticated admin upload endpoint (`POST /api/documents/upload`).
  - Page-preserving text extraction with `pdf-parse`.
  - Content sanitization removing extraction noise, broken line wraps, and artifacts.
  - Sentence-preserving chunker with sliding overlap and page attribution.
- **Dense Vector Embeddings (Gemini)**:
  - Embeddings generated via `gemini-embedding-2` configured with 768 dimensions.
  - Batching and rate-limit backoff handling.
- **Qdrant Vector Database Integration**:
  - Automatic collection creation (`askcampus_documents`, 768d, Cosine distance).
  - Point upserting with unique UUIDs, vectors, and rich metadata payloads (document title, category, department, page number, chunk index, text).
  - Synchronous document point purge upon deletion.
- **Single-Turn Grounded RAG Chat**:
  - `POST /api/chat` endpoint accepting student questions.
  - Vector similarity search retrieving top-K relevant chunks above score threshold.
  - Grounded answer generation using Gemini `gemini-3.8-flash`.
  - **Anti-Hallucination Guard**: Rejection fallback if no relevant context exists (*"I couldn't find this information in the available university documents."*).
  - **Source Citations**: Returns document title, page number, category, and similarity match percentage.
- **Interactive Campus Assistant UI**:
  - Real-time chat dialogue with loading states.
  - Citation chips rendered beneath assistant messages.
  - Suggested official prompt chips for 1-click testing.
- **Admin Document Management Dashboard**:
  - Ingestion modal: PDF selector, title, category, department, and document type.
  - Real-time document table: title, category, pages, chunks, processing status, and deletion controls.
- **Student Document Catalog**:
  - Searchable and filterable catalog of verified university documents at `/documents`.

---

## 2. Technology Stack

### Frontend
- **Framework**: React 18
- **Language**: JavaScript (ES6+ Modules, No TypeScript)
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS 3 (Custom dark theme)
- **Routing**: React Router DOM v6
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js (v24+)
- **Framework**: Express.js 4 (ES Modules: `"type": "module"`)
- **Database**: MongoDB with Mongoose ODM
- **Vector Database**: Qdrant Cloud REST API
- **AI Models**: Google Gemini (`gemini-embedding-2` & `gemini-3.8-flash`) via `GEMINI_API_KEY`
- **Document Processing**: `pdf-parse` & `multer`
- **Authentication**: JWT (`jsonwebtoken`) & `bcryptjs`

---

## 3. Environment Variables

### Backend (`backend/.env`)
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=super_secret_jwt_key_askcampusai_2026_dev_phrase
CLIENT_URL=http://localhost:5173

# Redis Cache & Abuse Protection (Phase 4)
REDIS_URL=redis://127.0.0.1:6379
REDIS_MOCK=false
RAG_CACHE_TTL_SECONDS=3600
SEMANTIC_CACHE_THRESHOLD=0.88
SEMANTIC_CACHE_MAX_ENTRIES=100
CHAT_RATE_LIMIT_WINDOW_SECONDS=60
CHAT_RATE_LIMIT_MAX_REQUESTS=30
LOGIN_RATE_LIMIT_WINDOW_SECONDS=60
LOGIN_RATE_LIMIT_MAX_REQUESTS=10

# Gemini API Configuration (Used for BOTH Embeddings & LLM)
GEMINI_API_KEY=your_gemini_api_key_here
EMBEDDING_MODEL=gemini-embedding-2
EMBEDDING_DIMENSION=768
LLM_MODEL=gemini-3.8-flash

# Qdrant Vector Database
QDRANT_CLUSTER_API_KEY=your_qdrant_api_key_here
QDRANT_CLUSTER_END_POINT=https://your-cluster.aws.cloud.qdrant.io
QDRANT_COLLECTION_NAME=askcampus_documents

# RAG Search Tuning
RAG_TOP_K=5
RAG_MIN_SCORE=0.45
```

### Frontend (`frontend/.env`)
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

---

## 4. How to Install & Run

### Step 1: Install Dependencies
```bash
# In backend
cd backend
npm install

# In frontend (in a separate terminal)
cd frontend
npm install
```

### Step 2: Start the Backend Server
```bash
cd backend
npm run dev
```
*Server runs on `http://localhost:5000` (Health check: `http://localhost:5000/api/health`).*

### Step 3: Start the Frontend Application
```bash
cd frontend
npm run dev
```
*Application runs on `http://localhost:5173`.*

---

---

## 5. Phase 4 — Redis Caching, Semantic Caching & Rate Limiting

### A. Exact Caching
- **Flow**:
  ```
  Query -> Normalization -> SHA-256 Hash -> Redis Lookup -> Cached Answer + Sources (1ms, 0 AI calls)
  ```
- **Namespaces**:
  - Public: `rag:v{version}:public:{hash}`
  - User-specific: `rag:v{version}:user:{userId}:{hash}`
- **TTL**: Configurable via `RAG_CACHE_TTL_SECONDS` (default: 3600 seconds).

### B. Semantic Caching
- **Flow**:
  ```
  Query -> Gemini Embedding (768d) -> Cosine Scan against Bounded Embeddings -> Threshold Check (>= 0.88) -> Cached Answer
  ```
- Reuses verified answers for semantically equivalent paraphrased inquiries (e.g. *"What is the minimum attendance requirement?"* and *"What percentage attendance do students need?"*).
- **Safety**: Queries involving private student data (`"my attendance"`, `"my grades"`, `"my fee"`) automatically bypass shared semantic cache.
- **Bounded**: Capped at `SEMANTIC_CACHE_MAX_ENTRIES` (default: 100) with FIFO eviction and TTL.

### C. Rate Limiting
- **Flow**:
  ```
  Request -> Redis Sliding Window Counter -> Threshold Check -> Proceed or HTTP 429
  ```
- **Protected Endpoints**:
  - `POST /api/chat`: 30 req/min (configurable via `CHAT_RATE_LIMIT_MAX_REQUESTS` & `CHAT_RATE_LIMIT_WINDOW_SECONDS`).
  - `POST /api/auth/login` & `POST /api/auth/register`: 10 req/min (`LOGIN_RATE_LIMIT_MAX_REQUESTS` & `LOGIN_RATE_LIMIT_WINDOW_SECONDS`).
- **Response**: HTTP 429 Too Many Requests with `Retry-After` header.
- **Fail-Open Resilience**: If Redis is offline, requests proceed without blocking.

### D. Cache Invalidation Strategy
- **Versioned Namespace Strategy**: Active cache version stored in `rag:config:cache_version`.
- Document upload, re-indexing, or deletion increments version (e.g. `v1` -> `v2`).
- Old cache entries naturally expire via TTL without expensive SCAN/DEL.
- **Triggers**:
  - `POST /api/documents/upload` (Document indexing)
  - `DELETE /api/documents/:id` (Document deletion)
  - `POST /api/admin/cache/invalidate` (Admin manual flush)

### E. Redis Failure Mode
**Redis is strictly an optimization, NOT a hard dependency.**
If Redis is down or unreachable:
1. System logs warning on backend.
2. Cache is gracefully bypassed.
3. Full Phase 3 RAG runs uninterrupted.
4. Students receive grounded answers with zero errors exposed.

---

## 6. Automated Verification & Evaluation

### Run Automated Test Suites
```bash
cd backend

# Phase 6 Multi-Strategy Intelligent Assistant Test Suite (12 Passed, 0 Failed)
npm run test:phase6

# Phase 6 Query Routing & Intent Evaluation Benchmark (18/18 100.0% Accuracy)
npm run eval:routing

# Phase 5 Document Registry & Ingestion Test Suite (14 Passed, 0 Failed)
npm run test:phase5

# Phase 4 Redis Caching & Rate Limiting Test Suite (11 Passed, 0 Failed)
npm run test:phase4

# Phase 3 Hybrid Retrieval Test Suite (10 Passed, 0 Failed)
npm run test:phase3

# Phase 2 Basic RAG Test Suite (9 Passed, 0 Failed)
npm run test:phase2

# Phase 1 Foundation & Auth Test Suite (9 Passed, 0 Failed)
npm test
```

### Routing Evaluation Benchmark Results
Measured via `backend/evaluation/evaluateRouting.js`:
- Policy RAG: **4/4 (100.0%)**
- Course Search: **4/4 (100.0%)**
- Deadlines: **3/3 (100.0%)**
- PYQ Search: **2/2 (100.0%)**
- Document Lookup: **1/1 (100.0%)**
- Clarification: **2/2 (100.0%)**
- Hybrid Inquiry: **2/2 (100.0%)**
- **Overall Routing Accuracy: 18/18 (100.0%)**

---

## 7. How to Test Phase 6 in the Browser

1. Start both servers:
   ```bash
   # Terminal 1
   cd backend && npm run dev

   # Terminal 2
   cd frontend && npm run dev
   ```
2. Open `http://localhost:5173/login`. Use **Admin Demo** to sign in.
3. Visit the **Admin Dashboard** (`/admin`):
   - **Course Catalog Tab**: View existing courses, filter by department/semester, click **Add Course** to create a structured course (e.g. `CS301` Database Management Systems).
   - **Academic Deadlines Tab**: View calendar events, click **Add Academic Event** to create a deadline (e.g. `Autumn Semester Registration`).
   - **Document Registry Tab**: Full document management, sequential versions, upload new PDF versions, toggle active status.
   - **Routing & Diagnostics Tab**: Enter any student query to see real-time routing decisions, intent classification, extracted entities, and multi-stage retrieval metrics.
   - **Redis & Cache Tab**: View cache metrics and test the **Invalidate RAG Cache** button.
4. Visit the **Campus Assistant** (`/assistant`):
   - **Structured Course Inquiry**: Type *"Find machine learning courses"* or *"Show CSE courses in semester 6"*. Observe instant structured card presentation with code, credits, department, and semester.
   - **Ambiguous Registration Query**: Type *"When is registration?"*. Observe that the assistant does not guess, but prompts with interactive clarification chips (*Course Registration, Semester Registration, Exam Registration, Hostel Registration*). Click a chip to continue.
   - **Deadline Inquiry**: Type *"What are the upcoming academic deadlines?"*.
   - **Previous Year Paper Search**: Type *"Find DBMS previous year papers"*.
   - **Policy Question**: Type *"What is the minimum attendance requirement?"*.
   - **Hybrid Query**: Type *"Is attendance below 75% allowed for B.Tech CSE students?"*. Notice how the assistant merges structured course facts with official regulatory clauses while attributing exact source documents and page numbers.

---

## 8. Phase 7 — NIT KKR 2025–26 Document Crawler & Ingestion
 
 ### A. Controlled & Polite Public Crawling with Expanded Official Paths
 - **Target**: Official NIT Kurukshetra website sections (`https://nitkkr.ac.in/`).
 - **Expanded Approved Paths**:
   - High Priority: `/academic-notifications/`, `/exam-notifications/`, `/academic-calender/`, `/notification-notices/`, `/scholarship-notifications/`, `/resultnotifications/`
   - Medium Priority: `/category/announcements/`, `/category/notifications/`, `/notifications-2/`, `/b-tech/`, `/dasa-mea-iccr-iis/`
   - Optional / Archived: `/notification-archived/`
 - **Crawlable HTML Paths vs. PDF Destinations**: Only approved sections are crawled for links. `/wp-content/uploads/` is designated as a download destination for PDFs linked from approved pages, and is **never** crawled recursively as an HTML directory.
 - **Automatic Pagination Support**: Subpaths like `/category/notifications/page/2/`, `/page/3/` are automatically recognized under approved prefixes.
 - **Rate Limiting & Politeness**: 1.0–1.2s delay, 25MB response size limit, retry backoff, and SSRF protection (blocks loopback, private RFC 1918 IPs, and non-HTTP protocols).
 - **robots.txt Compliance**: Caches rules from `https://nitkkr.ac.in/robots.txt` and respects `Disallow:`.
 
 ### B. Strict 2025–26 Academic Year & Collection Date Filter (NO GUESSING)
 - **Target Scope**: Academic Year 2025–26 and dates from `2025-01-01` through current date.
 - **Multi-Signal Analysis**: Analyzes anchor text, page headings, notice dates, filename patterns, and PDF first-page text.
 - **Eligibility Decisions**:
   - `2025–26` or date between `2025-01-01` and current date ──► **ACCEPTED** (`CONFIRMED_2025_26`)
   - `2024–25`, `2023–24`, or older dates ──► **SKIPPED** (`OLD_YEAR`, no download/ingestion)
   - Ambiguous / missing year signals ──► **SKIPPED** (`YEAR_UNKNOWN`, never guessed)
 
 ### C. Document Classification & Student Knowledge Base Filter
 - Classifies documents into 20+ types (`academic_notification`, `exam_notification`, `academic_calendar`, `scholarship`, `result`, `registration`, `open_elective`, `timetable`, `hostel`, `admission`, etc.).
 - Assigns `knowledgeBaseScope`: `student`, `administrative`, `research`, `general`.
 - Administrative notices (staff recruitment, vendor tenders, civil works) are retained in registry for administration, but automatically excluded from student-facing RAG.
 
 ### D. Source Provenance, Dual URL Storage & Clean Storage
 - Retains both `sourceUrl` (official PDF URL) and `sourcePageUrl` (discovery webpage).
 - Temporary PDFs are unlinked from disk immediately after indexing.
 - Assistant UI displays clickable `[View Official PDF ↗]` buttons opening genuine NIT KKR documents.
 
 ---
 
 ## 9. Automated Verification
 
 ```bash
 cd backend
 
 # Phase 7 NIT KKR 2025-26 Crawler Test Suite (29 Passed, 0 Failed)
 npm run test:phase7
 
 # Phase 6 Multi-Strategy Intelligent Assistant Test Suite (12 Passed, 0 Failed)
 npm run test:phase6
 
 # Phase 5 Document Registry & Ingestion Test Suite (14 Passed, 0 Failed)
 npm run test:phase5
 
 # Phase 4 Redis Caching & Rate Limiting Test Suite (11 Passed, 0 Failed)
 npm run test:phase4
 
 # Phase 3 Hybrid Retrieval Test Suite (10 Passed, 0 Failed)
 npm run test:phase3
 
 # Phase 2 Basic RAG Test Suite (9 Passed, 0 Failed)
 npm run test:phase2
 
 # Phase 1 Foundation & Auth Test Suite (9 Passed, 0 Failed)
 npm test
 ```

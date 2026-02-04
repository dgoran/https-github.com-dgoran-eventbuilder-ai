# Code Review Report: EventBuilder AI

**Date**: 2026-02-04
**Reviewed by**: Claude Code AI
**Branch**: claude/test-and-review-wrXOP

---

## Executive Summary

EventBuilder AI is a well-structured full-stack application for AI-powered event planning. The codebase demonstrates good React/TypeScript patterns and a clean UI/UX design. However, it has **significant security vulnerabilities** that must be addressed before production deployment, and notably lacks automated tests.

### Build Status
- **Build**: PASSED
- **Warning**: Bundle size (821KB) exceeds 500KB threshold

---

## 1. Security Vulnerabilities

### Critical Issues

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **HIGH** | Hardcoded encryption key | `server.js:20` | Default `ENCRYPTION_KEY` is hardcoded. Should require environment variable. |
| **HIGH** | API key exposure via postMessage | `aiService.ts:223` | Uses `postMessage({...}, '*')` with wildcard origin - vulnerable to cross-origin attacks |
| **HIGH** | XSS via innerHTML injection | `server.js:451` | Gemini API key injected directly into HTML without sanitization |
| **MODERATE** | CORS wide open | `server.js:28` | `cors()` allows all origins - should be restricted in production |
| **MODERATE** | No rate limiting | `server.js` | No rate limiting on API endpoints - vulnerable to abuse |

### npm Audit Findings

```
5 vulnerabilities (1 moderate, 4 high)

- jws 4.0.0: HMAC signature verification issue (HIGH)
- nodemailer <=7.0.10: Address parsing DoS + unintended domain issues (MODERATE)
- qs <6.14.1: Memory exhaustion via arrayLimit bypass (HIGH)
- express 4.0.0-4.21.2: Depends on vulnerable body-parser and qs
```

**Recommendation**: Run `npm audit fix` to address fixable issues.

---

## 2. Code Quality Issues

### TypeScript Issues

| Issue | Location | Description |
|-------|----------|-------------|
| `@ts-ignore` usage | `Dashboard.tsx:196-197` | Bypasses type safety for budget item changes |
| Deprecated API | `storageService.ts:6`, `aiService.ts:100` | Uses `.substr()` instead of `.substring()` |
| Missing strict mode | `tsconfig.json` | `strict: true` not enabled, reducing type safety |
| Inconsistent typing | `types.ts:7-8`, `59-61` | Duplicate properties: `customImageUrl`/`imageUrl`, `headerImageUrl`/`coverImage` |

### React Patterns

| Issue | Location | Description |
|-------|----------|-------------|
| Large component | `Dashboard.tsx` | 1,375 lines - should be split into smaller components |
| Missing error boundaries | Entire app | No React error boundaries for graceful failure handling |
| useEffect dependency | `Dashboard.tsx:130` | `integrationConfig` in dependency array may cause unnecessary re-renders |
| Direct DOM manipulation | `Dashboard.tsx:408` | Uses `document.body.appendChild` instead of React patterns |

### Backend Issues

| Issue | Location | Description |
|-------|----------|-------------|
| No input validation | `server.js:288-298` | `POST /api/events` accepts any body without schema validation |
| Inconsistent encryption | `server.js:183-189` | BigMarker key stored plain, others encrypted |
| No authentication | `server.js` | Admin endpoints have no auth protection |
| Silent failures | `server.js:111` | DB save failures are caught and ignored silently |

---

## 3. Architecture Issues

### Missing Components
- **No automated tests** - Zero test files found
- **No input validation library** (e.g., Zod, Joi)
- **No authentication/authorization**
- **No logging framework** (uses console.log/error)
- **No health metrics/monitoring**

### Bundle Size
- Main bundle: **821KB** (gzip: 219KB) - exceeds 500KB warning threshold
- Should implement code splitting for Dashboard and Recharts

### Data Flow Concerns
- **No state management library** - App state managed via prop drilling
- **postMessage API usage** - Event registration relies on `postMessage('*')` which is insecure

---

## 4. Potential Bugs

| Bug | Location | Description |
|-----|----------|-------------|
| Race condition | `App.tsx:73-74` | `saveEvent(plan)` called without awaiting before state change |
| Memory leak potential | `Dashboard.tsx:77-129` | Event listener not cleaned up properly if component unmounts during async operation |
| ID type inconsistency | `SuperAdmin.tsx:79`, `storageService.ts:90` | Mixing string ID comparisons with potential number IDs |
| Null check missing | `geminiService.ts:166-167` | Content parts iteration without null checking |

---

## 5. Positive Aspects

- Clean React component structure with good separation of concerns
- Well-organized service layer (aiService, storageService, geminiService)
- Good TypeScript interface definitions in `types.ts`
- Proper use of async/await throughout
- Nice UI/UX with Tailwind CSS and thoughtful animations
- Good error handling with fallbacks in AI services
- Exponential backoff retry logic in `storageService.ts`
- In-memory caching for database reads in `server.js`
- Clean API proxy implementation for third-party services

---

## 6. Recommendations

### Immediate Priority (Security)

1. **Fix postMessage origin** - Replace `'*'` with specific allowed origins
2. **Require ENCRYPTION_KEY** - Remove default, require from environment
3. **Run npm audit fix** - Patch vulnerable dependencies
4. **Sanitize API key injection** - Escape/validate before HTML injection
5. **Restrict CORS** - Specify allowed origins for production

### Short-term (Code Quality)

1. Enable `strict: true` in tsconfig.json
2. Add input validation with Zod/Joi for API endpoints
3. Split Dashboard.tsx into smaller components (OverviewTab, AgendaTab, etc.)
4. Replace deprecated `.substr()` with `.substring()`
5. Add React error boundaries

### Medium-term (Architecture)

1. **Add tests** - At minimum:
   - Unit tests for aiService functions
   - API endpoint tests for server.js
   - Component tests for critical UI flows
2. Implement code splitting for Dashboard and Recharts
3. Add authentication to admin endpoints
4. Implement proper logging (Winston/Pino)
5. Add state management (Zustand/Redux Toolkit)

### Long-term (Scalability)

1. Migrate from JSON file storage to a proper database (PostgreSQL/MongoDB)
2. Add API rate limiting (express-rate-limit)
3. Implement CI/CD pipeline with automated testing
4. Add monitoring and observability (Prometheus/Grafana)
5. Consider serverless architecture for cost efficiency

---

## 7. Test Coverage Gap Analysis

The project currently has **0% test coverage**. Here are the recommended test files to add:

```
tests/
├── unit/
│   ├── aiService.test.ts        # Test event generation, updates
│   ├── storageService.test.ts   # Test CRUD operations, retry logic
│   └── config.test.ts           # Test URL construction
├── integration/
│   ├── server.test.ts           # Test all API endpoints
│   └── database.test.ts         # Test DB read/write operations
├── components/
│   ├── Generator.test.tsx       # Test form submission, suggestions
│   ├── Dashboard.test.tsx       # Test tab switching, editing
│   └── Modal.test.tsx           # Test open/close behavior
└── e2e/
    └── eventFlow.test.ts        # Full event creation flow
```

---

## Summary

The codebase is a functional full-stack application with good UI/UX design. The primary concerns are:

1. **Security**: Multiple HIGH severity issues need immediate attention
2. **Testing**: Zero test coverage creates significant risk
3. **Code Organization**: Dashboard component needs refactoring
4. **Dependencies**: npm vulnerabilities should be patched

**Overall Assessment**: Ready for development/demo use, but requires security hardening and testing before production deployment.

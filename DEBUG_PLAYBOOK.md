# DEBUG_PLAYBOOK.md
# Agent-Executable Full Codebase Audit & Debug Protocol
# =====================================================
# INSTRUCTIONS: You are an AI code agent. Follow this playbook step by step.
# Complete each step fully before moving to the next.
# Update the status checkboxes and AUDIT_TRACKER.md as you go.
# If your session is ending, save your progress so the next session can continue.

---

## STATUS TRACKER
<!-- Update this section as you complete each phase -->

- [ ] PHASE 0: Backup created
- [ ] PHASE 1: Reconnaissance complete (PROJECT_MAP.md created)
- [ ] PHASE 2: Automated scan complete (SCAN_RESULTS.md created)
- [ ] PHASE 3: Zone map created (ZONE_MAP.md created)
- [ ] PHASE 4: All zones audited and fixed (AUDIT_TRACKER.md fully checked)
- [ ] PHASE 5: Cross-zone validation passed
- [ ] PHASE 6: Final verification sweep passed (zero issues remaining)
- [ ] PHASE 7: Enhancement recommendations generated
- [ ] PHASE 8: Master report generated

---

## HOW TO RESUME IF STARTING A NEW SESSION

If you are starting a new session and this playbook is already in progress:

1. Read this file — check the STATUS TRACKER above to see which phase you're in
2. Read AUDIT_TRACKER.md to see which zones are done
3. Read the most recent AUDIT_*.md file to see the last zone's results
4. Continue from where the checkboxes stop being checked
5. Do NOT redo completed work

---

## PHASE 0: BACKUP
**Priority: MANDATORY — Do this first, no exceptions**

1. Create a complete copy of this entire project directory
2. Save it to `../BACKUP_BEFORE_DEBUG/` (one level up from project root)
3. Verify the backup by confirming file count matches the original
4. Create a file called `BACKUP_RECEIPT.md` in the project root containing:
   - Backup location
   - Date and time
   - Total files copied
   - Total size

After completing: Mark PHASE 0 checkbox above as [x]

---

## PHASE 1: RECONNAISSANCE
**Goal: Map the entire project so we know what we're dealing with**

Create a file called `PROJECT_MAP.md` in the project root. Include ALL of the following:

### 1.1 Language Breakdown
- List every programming language in the project
- Count files and lines of code per language
- Identify the primary language

### 1.2 Architecture Overview
- What type of application is this (web app, API, mobile, desktop, etc.)
- Frontend technology (React, Vue, Angular, HTML, etc.)
- Backend technology (Node, Python, Java, etc.)
- Database(s) used
- Major frameworks and libraries

### 1.3 Directory Structure
- Map every top-level directory and what it contains
- Identify which directories are source code vs config vs tests vs build output vs dependencies

### 1.4 Entry Points
- Where does the application start? (main files, index files, server files)
- What scripts are in package.json / Makefile / etc.

### 1.5 External Dependencies
- APIs and external services the app connects to
- Third-party integrations
- Environment variables currently in use (DO NOT log actual values, just variable names)

### 1.6 Configuration Files
- List every config file and what it controls
- Note which ones contain hardcoded values vs environment variable references

### 1.7 Test Coverage
- Does the project have tests? Where are they?
- What testing framework is used?
- Estimate of coverage (well-tested, partially tested, no tests)

After completing: Mark PHASE 1 checkbox above as [x]

---

## PHASE 2: AUTOMATED SCAN
**Goal: Use automated tools to find obvious issues before manual review**

Run ALL of the following scans and save combined results to `SCAN_RESULTS.md`:

### 2.1 Hardcoded Data Scan
Search the ENTIRE codebase (every file, every directory except node_modules, vendor, .git, build, dist) for:

```
Grep patterns to run (adapt to available tools):

CREDENTIALS & SECRETS:
- "password" (case insensitive, in assignments/values not variable names)
- "api_key", "apiKey", "API_KEY" with values assigned
- "secret", "token" with values assigned
- "Bearer " followed by actual token strings
- AWS access keys (AKIA...)
- Private keys (-----BEGIN)

FAKE/PLACEHOLDER DATA:
- "lorem ipsum"
- "test@", "example@", "user@example", "admin@example"
- "example.com", "example.org", "test.com"
- "John Doe", "Jane Doe", "John Smith"
- "123 Main St", "123 Fake", "555-"  (fake phone numbers)
- "foo", "bar", "baz", "asdf", "qwerty" (as data values, not variable names)
- "placeholder", "dummy", "sample", "mock" (in data contexts)
- "TBD", "TBA", "CHANGEME", "REPLACE_ME", "INSERT_"
- "your_", "my_" prefixed placeholder values

HARDCODED VALUES:
- "http://localhost", "https://localhost"
- "127.0.0.1", "0.0.0.0" (in non-config files)
- ":3000", ":8080", ":5432", ":27017" and other port numbers in source code
- Hardcoded file paths ("/Users/", "/home/", "C:\\")
- Hardcoded database connection strings
- Hardcoded color values that should be themed (case by case)

CODE QUALITY:
- "TODO", "FIXME", "HACK", "XXX", "TEMP", "WORKAROUND"
- "console.log", "console.debug", "print(" used for debugging
- Large blocks of commented-out code (10+ consecutive commented lines)
- "eslint-disable", "noqa", "noinspection" (suppressed warnings)
```

### 2.2 Linting
- Detect the project's language(s) and run the appropriate linter(s)
- Save all warnings and errors with file paths and line numbers
- If no linter config exists, use default/recommended rules

### 2.3 Security Scan
- If semgrep is available, run: `semgrep --config auto . --json`
- If not, manually scan for: SQL injection, XSS, path traversal, eval() usage, unsafe deserialization
- Check for outdated dependencies with known vulnerabilities

### 2.4 Complexity Analysis
- Identify the most complex files (highest cyclomatic complexity)
- Flag files over 500 lines as candidates for refactoring
- Flag functions over 100 lines

### 2.5 Summary Statistics
At the top of SCAN_RESULTS.md, write:

```
## Scan Summary
- Total hardcoded/fake data instances found: [number]
- Total lint warnings: [number]
- Total lint errors: [number]
- Total security issues found: [number]
- Total TODO/FIXME/HACK comments: [number]
- Total console.log/debug statements: [number]
- Most problematic files (top 20 by issue count): [list]
```

After completing: Mark PHASE 2 checkbox above as [x]

---

## PHASE 3: CREATE ZONE MAP
**Goal: Divide the codebase into manageable audit zones**

Create a file called `ZONE_MAP.md` in the project root.

### 3.1 Zone Division Rules
- Each zone should contain NO MORE than 500 files
- Zones should follow logical boundaries (by feature, module, or directory)
- Keep related code together in the same zone
- Suggested zone categories:
  - Core business logic / domain models
  - API routes / controllers / endpoints
  - Database models / migrations / queries / ORM
  - Authentication / authorization / security middleware
  - Frontend components / pages / views
  - Frontend state management / stores
  - Shared utilities / helpers / libraries
  - Configuration / environment / infrastructure
  - Background jobs / workers / queues / cron
  - Integrations / third-party service connectors
  - Tests (audit separately for fake data, but don't "fix" test mocks)
  - Static assets / styles / themes

### 3.2 Zone Map Format
For each zone, document:

```markdown
### Zone [Letter]: [Name]
- **Paths:** [list of directory paths included]
- **Files:** [count]
- **Lines of Code:** [count]
- **Responsibility:** [what this zone does in 1-2 sentences]
- **Dependencies:** [which other zones this zone depends on]
- **Priority:** Critical / High / Medium / Low
- **Scan Issues Already Found:** [count from SCAN_RESULTS.md]
```

### 3.3 Create Audit Tracker
Create `AUDIT_TRACKER.md`:

```markdown
# Audit Progress Tracker
Last Updated: [date/time]

| Zone | Name | Files | Priority | Audit Status | Fix Status | Issues Found | Issues Fixed | Issues Remaining |
|------|------|-------|----------|--------------|------------|-------------|-------------|-----------------|
| A | [name] | [count] | Critical | Not Started | Not Started | - | - | - |
| B | [name] | [count] | High | Not Started | Not Started | - | - | - |
[...continue for all zones]

## Session Log
- Session 1: [date] — Completed zones: [list]
- Session 2: [date] — Completed zones: [list]
[add entries as sessions progress]
```

After completing: Mark PHASE 3 checkbox above as [x]

---

## PHASE 4: ZONE-BY-ZONE AUDIT AND FIX
**Goal: Audit every file in every zone, fix every issue found**
**Process: Audit a zone → Fix that zone → Move to next zone**
**Complete 4-5 zones per session, then save progress and continue in next session**

### For EACH zone, follow steps 4.1 through 4.4:

### 4.1 Audit the Zone
Read every file in the zone. For each file, check for ALL of the following:

**CATEGORY A — Hardcoded/Fake Data (FIX ALL):**
- [ ] Hardcoded strings representing data values (not UI labels or logical constants)
- [ ] Placeholder or dummy data in any form
- [ ] Hardcoded URLs, API endpoints, base URLs
- [ ] Hardcoded IP addresses or port numbers
- [ ] Hardcoded credentials, keys, tokens, secrets
- [ ] Hardcoded email addresses, phone numbers, names
- [ ] Hardcoded file paths or directory paths
- [ ] Hardcoded database names, table names, or connection strings
- [ ] Hardcoded numeric values that should be configurable (limits, timeouts, thresholds)
- [ ] Hardcoded dates, timestamps, or timezone values
- [ ] Hardcoded feature flags or boolean switches
- [ ] Hardcoded error messages containing sensitive system info (paths, versions, etc.)
- [ ] Environment-specific values not using env vars (dev/staging/prod differences)

**CATEGORY B — Bugs (FIX ALL):**
- [ ] Logic errors (wrong comparison, inverted condition, wrong operator)
- [ ] Off-by-one errors (loops, array indexing, pagination)
- [ ] Null/undefined reference errors (accessing properties of potentially null values)
- [ ] Unhandled promise rejections or uncaught exceptions
- [ ] Race conditions (concurrent access without proper synchronization)
- [ ] Memory leaks (event listeners not removed, intervals not cleared, subscriptions not unsubscribed)
- [ ] Dead code (unreachable code paths, unused functions, unused variables)
- [ ] Type mismatches (comparing string to number, wrong argument types)
- [ ] Missing return statements
- [ ] Incorrect async/await usage (missing await, unhandled promises)
- [ ] Broken imports or circular dependencies
- [ ] Silent failures (catch blocks that swallow errors without logging or handling)
- [ ] Incorrect error handling (catching too broadly, wrong error types)

**CATEGORY C — Security (FIX ALL):**
- [ ] SQL injection (string concatenation in queries instead of parameterized)
- [ ] XSS vulnerabilities (unescaped user input in HTML output)
- [ ] Missing authentication on protected endpoints
- [ ] Missing authorization checks (user can access other users' data)
- [ ] Insecure direct object references
- [ ] Missing input validation or sanitization
- [ ] Exposed sensitive data in responses, logs, or error messages
- [ ] Insecure defaults (debug mode on, CORS wide open, etc.)
- [ ] Path traversal vulnerabilities
- [ ] Missing rate limiting on sensitive endpoints

**CATEGORY D — Performance (NOTE, fix if easy):**
- [ ] N+1 query patterns (querying in a loop)
- [ ] Missing database indexes on frequently queried fields
- [ ] Unnecessary re-renders or re-computations
- [ ] Missing caching for expensive operations
- [ ] Synchronous operations that should be async
- [ ] Redundant API calls or duplicate data fetching
- [ ] Loading entire datasets when only a subset is needed

### 4.2 Record Issues
Save all findings to `AUDIT_ZONE_[LETTER].md`:

```markdown
# Audit Report: Zone [Letter] — [Name]
- **Date:** [date]
- **Files Reviewed:** [count]
- **Total Issues Found:** [count]
- **Critical:** [count] | **High:** [count] | **Medium:** [count] | **Low:** [count]

---

### Issue [ZONE_LETTER]-[NUMBER]
- **File:** [exact path]
- **Line(s):** [line numbers]
- **Category:** Hardcoded Data / Bug / Security / Performance
- **Severity:** Critical / High / Medium / Low
- **Description:** [what's wrong in plain English]
- **Current Code:**
\`\`\`
[the problematic code]
\`\`\`
- **Status:** 🔴 Found

---
[repeat for every issue]
```

### 4.3 Fix Every Issue
Go through each issue in the audit report and fix it:

**Fixing Hardcoded Data — Follow this priority order:**
1. Use existing config/env pattern if the project already has one — MATCH IT
2. Move value to environment variable → add to .env file → add to .env.example with description
3. Move value to a centralized config file if many related values
4. Use a constant with clear naming if the value is truly a constant but was just an unnamed magic number
5. Pull from database or API if the value should be user-configurable at runtime

**Fixing Bugs:**
1. Apply the correct fix
2. Add error handling if missing
3. Trace all callers/dependents to verify the fix is safe
4. If unsure about safety, add a comment: `// MANUAL_REVIEW_NEEDED: [reason]`

**Fixing Security Issues:**
1. Apply standard security fix (parameterized queries, output encoding, auth checks, etc.)
2. Add input validation if missing
3. Add appropriate logging for security events

### 4.4 Update Tracking
After fixing all issues in the zone:

1. Update each issue in AUDIT_ZONE_[LETTER].md — change Status from `🔴 Found` to `🟢 Fixed`
2. Add the fix details:
```markdown
- **Status:** 🟢 Fixed
- **Fix Applied:**
\`\`\`
[the new code]
\`\`\`
- **Cross-Zone Impact:** None / [describe if other zones might be affected]
```
3. Update AUDIT_TRACKER.md with zone completion status
4. Update this file's STATUS TRACKER section with current progress

### 4.5 When to Stop and Resume
If you've completed 4-5 zones and the session is getting long:
1. Make sure AUDIT_TRACKER.md is fully updated
2. Make sure this file's STATUS TRACKER shows current progress
3. Add an entry to the Session Log in AUDIT_TRACKER.md
4. The next session will read these files and continue where you left off

After ALL zones are complete: Mark PHASE 4 checkbox above as [x]

---

## PHASE 5: CROSS-ZONE VALIDATION
**Goal: Verify that fixes in one zone didn't break another zone**

Perform ALL of the following checks. Save results to `CROSS_ZONE_VALIDATION.md`:

### 5.1 Dependency Check
- Verify all imports between zones still resolve correctly
- Check for any broken references caused by renamed files, functions, or variables
- Verify no circular dependencies were introduced

### 5.2 Environment Variable Consolidation
- Collect ALL .env variables from all zones into one master list
- Check for duplicates (same variable defined in multiple places)
- Check for conflicts (same variable name with different expected values)
- Verify .env.example contains every variable with descriptions
- Verify the application fails gracefully if any required env var is missing

### 5.3 Configuration Consistency
- Verify all config files are consistent with each other
- Verify no config was accidentally deleted or corrupted during fixes
- Verify default values make sense

### 5.4 Integration Points
- For every issue that was flagged as "Cross-Zone Impact," verify the connected zone still works
- Trace data flow between zones for the most critical paths (user auth, main business logic, data persistence)

### 5.5 Re-run Automated Checks
- Run the linter again on the full project — compare results to Phase 2
- If tests exist, run them all
- Check for any NEW warnings or errors introduced by our fixes

### 5.6 Fix Any Issues Found
If cross-zone validation reveals problems:
1. Fix them immediately
2. Document each fix in CROSS_ZONE_VALIDATION.md
3. Re-run the check that caught the issue to verify it's resolved

After completing with zero remaining issues: Mark PHASE 5 checkbox above as [x]

---

## PHASE 6: FINAL VERIFICATION SWEEP
**Goal: One last pass to confirm ZERO fake data, ZERO hardcoded data, ZERO known bugs**

Create `FINAL_VERIFICATION.md` with results of these checks:

### 6.1 Complete Fake/Hardcoded Data Re-Scan
Run the exact same searches from Phase 2.1 again across the entire codebase.
- Expected result: ZERO matches (except in test files where mocks are appropriate)
- If ANY matches found: fix them immediately and re-scan

### 6.2 Lint Re-Scan
- Run linters again on full project
- Expected result: Zero errors, minimal warnings
- All warnings should be intentional and documented

### 6.3 Security Re-Scan
- Run security scanner again
- Expected result: Zero new vulnerabilities

### 6.4 Environment Variable Verification
- Every configurable value uses env vars or config
- .env.example is complete and documented
- Application shows clear error messages for missing required config

### 6.5 Debug Statement Cleanup
- Zero console.log/print/debug statements left in production code
- Proper logging framework used instead where logging is needed

### 6.6 Final Summary in FINAL_VERIFICATION.md:
```markdown
## Final Verification Results
- Hardcoded/fake data remaining: [MUST BE 0]
- Lint errors remaining: [MUST BE 0]
- Security issues remaining: [MUST BE 0]
- Debug statements remaining: [MUST BE 0]
- Tests passing: [count] / [total]
- Tests failing: [count] — [explain each]
- Items requiring manual human review: [count] — [list]
```

After completing with zero issues: Mark PHASE 6 checkbox above as [x]

---

## PHASE 7: ENHANCEMENT RECOMMENDATIONS
**Goal: Recommend improvements to make the application better for users**

Create `ENHANCEMENT_RECOMMENDATIONS.md` with recommendations in these categories:

### 7.1 Quick Wins (1-2 hours each, high impact)
Things that are easy to add and immediately improve the user experience.

### 7.2 User Experience Improvements
Missing features, workflow improvements, better error messages, accessibility, mobile support.

### 7.3 Performance Improvements
Speed optimizations, caching, query optimization, lazy loading, code splitting.

### 7.4 Reliability & Monitoring
Error tracking, health checks, retry logic, graceful degradation, structured logging, alerting.

### 7.5 Security Hardening
Rate limiting, CSRF protection, content security policy, audit logging, input validation hardening.

### 7.6 Scalability
Database scaling, horizontal scaling readiness, queue/worker patterns, caching layers.

### 7.7 Developer Experience
Test coverage improvements, documentation, CI/CD improvements, code organization, TypeScript migration (if applicable).

### Format for each recommendation:
```markdown
#### [REC-001] [Title]
- **Category:** [from above]
- **Impact:** High / Medium / Low
- **Effort:** Easy (1-2 hrs) / Medium (1-2 days) / Hard (1+ week)
- **Priority:** Must-Have / Should-Have / Nice-to-Have
- **Description:** [what to add/change and why it matters to users]
- **Implementation Notes:** [brief technical approach]
```

After completing: Mark PHASE 7 checkbox above as [x]

---

## PHASE 8: MASTER REPORT
**Goal: Create a single summary document of everything done**

Create `MASTER_DEBUG_REPORT.md`:

### 8.1 Executive Summary
In 5-7 sentences: What state was the code in before? What did we do? What state is it in now?

### 8.2 Statistics
| Metric | Count |
|--------|-------|
| Total files audited | |
| Total issues found | |
| — Hardcoded/fake data | |
| — Bugs | |
| — Security vulnerabilities | |
| — Performance issues | |
| Total issues fixed | |
| Total issues remaining | |
| Environment variables created | |
| Files modified | |
| Files created | |

### 8.3 Severity Breakdown
| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | | | |
| High | | | |
| Medium | | | |
| Low | | | |

### 8.4 Zone Summary
Brief summary of each zone: issues found, issues fixed, notable changes.

### 8.5 Environment Variables Reference
Complete list of every .env variable the application needs:
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|

### 8.6 Breaking Changes
List anything that works differently after our fixes. Include what changed and what the team needs to test.

### 8.7 Manual Action Items
Anything that requires a human to complete (items marked MANUAL_REVIEW_NEEDED).

### 8.8 Top 10 Enhancement Recommendations
The 10 highest-priority improvements from ENHANCEMENT_RECOMMENDATIONS.md.

After completing: Mark PHASE 8 checkbox above as [x]

---

## FILES THIS PLAYBOOK CREATES
These files track progress and results. They live in the project root:

| File | Purpose | Created In |
|------|---------|-----------|
| BACKUP_RECEIPT.md | Confirms backup was made | Phase 0 |
| PROJECT_MAP.md | Full project overview | Phase 1 |
| SCAN_RESULTS.md | Automated scan findings | Phase 2 |
| ZONE_MAP.md | How project is divided for audit | Phase 3 |
| AUDIT_TRACKER.md | Progress tracker for all zones | Phase 3 |
| AUDIT_ZONE_[X].md | Detailed findings per zone | Phase 4 |
| .env | Environment variables (if created) | Phase 4 |
| .env.example | Template with descriptions | Phase 4 |
| CROSS_ZONE_VALIDATION.md | Cross-zone check results | Phase 5 |
| FINAL_VERIFICATION.md | Final sweep results | Phase 6 |
| ENHANCEMENT_RECOMMENDATIONS.md | Improvement suggestions | Phase 7 |
| MASTER_DEBUG_REPORT.md | Complete summary | Phase 8 |

---

## NOTES FOR THE AGENT

1. **Never skip a phase.** Each phase depends on the previous one.
2. **Always update tracking files.** The next session depends on accurate tracking.
3. **Test files are special.** Test files legitimately contain mock/fake data. Flag it but do NOT remove mock data from tests — instead ensure test mocks use clearly named test fixtures and don't contain real credentials.
4. **node_modules, vendor, .git, build, dist directories should be SKIPPED.** Never audit dependency code.
5. **When in doubt, flag for manual review** rather than making a risky fix.
6. **Match existing patterns.** If the project already has a config system, env var pattern, or error handling approach — use it. Don't introduce new patterns that conflict with existing ones.
7. **Keep fixes minimal.** Fix the issue, don't refactor the entire file unless refactoring IS the fix.
8. **.env files should NEVER be committed to git.** Add .env to .gitignore if not already there. Only .env.example gets committed.

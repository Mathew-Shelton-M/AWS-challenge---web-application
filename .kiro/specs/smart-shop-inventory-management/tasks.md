# Tasks

## Task List

### Phase 1: Project Setup and Infrastructure

- [x] 1.1 Initialize project structure with backend (Node.js/Express/TypeScript) and frontend (React/TypeScript) workspaces
- [x] 1.2 Configure PostgreSQL database connection and run initial schema migrations (users, refresh_tokens, auth_events, categories, products, stock_movements, alerts, settings)
- [x] 1.3 Set up Zod validation schemas for all request bodies
- [x] 1.4 Configure Jest + Supertest for integration tests and fast-check for property-based tests
- [x] 1.5 Set up environment configuration (.env) for database URL, JWT secrets, notification credentials

---

### Phase 2: User Authentication (Requirement 1, 12)

- [x] 2.1 Implement POST /auth/login — validate credentials, issue JWT access token (15 min) + refresh token (7 days), log auth event
- [x] 2.2 Implement POST /auth/refresh — validate refresh token, issue new access token
- [x] 2.3 Implement POST /auth/logout — revoke refresh token
- [x] 2.4 Implement JWT auth middleware — validate Bearer token on all protected routes, return 401 on failure
- [x] 2.5 Implement session inactivity timeout (30 min) — track last activity, expire session and log event
- [x] 2.6 Implement auth event logging (login_success, login_failure, session_expiry) with timestamp and source IP
- [x] 2.7 Write unit tests: login success, login failure, token refresh, session expiry
- [x] 2.8 Write property tests P1 (unauthenticated requests → 401), P2 (invalid credentials denied), P3 (unique password hashes), P30 (auth events logged)

---

### Phase 3: Category Management (Requirement 3)

- [x] 3.1 Implement GET /categories — list all categories
- [x] 3.2 Implement POST /categories — create category with name validation
- [x] 3.3 Implement PUT /categories/:id — rename category
- [x] 3.4 Implement DELETE /categories/:id — delete category, return 409 if products exist
- [x] 3.5 Write unit tests: create, rename, delete (empty), delete (with products → 409)
- [x] 3.6 Write property tests P8 (delete blocked with products), P9 (categoryName in all listings)

---

### Phase 4: Product Management (Requirement 2, 6)

- [x] 4.1 Implement POST /products — create product with required field validation, assign UUID, persist location fields
- [x] 4.2 Implement GET /products — list products with category join, derive and return stockStatus and expiryStatus
- [x] 4.3 Implement GET /products/:id — get single product
- [x] 4.4 Implement PUT /products/:id — update product fields, re-derive statuses, trigger alert evaluation
- [x] 4.5 Implement DELETE /products/:id — delete product and cascade alerts/movements
- [x] 4.6 Implement POST /products/:id/stock — record stock addition or reduction, reject underflow (422), update quantity, trigger alert evaluation
- [x] 4.7 Implement `deriveStockStatus(quantity, threshold)` pure function
- [x] 4.8 Implement `deriveExpiryStatus(expiryDate, nearExpiryWindow)` pure function
- [x] 4.9 Write unit tests: CRUD endpoints, underflow rejection, location display ("Location not set")
- [x] 4.10 Write property tests P4 (create round-trip), P5 (invalid input rejected), P6 (update round-trip), P7 (delete round-trip), P10 (stock status derivation), P11 (stock movement quantity invariant), P13 (expiry status derivation), P14 (expiryStatus in listings), P16 (location in search results)

---

### Phase 5: Stock Level Monitoring and Alerts (Requirement 4, 5)

- [x] 5.1 Implement alert evaluation service — after any product create/update/stock-movement, evaluate stock and expiry status and insert alerts for new transitions
- [x] 5.2 Implement GET /alerts — list active (unacknowledged) alerts
- [x] 5.3 Implement PUT /alerts/:id/acknowledge — mark alert acknowledged, set acknowledged_at
- [x] 5.4 Write unit tests: alert generated on low_stock transition, out_of_stock transition, near_expiry, expired; acknowledge removes from active list
- [x] 5.5 Write property tests P12 (alert generated on status transition), P21 (dashboard active alerts = unacknowledged), P22 (acknowledge removes from active list)

---

### Phase 6: Search and Filter (Requirement 7)

- [x] 6.1 Extend GET /products to accept query params: `q` (search term), `category`, `stockStatus`, `expiryStatus`
- [x] 6.2 Implement case-insensitive name/category search using PostgreSQL trigram index (pg_trgm)
- [x] 6.3 Implement simultaneous multi-filter logic (AND semantics across all active filters)
- [x] 6.4 Return empty array (not error) when no products match; frontend displays "No products found"
- [x] 6.5 Write unit tests: search with known fixtures, each filter type, combined filters, empty results
- [x] 6.6 Write property tests P15 (expiry filter correctness), P17 (search correctness), P18 (multi-filter correctness), P19 (clear filters = full list)

---

### Phase 7: Dashboard (Requirement 8)

- [x] 7.1 Implement GET /dashboard — return totalProducts, lowStockCount, outOfStockCount, nearExpiryCount, expiredCount, and activeAlerts list
- [x] 7.2 Write unit tests: dashboard counts with known fixture data
- [x] 7.3 Write property test P20 (dashboard counts match actual product statuses)

---

### Phase 8: Settings (Requirement 5.5, 9.3)

- [x] 8.1 Implement GET /settings — return shopkeeper settings (near_expiry_window, email_notifications, sms_notifications)
- [x] 8.2 Implement PUT /settings — update settings, validate near_expiry_window ≥ 1
- [x] 8.3 Ensure near_expiry_window defaults to 30 days on first access
- [x] 8.4 Write unit tests: default value, update and fetch round-trip, independent channel toggle

---

### Phase 9: Notifications (Requirement 9)

- [x] 9.1 Implement notification service interface with email (Nodemailer) and SMS (Twilio) adapters
- [x] 9.2 Integrate notification service into alert evaluation — enqueue notification when channel is enabled
- [x] 9.3 Implement retry logic: up to 3 attempts with exponential backoff (1s, 2s, 4s), log failure after 3rd attempt
- [x] 9.4 Write unit tests: notification triggered on alert, message content, retry on failure, failure logged after 3 attempts
- [x] 9.5 Write property tests P23 (notification triggered with correct content), P24 (retry count ≤ 3)

---

### Phase 10: Reports and Analytics (Requirement 10)

- [x] 10.1 Implement GET /reports/stock-usage — query stock_movements within date range, group by product
- [x] 10.2 Implement GET /reports/expiry-wastage — query products with expiry_date within date range
- [x] 10.3 Implement GET /reports/top-restocked — aggregate stock_movements, return top 10 by restock count descending
- [x] 10.4 Implement GET /reports/:type/csv — serialize report data to CSV using json2csv, return as file download
- [x] 10.5 Write unit tests: each report with known fixture data, CSV format correctness
- [x] 10.6 Write property tests P25 (stock usage report completeness), P26 (expiry wastage report completeness), P27 (top-10 ordering invariant), P28 (CSV round-trip)

---

### Phase 11: Security Hardening (Requirement 12)

- [x] 11.1 Add Zod input sanitization middleware — strip/escape HTML and SQL special characters from all string inputs
- [x] 11.2 Enforce HTTPS-only in production (HSTS header, redirect HTTP → HTTPS)
- [x] 11.3 Add rate limiting on /auth/login (e.g., 10 attempts per minute per IP)
- [x] 11.4 Write property tests P29 (injection payloads rejected or sanitized)

---

### Phase 12: Frontend Implementation

- [x] 12.1 Implement LoginPage with form validation and error display
- [x] 12.2 Implement AuthGuard — redirect unauthenticated users to login
- [x] 12.3 Implement DashboardPage — fetch and display inventory summary cards and active alerts list with acknowledge action
- [x] 12.4 Implement ProductsPage — product table with search bar and filter panel, "No products found" state
- [x] 12.5 Implement ProductFormPage — create and edit form with field-level validation errors, optional expiry date and location fields
- [x] 12.6 Implement CategoriesPage — list, create, rename, delete categories with conflict error handling
- [x] 12.7 Implement ReportsPage — date range picker, report display (table/chart), CSV download button
- [x] 12.8 Implement SettingsPage — near-expiry window input, SMS/Email toggle switches
- [x] 12.9 Configure React Query for all API calls with appropriate cache invalidation

---

### Phase 13: End-to-End Validation

- [x] 13.1 Run all property-based tests (minimum 100 iterations each) and confirm all 30 properties pass
- [x] 13.2 Run all unit/integration tests and confirm full pass
- [~] 13.3 Manually verify dashboard alert flow: add product → reduce stock below threshold → alert appears → acknowledge → alert removed
- [~] 13.4 Manually verify expiry flow: set near-expiry product → near_expiry alert appears on dashboard
- [~] 13.5 Manually verify CSV export for each report type

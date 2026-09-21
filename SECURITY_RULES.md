# Security Rules

## 1. Zero Trust Architecture
*   **Never trust the client:** Prices, totals, commissions, stock quantities, and order status values coming from the client must be assumed malicious or outdated.
*   **Server-side Validation:** All business-critical operations MUST be validated server-side (in PostgreSQL or Edge Functions).

## 2. Authorization & RLS
*   **Row Level Security (RLS):** Must be enabled on every table. Default policy should be `DENY`. Explicitly grant access based on `auth.uid()` and roles.
*   **Vendor Isolation:** Vendors must only have access to their own data.
*   **Admin Operations:** Critical operations (refunds, payout approvals) must be strictly limited to the `admin` or `super_admin` roles.

## 3. Transactional Integrity
*   **Atomic Operations:** Use PostgreSQL transactions and PL/pgSQL functions for atomic marketplace operations (`create_order_atomic()`, `reserve_inventory()`).
*   **Concurrency:** Prevent inventory overselling using row-level locking (`SELECT ... FOR UPDATE`) during the checkout phase.
*   **Idempotency:** Protect against duplicate orders and duplicate payment webhooks by tracking transaction IDs and utilizing unique constraints.

## 4. Secret Management
*   **No Hardcoded Secrets:** Secrets (API keys, service role keys) MUST NEVER be committed to the repository.
*   **Client vs. Server Keys:** Only expose `NEXT_PUBLIC_` variables to the browser. Database connection strings and service role keys belong only in server environments or Edge Functions.

## 5. Audit & Compliance
*   **Audit Logging:** Implement triggers to log sensitive operations (e.g., changes to user roles, vendor approvals, manual balance adjustments) to the `audit_logs` table.
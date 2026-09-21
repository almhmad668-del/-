# System Architecture

## 1. Application Architecture

This marketplace relies on a decoupled, serverless-oriented architecture utilizing Next.js for the frontend and Supabase (PostgreSQL + Auth + Edge Functions) for the backend.

**Conceptual Flow:**
Next.js Frontend → Supabase Auth → PostgreSQL + RLS → PostgreSQL Transactional Functions → Supabase Edge Functions → External Services

## 2. Database Architecture

The database is PostgreSQL, acting as the absolute source of truth.
*   **Primary Keys:** UUIDs.
*   **Integrity:** Extensive use of foreign keys, check constraints, and unique constraints.
*   **Money:** Handled using `NUMERIC` or `DECIMAL` types. Floating-point types are strictly forbidden for financial calculations.

### Core Entities
*   **Users/Roles:** `profiles`, `vendors`, `vendor_members`, `vendor_bank_accounts`
*   **Catalog:** `categories`, `products`, `product_variants`, `product_images`
*   **Inventory:** `inventory`, `inventory_movements`, `inventory_reservations`
*   **Purchasing:** `carts`, `cart_items`, `orders`, `order_items`, `vendor_orders`, `vendor_order_items`, `order_status_history`
*   **Financial:** `payments`, `payment_transactions`, `commissions`, `vendor_balances`, `vendor_balance_transactions`, `payouts`
*   **Logistics:** `shipments`, `shipment_items`, `tracking_events`, `addresses`, `returns`, `return_items`, `refunds`
*   **Engagement:** `reviews`, `wishlists`, `wishlist_items`, `coupons`, `coupon_usages`, `notifications`, `audit_logs`

## 3. Authentication & Authorization

*   **Authentication:** Handled by Supabase Auth (JWTs).
*   **Roles:** Managed via claims or the `profiles` table. Support for `buyer`, `vendor`, `vendor_staff`, `admin`, `super_admin`.
*   **RLS Strategy:** Row Level Security (RLS) is enabled on all tables. The database verifies the user's role via `auth.uid()` and enforces data isolation (e.g., vendors can only see their own orders).

## 4. Marketplace Order Flow

1.  Buyer adds variants to Cart.
2.  Checkout initiates: Next.js calls a PostgreSQL RPC (`reserve_inventory()`).
3.  If inventory is successfully reserved, RPC `create_order_atomic()` creates the master order and splits it into `vendor_orders`.
4.  Next.js calls an Edge Function to create a Payment Intent.
5.  Payment Gateway confirms via Webhook (to Edge Function).
6.  Edge Function calls RPC `confirm_payment()` to finalize order state, finalize inventory deduction, and calculate commissions.

## 5. Strategies

### Inventory Strategy
Inventory must be updated via PostgreSQL atomic functions. A reservation system (`inventory_reservations`) holds stock temporarily during the checkout flow to prevent overselling.

### Payment Strategy
Payments are initiated via Edge Functions to hide secret keys. Successful payments are confirmed exclusively through secure Webhooks.

### Vendor Commission Strategy
Commissions are calculated securely on the server-side via `calculate_commission()` upon payment confirmation. Balances are stored in an immutable ledger (`vendor_balance_transactions`).

### Edge Functions Responsibilities
*   Interacting with third-party APIs (Stripe, Shippo, Resend).
*   Processing incoming webhooks securely.
*   Executing complex tasks that require elevated privileges not suitable for RPCs.

### Frontend/Backend Boundaries
*   Frontend: Renders UI, manages local state, performs direct DB reads (protected by RLS).
*   Backend (PostgreSQL/RPCs): Validates all business rules, performs state-changing atomic transactions.
*   The frontend must NEVER calculate final prices, deduct inventory, or dictate order states.

## 6. Testing & Deployment Strategy
*   **Testing:** Unit tests (Vitest), integration tests for PostgreSQL RPCs/RLS, and E2E tests for critical user flows.
*   **Deployment:** Next.js deployed on Vercel. Supabase handles the database, auth, and Edge Functions. Environment variables are injected at build/runtime.
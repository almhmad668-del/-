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
2.  Checkout initiates: Next.js calls a PostgreSQL RPC (`checkout_cart`).
3.  This single atomic RPC verifies available stock, calculates authoritative totals (using DB `shipping_rules` and `tax_rules`), and generates a multi-vendor order structure.
4.  The multi-vendor structure dictates: One `orders` (Master Order), mapping to multiple `vendor_orders` (Sub-Orders, grouped per vendor), which in turn hold `order_items`.
5.  Phase 10+ will handle executing Payment Intents and resolving webhooks to modify `payment_status`.

## 5. Strategies

### Order History & Snapshots Strategy
Historical order facts must NEVER rely on future catalog changes. `order_items` explicitly capture `product_name_snapshot`, `vendor_name_snapshot`, `variant_name_snapshot`, `sku_snapshot`, and `unit_price` precisely at checkout time. These snapshot columns are reused natively; no duplications or catalog joins are used to render `/account/orders`.

### Inventory Strategy
Inventory is decremented atomically inside the `checkout_cart` Postgres transaction. If stock is insufficient, the transaction rolls back, aborting the checkout cleanly without partial completions, returning structured JSON indicating the affected products.

### Shipping & Tax Foundation
Shipping and Taxes are derived autonomously by the backend during checkout. `tax_rules` map optionally to regions, and `shipping_rules` assign flat-rates (either platform-wide or vendor-specific). These dictate the `shipping_total` and `tax_total` fields, preventing any reliance on client-side math.

### Vendor Isolation
`vendor_orders` separate sub-orders logically. Vendors manage status lifecycles independently for their `vendor_orders`. RLS policies strictly bind access to authorized vendors (via `vendor_members`) and strictly prevent Vendor A from viewing Vendor B's orders or customer's arbitrary data.

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
-- Enable uuid-ossp extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Enums
CREATE TYPE public.order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded');
CREATE TYPE public.transaction_type AS ENUM ('credit', 'debit');

-- 2. Create Tables

-- Vendors Table
CREATE TABLE public.vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  default_commission_rate NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Products Table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  price NUMERIC NOT NULL CHECK (price >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Orders (Main customer order)
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  total_amount NUMERIC NOT NULL CHECK (total_amount >= 0),
  status public.order_status NOT NULL DEFAULT 'pending'::public.order_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vendor Orders (Sub-orders split by vendor)
CREATE TABLE public.vendor_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  commission_rate_snapshot NUMERIC NOT NULL,
  subtotal_amount NUMERIC NOT NULL CHECK (subtotal_amount >= 0),
  commission_amount NUMERIC NOT NULL CHECK (commission_amount >= 0),
  status public.order_status NOT NULL DEFAULT 'pending'::public.order_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order Items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_order_id UUID NOT NULL REFERENCES public.vendor_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_at_purchase NUMERIC NOT NULL CHECK (price_at_purchase >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ledger Entries (Double-entry accounting for vendors)
CREATE TABLE public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  type public.transaction_type NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  reference_id UUID, -- Can be order_id, payout_id, etc. Not enforced as FK because it's polymorphic.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Processed Webhooks (Idempotency)
CREATE TABLE public.processed_webhooks (
  event_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create Indexes on frequently queried and foreign key columns

CREATE INDEX idx_vendors_user_id ON public.vendors(user_id);

CREATE INDEX idx_products_vendor_id ON public.products(vendor_id);

CREATE INDEX idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX idx_orders_status ON public.orders(status);

CREATE INDEX idx_vendor_orders_order_id ON public.vendor_orders(order_id);
CREATE INDEX idx_vendor_orders_vendor_id ON public.vendor_orders(vendor_id);
CREATE INDEX idx_vendor_orders_status ON public.vendor_orders(status);

CREATE INDEX idx_order_items_vendor_order_id ON public.order_items(vendor_order_id);
CREATE INDEX idx_order_items_product_id ON public.order_items(product_id);

CREATE INDEX idx_ledger_entries_vendor_id ON public.ledger_entries(vendor_id);
CREATE INDEX idx_ledger_entries_reference_id ON public.ledger_entries(reference_id);

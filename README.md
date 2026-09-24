# Multi-Vendor E-Commerce Marketplace

This repository contains the foundation for a modern, production-grade multi-vendor e-commerce marketplace.

## Tech Stack
*   **Frontend:** Next.js (App Router), TypeScript, React, Tailwind CSS
*   **Backend & Database:** Supabase, PostgreSQL (with Row Level Security), Supabase Edge Functions

## Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy the example environment variables file and fill in your Supabase project details.
```bash
cp .env.example .env.local
```
*(Do not commit `.env.local` to version control!)*

### 3. Run Development Server
```bash
npm run dev
```

### 4. Run Tests
```bash
npm run test
```

## Documentation
Please refer to the following documents for project guidelines:
*   [Architecture (ARCHITECTURE.md)](ARCHITECTURE.md)
*   [Development Rules (DEVELOPMENT_RULES.md)](DEVELOPMENT_RULES.md)
*   [Security Rules (SECURITY_RULES.md)](SECURITY_RULES.md)
*   [Project Roadmap (PROJECT_ROADMAP.md)](PROJECT_ROADMAP.md)

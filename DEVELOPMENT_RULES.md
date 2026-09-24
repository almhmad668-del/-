# Development Rules

## 1. General Principles
*   **Simple over Complex:** Avoid premature optimization and unnecessary abstractions.
*   **Loose Coupling:** Keep modules, components, and services independent.
*   **No Duplication:** Do not duplicate business logic. If a rule exists in the database, do not try to perfectly replicate it in the frontend state.

## 2. Frontend (Next.js & React)
*   **Business Logic:** Keep business logic OUT of UI components. Use custom hooks or service functions.
*   **Data Fetching:** Prefer Server Components for initial data loads. Use Client Components only when interactivity is required.
*   **State:** Do not store authoritative business data (like cart totals or inventory) only in browser storage.
*   **File Size:** Avoid giant files. Break down large components into smaller, focused modules.
*   **Styling:** Use Tailwind CSS. Follow a mobile-first, responsive design approach. Ensure RTL readiness for Arabic/Turkish.

## 3. Database (PostgreSQL)
*   **Source of Truth:** PostgreSQL is the ultimate source of truth.
*   **Data Types:** Never use floating-point (`FLOAT`, `REAL`) for currency. Always use `NUMERIC` or `DECIMAL`.
*   **Soft Deletion:** Only use soft deletion where legally or operationally justified (e.g., auditing). Otherwise, rely on foreign key constraints.

## 4. Code Quality & Commits
*   **Linting/Formatting:** Code must pass ESLint and Prettier checks before committing.
*   **Type Safety:** Strict TypeScript must be used. Avoid `any`.
*   **Git:** Follow atomic commit principles. Write descriptive commit messages.

## 5. Comments
*   Add comments only where they provide meaningful architectural context or explain *why* a complex decision was made. Self-documenting code is preferred for *what* the code does.
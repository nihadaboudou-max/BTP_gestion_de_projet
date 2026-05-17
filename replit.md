# Workspace

## Overview

HAIROU - Gestion BTP: A full-stack construction management platform. Built with React + Vite frontend, Express backend, PostgreSQL database, Socket.io for real-time, and JWT authentication.

## All Pages (Complete)

- `/login` — JWT login with link to register page
- `/register` — Public self-registration (creates PENDING account, awaits admin approval)
- `/dashboard` — Admin/Chef: Stats, activity log, chart. Ouvrier: simplified view with presence confirmation card, tasks, notifications
- `/projets` — Projects grid with create form
- `/taches` — Kanban board (by priority)
- `/pointage` — Chef/Admin: list of attendance sheets with "Nouveau Pointage" button. Ouvrier: read-only monthly history table (month/year filter) with summary stats and per-entry "Réclamer" modal
- `/pointage/new` — Full pointage creation form: Step 1 project+date; Step 2 worker cards (Présent/Demi-j./Absent toggles, arrival/departure times, per-worker signature canvases, PAR_JOUR/PAR_TACHE pay mode, live amount calc, overtime/late alerts); Step 3 summary table with totals; Step 4 chef signature canvas; sticky submit bar
- `/pointage/:id` — Detail view with expandable entries: arrival/departure times, pay mode (PAR_JOUR/PAR_TACHE), hours, overtime, amount due, chef signature, reclamations modal per entry; PDF export button
- `/depenses` — Expenses table; ADMIN sees Valider button → approve/reject modal
- `/personnel` — Worker cards with add/edit
- `/messages` — Two-pane inbox; send to any user
- `/notifications` — Notification list with mark-read
- `/administration` — User management + pending accounts approval section (ADMIN only)

## Key Architecture Notes

- **Auth**: `setAuthTokenGetter` from `@workspace/api-client-react` is used (NOT window.fetch override) — preserves Content-Type on all POST requests
- **User status**: PENDING → APPROVED or REJECTED; PENDING users cannot login (403)
- **Role-based nav**: OUVRIER sees 4 items (Dashboard, Tâches, Pointage, Messages); Admin/Chef see full nav; Admin nav includes Administration
- **Notification badge**: shows unread count from `/api/notifications` (polling every 30s)
- **Pointage pay modes**: PAR_JOUR (hours × wage) or PAR_TACHE (task amount × progress%)
- **Pointage locking**: approved sheets are `locked = true` and cannot be edited
- **Chef signature**: `POST /api/pointage/:id/sign-chef` stores `chefSignature + chefSignedAt`
- **Reclamations**: per-entry modal → `POST /api/reclamations`; admin can respond via `PUT /api/reclamations/:id/respond`
- **Presence confirmations**: `POST /api/presence-confirmations` (upsert per worker+date)
- **Backend field mapping**: personnel route accepts both `speciality`/`trade` and `nationalId`/`idNumber` from OpenAPI generated client
- **Messages**: stored as single `content` field; frontend sends `subject`+`body` → backend stores as `[subject] body`
- **All routes**: defensive `req.body ?? {}` on all destructuring
- **Socket.io path**: `/api/socket.io`, rooms: `user:{userId}`; broadcasts `refresh:projects`, `refresh:tasks`, `refresh:notifications`, `refresh:pointage` to all clients; `notification` to per-user room
- **Real-time sync**: `useSocket()` hook in `src/hooks/use-socket.ts` listens for refresh events → calls `queryClient.invalidateQueries`
- **Task confirmation flow**: `POST /api/tasks/:id/confirm` → sets `confirmedAt = now`, `status = EN_COURS`
- **Task status enum (DB)**: `A_FAIRE, EN_COURS, BLOQUEE, TERMINEE`
- **Task priority enum (DB)**: `BASSE, NORMALE, HAUTE, URGENTE`
- **Null dates**: `nullDate()` helper in routes converts `""` / `undefined` → `null` before inserting
- **Chef permissions**: `can_add_projects = true` by default; chef sees ALL projects/tasks
- **Seed**: `seedIfEmpty()` auto-creates 3 default users; also auto-migrates status=APPROVED for existing users

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: JWT + bcrypt
- **Real-time**: Socket.io
- **Frontend**: React 18 + Vite + Tailwind CSS + Lucide Icons + Recharts + react-signature-canvas

## Default Credentials

- **Admin**: admin@hairou.com / Admin2024!
- **Chef de Chantier**: chef@hairou.com / Chef2024!
- **Ouvrier**: ouvrier@hairou.com / Chef2024!

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (port 8080, /api)
│   └── hairou-btp/         # React + Vite frontend (port 18255, /)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
└── package.json
```

## Modules

1. **Authentication + Registration** - JWT, role-based (ADMIN, CHEF_CHANTIER, OUVRIER), public self-registration with admin approval workflow
2. **Dashboard** - Admin/Chef: KPIs, activity feed, chart. Ouvrier: presence confirmation, tasks, notifications
3. **Projects (Chantiers)** - Full CRUD, budget tracking
4. **Tasks** - Linked to projects, priorities, assignment, ouvrier confirmation
5. **Pointage avancé** - Attendance with arrival/departure times, pay mode (day/task), overtime, chef signature, admin approval, locking
6. **Reclamations** - Per-pointage-entry complaints with admin responses
7. **Presence Confirmations** - Workers confirm next-day presence from dashboard
8. **Personnel** - Worker database with wage tracking
9. **Expenses** - With admin validation workflow
10. **Messages** - Real-time via Socket.io
11. **Notifications** - Real-time, role-aware with unread count badge
12. **Administration** - User management, permissions matrix, pending account approval

## Database Schema Tables

- users (+ status, phone, rejectionReason, approvedAt, approvedById)
- projects, tasks, personnel, personnel_projects
- pointage_sheets (+ chefSignature, chefSignedAt, locked)
- pointage_entries (+ arrivalSignature, departureSignature, payMode, overtimeHours, taskId, taskAmount, taskProgressPct, amountDue)
- expenses, messages, notifications, activity_logs
- reclamations (workerId, sheetId, type, description, status, adminResponse)
- presence_confirmations (workerId, projectId, date, status)

## API Routes

- `POST /api/auth/login` - Login (checks status=APPROVED)
- `POST /api/auth/register` - Public registration (creates PENDING)
- `GET /api/auth/me` - Current user
- `POST /api/auth/refresh` - Refresh token
- `GET/POST /api/users` - User management
- `GET /api/users/pending` - List pending accounts (admin)
- `POST /api/users/:id/approve` - Approve with permissions (admin)
- `POST /api/users/:id/reject` - Reject with reason (admin)
- `GET/POST /api/projects` - Projects
- `GET/POST /api/tasks` - Tasks
- `POST /api/tasks/:id/confirm` - Ouvrier confirms task
- `GET/POST /api/pointage` - Pointage sheets
- `POST /api/pointage/:id/sign-chef` - Chef signature (without submitting)
- `POST /api/pointage/:id/submit` - Submit sheet with signature
- `POST /api/pointage/:id/approve` - Approve/reject sheet (locks if approved)
- `GET/POST /api/reclamations` - Reclamations
- `PUT /api/reclamations/:id/respond` - Admin response
- `GET/POST /api/presence-confirmations` - Worker presence confirmations
- `GET/POST /api/personnel` - Personnel
- `GET/POST /api/expenses` - Expenses
- `POST /api/expenses/:id/validate` - Validate expense
- `GET/POST /api/messages` - Messages
- `GET /api/notifications` - Notifications
- `GET /api/dashboard/stats` - Dashboard stats
- `GET /api/activity` - Activity logs

## Color Palette

- Navy: #011638 (primary / sidebar)
- Dark Green: #2E5339
- Light Beige: #EAF0CE
- Blue Gray: #7C98B3
- Off White: #F4FFF8
- Teal: #0B5563

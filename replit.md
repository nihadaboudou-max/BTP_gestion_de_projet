# Workspace

## Overview

HAIROU - Gestion BTP: A full-stack construction management platform. Built with React + Vite frontend, Express backend, PostgreSQL database, Socket.io for real-time, and JWT authentication.

## All Pages (Complete)

- `/login` — JWT login (admin@hairou.com, chef@hairou.com, ouvrier@hairou.com)
- `/dashboard` — Stats, activity log, chart
- `/projets` — Projects grid with create form
- `/taches` — Kanban board (by priority)
- `/pointage` — Daily attendance sheets with signature & approval
- `/pointage/:id` — Detail view for a single sheet
- `/depenses` — Expenses table; ADMIN sees Valider button → approve/reject modal
- `/personnel` — Worker cards with add/edit; supports speciality→trade field mapping
- `/messages` — Two-pane inbox; send to any user
- `/notifications` — Notification list with mark-read
- `/administration` — User management (create, edit, delete, permissions) — ADMIN only

## Key Architecture Notes

- **Auth**: `setAuthTokenGetter` from `@workspace/api-client-react` is used (NOT window.fetch override) — preserves Content-Type on all POST requests
- **Backend field mapping**: personnel route accepts both `speciality`/`trade` and `nationalId`/`idNumber` from OpenAPI generated client; FREELANCE contract type maps to CDD
- **Messages**: stored as single `content` field; frontend sends `subject`+`body` → backend stores as `[subject] body`
- **All routes**: defensive `req.body ?? {}` on all destructuring
- **Socket.io path**: `/api/socket.io`, rooms: `user:{userId}`

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
- **Frontend**: React 18 + Vite + Tailwind CSS + Lucide Icons + Recharts

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

1. **Authentication** - JWT, role-based (ADMIN, CHEF_CHANTIER, OUVRIER)
2. **Dashboard** - KPIs, live activity feed, project summaries
3. **Projects (Chantiers)** - Full CRUD, budget tracking
4. **Tasks** - Linked to projects, priorities, assignment
5. **Pointage** - Attendance/timesheet with electronic signature
6. **Personnel** - Worker database with wage tracking
7. **Expenses** - With admin validation workflow
8. **Messages** - Real-time via Socket.io
9. **Notifications** - Real-time, role-aware
10. **Administration** - User management, permissions matrix

## Database Schema Tables

- users, projects, tasks, personnel, personnel_projects
- pointage_sheets, pointage_entries
- expenses, messages, notifications, activity_logs

## API Routes

- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Current user
- `POST /api/auth/refresh` - Refresh token
- `GET/POST /api/users` - User management
- `GET/POST /api/projects` - Projects
- `GET/POST /api/tasks` - Tasks
- `GET/POST /api/pointage` - Pointage sheets
- `POST /api/pointage/:id/submit` - Submit sheet
- `POST /api/pointage/:id/approve` - Approve/reject sheet
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

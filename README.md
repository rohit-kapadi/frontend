# RadiologistsClub Frontend (Vite + React)

This folder contains the client application only.

## Workspace structure

- `/backend` -> Express API server
- `/frontend` -> Vite + React application

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

## Backend setup

```bash
cd backend
npm install
npm start
```

## Case management features

- Sidebar includes a collapse/expand toggle to increase workspace for data tables.
- Case management table supports:
  - Active Cases and Submitted / History tabs for decluttered workflows
  - Compact columns with fixed-height scrolling and zebra striping
  - Emergency-priority row highlighting and default emergency-first sorting
  - Global search (patient name, case ID, study name)
  - Single-row modality/status filters and quick-sort controls
  - Role-adaptive columns and actions:
    - Admin/Centre: Mobile column + role/status-gated Edit icon
    - Doctor: Centre Name column + Pick/Reject/Ignore queue actions with Start Work for assigned items
  - Doctor reject flow uses an in-table remark popup and stores audit text in `cases.reject_remark`.
  - Doctor ignored queue supports local hide/restore via minus/plus toggle without changing case remark text.
  - Doctor Start Work opens a read-only case details modal with editable `doctor_impression`, plus Save/Submit actions.
  - Centre users can reopen submitted cases from the Submitted / History tab.
  - Reopen flow uses the edit modal with a mandatory reopen message and shows a success banner above the table.
  - Eye action opens an expanded attachment viewer modal with multi-file image/PDF browsing.
  - Submitted tab includes a placeholder download-report action per row.
- Edit workflow reuses the case modal in edit mode with multi-file investigation scan uploads.
  - Existing attachments are shown as removable chips in edit/reopen mode.
  - All date/time cells use `DD-Mmm-YYYY, hh:mm:ss A` display format.
  - Uploaded files are stored in the `case-scans` bucket.
  - Each uploaded file is tracked as a new `report_attachments` row linked by `case_id`.

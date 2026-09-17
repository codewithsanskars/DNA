# File uploads: résumés & job descriptions

Two upload flows, implemented near-identically in
`backend/src/middleware/upload.middleware.ts`.

| | Résumé | Job description |
|---|---|---|
| Field name (multipart) | `resume` | `jobDescription` |
| Upload route | `POST /api/candidates/:id/resume` | `POST /api/jobs/:id/description` |
| Download route | `GET /api/candidates/:id/resume` | `GET /api/jobs/:id/description` |
| Delete route | `DELETE /api/candidates/:id/resume` | `DELETE /api/jobs/:id/description` |
| Who can upload | `CLIENT`, `ADMIN` | **`CLIENT` only** — the owning client, not SWFS staff (`requireExactRole('CLIENT')`) |
| Disk directory | `backend/uploads/resumes/` | `backend/uploads/job-descriptions/` |
| Entity columns | `Candidate.resumeUrl` / `resumeFileName` | `Job.jdUrl` / `jdFileName` |

## Storage

- `multer.diskStorage` writes to a fixed directory (created with
  `fs.mkdirSync({ recursive: true })` at module load, so it exists before
  the first request).
- The on-disk filename is a random `crypto.randomUUID()` plus the original
  extension — **never** the original filename. The original filename is
  kept only in the `*FileName` DB column, for display and for the
  `Content-Disposition` header on download (`res.download(filePath,
  file.fileName)`).
- The entity's `*Url` column despite the name is **not a public URL** — it's
  the stored filename. Files are only ever reachable through the
  authenticated, org-scoped download route; there is no static file mount
  serving `uploads/` directly.

## Validation

- Extension **and** MIME type must both be in the allow-list: `.pdf` /
  `application/pdf`, `.docx` /
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- 10MB max (`MAX_RESUME_SIZE` / `MAX_JD_SIZE`). Multer's `LIMIT_FILE_SIZE`
  error is caught and turned into a 400 with a friendly message
  (`uploadResume`/`uploadJobDescription` wrapper functions), rather than
  bubbling up as a generic 500.

## Replace & delete semantics

Uploading again **replaces** the file, it doesn't add a second one:
`candidateService.setResume` / `jobService.setDescriptionFile` fetch the
previous stored filename before writing the new DB reference, and the
controller deletes the old file from disk (`fs.unlink`, best-effort —
errors are swallowed) only after the DB update succeeds. If the DB update
throws, the just-uploaded temp file is cleaned up instead (`if (req.file)
fs.unlink(req.file.path, ...)` in the controller's `catch`).

Deleting clears the DB reference and removes the on-disk file the same way.
`deleteResume`/`deleteDescriptionFile` throw if there's nothing to delete
(the service checks for an existing file first).

## Operational notes

- `backend/uploads/` is local disk storage — it does **not** survive a
  redeploy on most PaaS/container platforms, and isn't shared across
  multiple backend instances. Before scaling horizontally or deploying
  somewhere with an ephemeral filesystem, move this to object storage
  (S3-compatible) behind the same authenticated-download-route pattern.
- Back up `backend/uploads/` alongside the database — résumé/JD files have
  no other copy.
- `.gitignore` should exclude `backend/uploads/*` (the seeded demo data has
  no accompanying files).

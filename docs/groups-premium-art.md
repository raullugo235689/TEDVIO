# Mis grupos: artwork and scope

The six-strip WebP in `apps/teacher-v2/src/features/groups/group-covers.webp` contains decorative crops of the AI-generated dashboard reference approved by the product owner in this conversation. All generated interface labels, metrics, institution logos, status pills and menus were excluded. It is local artwork (8,312 bytes), not a remote image dependency and not instructional anatomical content.

University marks still come exclusively from the existing authenticated institution association and `InstitutionIdentity`, with initials on missing/failed URLs. Metrics come from the existing teacher dashboard; absent summaries are shown as unavailable rather than synthetic student counts or grades.

Only the group catalogue is redesigned. Attendance, academic permissions, deletion confirmation and dependency checks, group IDs and live-class dock behavior are reused unchanged. No new database migrations, packages, external image requests, paid services or AI inference are introduced.

Filters deliberately use actual available attendance states (Con lista hoy, Sin lista hoy) and existing alert counts. This version does not invent group lifecycle states such as Próximo or Archivado, nor expose nonfunctional duplicate/archive actions. New view and sort controls are functional, and existing URL-based university/subject/search filters keep their behavior.

UPDATE "work_investigations"
SET "audit_status" = 'draft'
WHERE "audit_status" = 'needs_review';

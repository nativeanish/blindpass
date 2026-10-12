ALTER TABLE invoices ADD COLUMN IF NOT EXISTS scanner_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS invoices_scanner_queue ON invoices (scanner_checked_at ASC NULLS FIRST, created_at);

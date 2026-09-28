-- Sprint 232 (review follow-up) — FIN-028: database-level guarantees that
-- the same partner document or the same operational invoice is never
-- booked twice in KUF/KIF, even by concurrent requests with different
-- requestKeys. Partial unique indexes (not expressible in schema.prisma —
-- keep them when regenerating migrations): only live originals count;
-- storno mirrors and stornoed originals are excluded so a corrected
-- document can be booked again. Additive.
--
-- Rollback:
--   DROP INDEX "vat_book_entry_live_document_key";
--   DROP INDEX "vat_book_entry_live_invoice_key";

CREATE UNIQUE INDEX "vat_book_entry_live_document_key"
  ON "vat_book_entry" ("tenant_id", "legal_entity_id", "book_type", "partner_id", "document_number")
  WHERE "storno_of_id" IS NULL AND "status" <> 'STORNOED';

CREATE UNIQUE INDEX "vat_book_entry_live_invoice_key"
  ON "vat_book_entry" ("tenant_id", "invoice_id")
  WHERE "invoice_id" IS NOT NULL AND "storno_of_id" IS NULL AND "status" <> 'STORNOED';

-- Sprint 000 baseline migration.
-- Deliberately creates no business tables: the foundation sprint ships a
-- production-grade empty repository. This migration exists so that the
-- migration pipeline (deploy from an empty database) is exercised end to end
-- from the very first release.
SELECT 1;

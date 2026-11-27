-- Run this migration once against the existing TiDB database.
-- It adds richer student profile fields and persistent extracted resume text.
ALTER TABLE students
  ADD COLUMN phone VARCHAR(30) DEFAULT NULL,
  ADD COLUMN location VARCHAR(150) DEFAULT NULL,
  ADD COLUMN graduation_year SMALLINT DEFAULT NULL,
  ADD COLUMN career_objective TEXT DEFAULT NULL,
  ADD COLUMN experience_level VARCHAR(50) DEFAULT NULL,
  ADD COLUMN tools TEXT DEFAULT NULL,
  ADD COLUMN projects TEXT DEFAULT NULL,
  ADD COLUMN certifications TEXT DEFAULT NULL,
  ADD COLUMN preferred_roles TEXT DEFAULT NULL,
  ADD COLUMN linkedin_url VARCHAR(500) DEFAULT NULL,
  ADD COLUMN github_url VARCHAR(500) DEFAULT NULL,
  ADD COLUMN portfolio_url VARCHAR(500) DEFAULT NULL,
  ADD COLUMN resume_text MEDIUMTEXT DEFAULT NULL;

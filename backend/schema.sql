-- MySQL 8+ schema for AI-Based Internship and Job Recommendation System
CREATE DATABASE IF NOT EXISTS ai_job_system
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ai_job_system;

CREATE TABLE IF NOT EXISTS students (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password VARCHAR(255) NOT NULL,
  university VARCHAR(190) DEFAULT NULL,
  department VARCHAR(150) DEFAULT NULL,
  skills TEXT DEFAULT NULL,
  resume_path VARCHAR(500) DEFAULT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  location VARCHAR(150) DEFAULT NULL,
  graduation_year SMALLINT DEFAULT NULL,
  career_objective TEXT DEFAULT NULL,
  experience_level VARCHAR(50) DEFAULT NULL,
  tools TEXT DEFAULT NULL,
  projects TEXT DEFAULT NULL,
  certifications TEXT DEFAULT NULL,
  preferred_roles TEXT DEFAULT NULL,
  linkedin_url VARCHAR(500) DEFAULT NULL,
  github_url VARCHAR(500) DEFAULT NULL,
  portfolio_url VARCHAR(500) DEFAULT NULL,
  resume_text MEDIUMTEXT DEFAULT NULL,
  role ENUM('student','admin') NOT NULL DEFAULT 'student',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_students_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(190) NOT NULL,
  company VARCHAR(190) NOT NULL,
  job_type VARCHAR(60) DEFAULT NULL,
  location VARCHAR(190) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  required_skills TEXT DEFAULT NULL,
  source_name VARCHAR(120) DEFAULT 'Admin',
  source_url VARCHAR(1000) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_jobs_created_at (created_at),
  KEY idx_jobs_title (title),
  UNIQUE KEY uq_jobs_source_url (source_url(500))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS applications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  cover_letter TEXT DEFAULT NULL,
  status ENUM('Pending','Reviewed','Accepted','Rejected') NOT NULL DEFAULT 'Pending',
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_application_student_job (student_id, job_id),
  KEY idx_applications_status (status),
  CONSTRAINT fk_applications_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_applications_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS saved_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  saved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_saved_student_job (student_id, job_id),
  CONSTRAINT fk_saved_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_saved_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

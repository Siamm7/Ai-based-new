
require("./config");
const express = require("express");
const cors = require("cors");
const db = require("./db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 5000);

// Use an environment variable for the JWT secret in production.
const JWT_SECRET = process.env.JWT_SECRET || "development_only_change_me";
if (process.env.NODE_ENV === "production" && JWT_SECRET === "development_only_change_me") {
    throw new Error("Set a strong JWT_SECRET in production.");
}

const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map(x => x.trim()).filter(Boolean);
if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
    throw new Error("Set CORS_ORIGIN to the deployed frontend origin in production.");
}
app.use(cors({
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin is not allowed by CORS"));
    }
}));
app.use(express.json({ limit: "1mb" }));


// ==========================================
// HELPER FUNCTIONS
// ==========================================

function sendDatabaseError(res, error) {
    console.error(error);

    if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
            success: false,
            message: "This record already exists!"
        });
    }

    res.status(500).json({
        success: false,
        message: "A database error occurred!"
    });
}

function isValidId(id) {
    return /^\d+$/.test(String(id)) && Number(id) > 0;
}


// ==========================================
// JWT AUTHENTICATION
// ==========================================

function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Access denied! Please login first."
        });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, JWT_SECRET, function(error, decoded) {
        if (error) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token!"
            });
        }

        // Check the current account and role in the database.
        const sql = "SELECT id, email, role FROM students WHERE id = ?";

        db.query(sql, [decoded.id], function(error, results) {
            if (error) {
                return sendDatabaseError(res, error);
            }

            if (results.length === 0) {
                return res.status(401).json({
                    success: false,
                    message: "Account not found!"
                });
            }

            req.user = results[0];
            next();
        });
    });
}


function verifyAdmin(req, res, next) {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Admin access required!"
        });
    }

    next();
}


// ==========================================
// RESUME UPLOAD CONFIGURATION
// ==========================================

const resumeFolder = path.join(__dirname, "uploads", "resumes");

if (!fs.existsSync(resumeFolder)) {
    fs.mkdirSync(resumeFolder, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function(req, file, callback) {
        callback(null, resumeFolder);
    },

    filename: function(req, file, callback) {
        const extension = path.extname(file.originalname).toLowerCase();
        const uniqueName =
            Date.now() + "-" + crypto.randomBytes(8).toString("hex");

        callback(null, uniqueName + extension);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: function(req, file, callback) {
        const extension = path.extname(file.originalname).toLowerCase();

        const allowedTypes = {
            ".pdf": ["application/pdf"],
            ".docx": [
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ]
        };

        if (
            allowedTypes[extension] &&
            allowedTypes[extension].includes(file.mimetype)
        ) {
            return callback(null, true);
        }

        callback(new Error("Only PDF and DOCX files are allowed!"));
    }
});

function deleteResumeFile(filePath) {
    if (!filePath) return;

    const fullPath = path.join(__dirname, filePath);

    fs.unlink(fullPath, function(error) {
        if (error && error.code !== "ENOENT") {
            console.error("Resume deletion failed:", error.message);
        }
    });
}


// ==========================================
// 1. HOME API
// ==========================================

app.get("/", function(req, res) {
    res.send("Backend is running!");
});


// ==========================================
// 2. TEST API
// ==========================================

app.get("/api/test", function(req, res) {
    res.json({
        success: true,
        message: "Backend API is working!"
    });
});


// ==========================================
// 3. STUDENT REGISTRATION API
// ==========================================

app.post("/api/students", async function(req, res) {
    const {
        full_name,
        email,
        password,
        university,
        department,
        skills
    } = req.body;

    if (!full_name || !email || !password) {
        return res.status(400).json({
            success: false,
            message: "Name, email and password are required!"
        });
    }

    const cleanName = String(full_name).trim();
    const cleanEmail = String(email).trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > 100) {
        return res.status(400).json({
            success: false,
            message: "Name must be between 2 and 100 characters!"
        });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({
            success: false,
            message: "Please enter a valid email address!"
        });
    }

    if (typeof password !== "string" || password.length < 8 || password.length > 72) {
        return res.status(400).json({
            success: false,
            message: "Password must be between 8 and 72 characters!"
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `
            INSERT INTO students
            (full_name, email, password, university, department, skills)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        db.query(
            sql,
            [
                cleanName,
                cleanEmail,
                hashedPassword,
                university || null,
                department || null,
                skills || null
            ],
            function(error, result) {
                if (error) return sendDatabaseError(res, error);

                res.status(201).json({
                    success: true,
                    message: "Student registered successfully!",
                    studentId: result.insertId
                });
            }
        );

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Registration failed!"
        });
    }
});


// ==========================================
// 4. STUDENT LOGIN API
// ==========================================

app.post("/api/login", function(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Email and password are required!"
        });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    const sql = "SELECT * FROM students WHERE email = ?";

    db.query(sql, [cleanEmail], async function(error, results) {
        if (error) return sendDatabaseError(res, error);

        if (results.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password!"
            });
        }

        try {
            const student = results[0];

            const isPasswordCorrect = await bcrypt.compare(
                password,
                student.password
            );

            if (!isPasswordCorrect) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid email or password!"
                });
            }

            const token = jwt.sign(
                {
                    id: student.id
                },
                JWT_SECRET,
                {
                    expiresIn: "1d"
                }
            );

            res.json({
                success: true,
                message: "Login successful!",
                token: token,
                student: {
                    id: student.id,
                    full_name: student.full_name,
                    email: student.email,
                    university: student.university,
                    department: student.department,
                    skills: student.skills,
                    resume_path: student.resume_path,
                    role: student.role
                }
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                success: false,
                message: "Login failed!"
            });
        }
    });
});


// ==========================================
// 5. GET ALL STUDENTS (ADMIN ONLY)
// ==========================================

app.get("/api/students", verifyToken, verifyAdmin, function(req, res) {
    const sql = `
        SELECT id, full_name, email, university,
               department, skills, resume_path, role, created_at
        FROM students
        ORDER BY created_at DESC
    `;

    db.query(sql, function(error, results) {
        if (error) return sendDatabaseError(res, error);

        res.json({
            success: true,
            students: results
        });
    });
});


// ==========================================
// 6. GET OWN STUDENT PROFILE
// ==========================================

app.get("/api/students/:id", verifyToken, function(req, res) {
    const studentId = req.params.id;

    if (!isValidId(studentId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid student ID!"
        });
    }

    if (Number(studentId) !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "You can only view your own profile!"
        });
    }

    const sql = `
        SELECT id, full_name, email, university,
               department, skills, resume_path, role, created_at
        FROM students
        WHERE id = ?
    `;

    db.query(sql, [studentId], function(error, results) {
        if (error) return sendDatabaseError(res, error);

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Student not found!"
            });
        }

        res.json({
            success: true,
            student: results[0]
        });
    });
});


// ==========================================
// 7. UPDATE OWN STUDENT PROFILE
// ==========================================

app.put("/api/students/:id", verifyToken, function(req, res) {
    const studentId = req.params.id;

    if (!isValidId(studentId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid student ID!"
        });
    }

    if (Number(studentId) !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "You can only update your own profile!"
        });
    }

    const {
        full_name,
        university,
        department,
        skills
    } = req.body;

    if (!full_name || String(full_name).trim().length < 2) {
        return res.status(400).json({
            success: false,
            message: "A valid full name is required!"
        });
    }

    const sql = `
        UPDATE students
        SET full_name = ?,
            university = ?,
            department = ?,
            skills = ?
        WHERE id = ?
    `;

    db.query(
        sql,
        [
            String(full_name).trim(),
            university || null,
            department || null,
            skills || null,
            studentId
        ],
        function(error, result) {
            if (error) return sendDatabaseError(res, error);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Student not found!"
                });
            }

            res.json({
                success: true,
                message: "Student profile updated successfully!"
            });
        }
    );
});


// ==========================================
// 8. UPLOAD OR REPLACE RESUME
// ==========================================

app.post("/api/students/:id/resume", verifyToken, function(req, res) {
    const studentId = req.params.id;

    if (!isValidId(studentId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid student ID!"
        });
    }

    if (Number(studentId) !== req.user.id) {
        return res.status(403).json({
            success: false,
            message: "You can only upload your own resume!"
        });
    }

    upload.single("resume")(req, res, function(uploadError) {
        if (uploadError) {
            return res.status(400).json({
                success: false,
                message: uploadError.message
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Please select a PDF or DOCX resume!"
            });
        }

        const newResumePath = path.join(
            "uploads",
            "resumes",
            req.file.filename
        ).replace(/\\/g, "/");

        const selectSql = "SELECT resume_path FROM students WHERE id = ?";

        db.query(selectSql, [studentId], function(error, results) {
            if (error) {
                deleteResumeFile(newResumePath);
                return sendDatabaseError(res, error);
            }

            if (results.length === 0) {
                deleteResumeFile(newResumePath);

                return res.status(404).json({
                    success: false,
                    message: "Student not found!"
                });
            }

            const oldResumePath = results[0].resume_path;

            const updateSql = `
                UPDATE students
                SET resume_path = ?
                WHERE id = ?
            `;

            db.query(updateSql, [newResumePath, studentId], function(error) {
                if (error) {
                    deleteResumeFile(newResumePath);
                    return sendDatabaseError(res, error);
                }

                if (oldResumePath && oldResumePath !== newResumePath) {
                    deleteResumeFile(oldResumePath);
                }

                res.json({
                    success: true,
                    message: "Resume uploaded successfully!",
                    resumePath: newResumePath
                });
            });
        });
    });
});


// ==========================================
// 9. GET RESUME INFORMATION
// ==========================================

app.get("/api/students/:id/resume", verifyToken, function(req, res) {
    const studentId = req.params.id;

    if (!isValidId(studentId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid student ID!"
        });
    }

    if (Number(studentId) !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "You cannot view this resume!"
        });
    }

    const sql = `
        SELECT id, full_name, resume_path
        FROM students
        WHERE id = ?
    `;

    db.query(sql, [studentId], function(error, results) {
        if (error) return sendDatabaseError(res, error);

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Student not found!"
            });
        }

        const student = results[0];

        if (!student.resume_path) {
            return res.json({
                success: true,
                message: "No resume uploaded yet!",
                resumePath: null
            });
        }

        res.json({
            success: true,
            message: "Resume found!",
            studentName: student.full_name,
            resumePath: student.resume_path,
            downloadEndpoint: `/api/students/${studentId}/resume/download`
        });
    });
});


// ==========================================
// 10. DOWNLOAD RESUME (PROTECTED)
// ==========================================

app.get("/api/students/:id/resume/download", verifyToken, function(req, res) {
    const studentId = req.params.id;

    if (Number(studentId) !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "You cannot download this resume!"
        });
    }

    const sql = "SELECT resume_path FROM students WHERE id = ?";

    db.query(sql, [studentId], function(error, results) {
        if (error) return sendDatabaseError(res, error);

        if (results.length === 0 || !results[0].resume_path) {
            return res.status(404).json({
                success: false,
                message: "Resume not found!"
            });
        }

        const filePath = path.resolve(__dirname, results[0].resume_path);

        if (!filePath.startsWith(resumeFolder + path.sep)) {
            return res.status(400).json({
                success: false,
                message: "Invalid resume path!"
            });
        }

        res.download(filePath, function(error) {
            if (error && !res.headersSent) {
                res.status(404).json({
                    success: false,
                    message: "Resume file could not be downloaded!"
                });
            }
        });
    });
});


// ==========================================
// 11. DELETE RESUME
// ==========================================

app.delete("/api/students/:id/resume", verifyToken, function(req, res) {
    const studentId = req.params.id;

    if (Number(studentId) !== req.user.id) {
        return res.status(403).json({
            success: false,
            message: "You can only delete your own resume!"
        });
    }

    const sql = `
        SELECT resume_path
        FROM students
        WHERE id = ?
    `;

    db.query(sql, [studentId], function(error, results) {
        if (error) return sendDatabaseError(res, error);

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Student not found!"
            });
        }

        if (!results[0].resume_path) {
            return res.status(404).json({
                success: false,
                message: "No resume to delete!"
            });
        }

        const oldResumePath = results[0].resume_path;

        db.query(
            "UPDATE students SET resume_path = NULL WHERE id = ?",
            [studentId],
            function(error) {
                if (error) return sendDatabaseError(res, error);

                deleteResumeFile(oldResumePath);

                res.json({
                    success: true,
                    message: "Resume deleted successfully!"
                });
            }
        );
    });
});


// ==========================================
// 12. GET ALL JOBS
// ==========================================

app.get("/api/jobs", function(req, res) {
    const sql = "SELECT * FROM jobs ORDER BY created_at DESC, id DESC";

    db.query(sql, function(error, results) {
        if (error) return sendDatabaseError(res, error);

        res.json({
            success: true,
            jobs: results
        });
    });
});


// ==========================================
// 13. GET SINGLE JOB
// ==========================================

app.get("/api/jobs/:id", function(req, res) {
    const jobId = req.params.id;

    if (!isValidId(jobId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid job ID!"
        });
    }

    db.query(
        "SELECT * FROM jobs WHERE id = ?",
        [jobId],
        function(error, results) {
            if (error) return sendDatabaseError(res, error);

            if (results.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Job not found!"
                });
            }

            res.json({
                success: true,
                job: results[0]
            });
        }
    );
});


// ==========================================
// 14. ADD JOB (ADMIN ONLY)
// ==========================================

app.post("/api/jobs", verifyToken, verifyAdmin, function(req, res) {
    const {
        title,
        company,
        job_type,
        location,
        description,
        required_skills
    } = req.body;

    if (!title || !company) {
        return res.status(400).json({
            success: false,
            message: "Job title and company are required!"
        });
    }

    const sql = `
        INSERT INTO jobs
        (title, company, job_type, location, description, required_skills)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [
            title,
            company,
            job_type || null,
            location || null,
            description || null,
            required_skills || null
        ],
        function(error, result) {
            if (error) return sendDatabaseError(res, error);

            res.status(201).json({
                success: true,
                message: "Job added successfully!",
                jobId: result.insertId
            });
        }
    );
});


// ==========================================
// 15. UPDATE JOB (ADMIN ONLY)
// ==========================================

app.put("/api/jobs/:id", verifyToken, verifyAdmin, function(req, res) {
    const jobId = req.params.id;

    if (!isValidId(jobId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid job ID!"
        });
    }

    const {
        title,
        company,
        job_type,
        location,
        description,
        required_skills
    } = req.body;

    if (!title || !company) {
        return res.status(400).json({
            success: false,
            message: "Job title and company are required!"
        });
    }

    const sql = `
        UPDATE jobs
        SET title = ?,
            company = ?,
            job_type = ?,
            location = ?,
            description = ?,
            required_skills = ?
        WHERE id = ?
    `;

    db.query(
        sql,
        [
            title,
            company,
            job_type || null,
            location || null,
            description || null,
            required_skills || null,
            jobId
        ],
        function(error, result) {
            if (error) return sendDatabaseError(res, error);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Job not found!"
                });
            }

            res.json({
                success: true,
                message: "Job updated successfully!"
            });
        }
    );
});


// ==========================================
// 16. DELETE JOB (ADMIN ONLY)
// ==========================================

app.delete("/api/jobs/:id", verifyToken, verifyAdmin, function(req, res) {
    const jobId = req.params.id;

    if (!isValidId(jobId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid job ID!"
        });
    }

    db.query(
        "DELETE FROM jobs WHERE id = ?",
        [jobId],
        function(error, result) {
            if (error) return sendDatabaseError(res, error);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Job not found!"
                });
            }

            res.json({
                success: true,
                message: "Job deleted successfully!"
            });
        }
    );
});


// ==========================================
// 17. APPLY FOR JOB
// ==========================================

app.post("/api/applications", verifyToken, function(req, res) {
    const { job_id, cover_letter } = req.body;
    const studentId = req.user.id;

    if (!isValidId(job_id)) {
        return res.status(400).json({
            success: false,
            message: "A valid job ID is required!"
        });
    }

    const sql = `
        INSERT INTO applications (student_id, job_id, cover_letter)
        VALUES (?, ?, ?)
    `;

    db.query(sql, [studentId, job_id, String(cover_letter || "").slice(0, 5000)], function(error, result) {
        if (error) {
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    success: false,
                    message: "You have already applied for this job!"
                });
            }

            if (error.code === "ER_NO_REFERENCED_ROW_2") {
                return res.status(404).json({
                    success: false,
                    message: "Job not found!"
                });
            }

            return sendDatabaseError(res, error);
        }

        res.status(201).json({
            success: true,
            message: "Job application submitted successfully!",
            applicationId: result.insertId
        });
    });
});


// ==========================================
// 18. GET OWN APPLICATIONS
// ==========================================

app.get("/api/applications", verifyToken, function(req, res) {
    const sql = `
        SELECT
            applications.id,
            applications.student_id,
            applications.job_id,
            applications.status,
            applications.applied_at,
            jobs.title,
            jobs.company,
            jobs.location,
            jobs.job_type
        FROM applications
        JOIN jobs ON applications.job_id = jobs.id
        WHERE applications.student_id = ?
        ORDER BY applications.applied_at DESC
    `;

    db.query(sql, [req.user.id], function(error, results) {
        if (error) return sendDatabaseError(res, error);

        res.json({
            success: true,
            applications: results
        });
    });
});


// ==========================================
// 19. SAVE JOB
// ==========================================

app.post("/api/saved-jobs", verifyToken, function(req, res) {
    const { job_id } = req.body;

    if (!isValidId(job_id)) {
        return res.status(400).json({
            success: false,
            message: "A valid job ID is required!"
        });
    }

    const sql = `
        INSERT INTO saved_jobs (student_id, job_id)
        VALUES (?, ?)
    `;

    db.query(sql, [req.user.id, job_id], function(error, result) {
        if (error) {
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    success: false,
                    message: "This job is already saved!"
                });
            }

            if (error.code === "ER_NO_REFERENCED_ROW_2") {
                return res.status(404).json({
                    success: false,
                    message: "Job not found!"
                });
            }

            return sendDatabaseError(res, error);
        }

        res.status(201).json({
            success: true,
            message: "Job saved successfully!",
            savedJobId: result.insertId
        });
    });
});


// ==========================================
// 20. GET SAVED JOBS
// ==========================================

app.get("/api/saved-jobs", verifyToken, function(req, res) {
    const sql = `
        SELECT
            saved_jobs.id AS saved_job_id,
            saved_jobs.saved_at,
            jobs.*
        FROM saved_jobs
        JOIN jobs ON saved_jobs.job_id = jobs.id
        WHERE saved_jobs.student_id = ?
        ORDER BY saved_jobs.saved_at DESC
    `;

    db.query(sql, [req.user.id], function(error, results) {
        if (error) return sendDatabaseError(res, error);

        res.json({
            success: true,
            savedJobs: results
        });
    });
});


// ==========================================
// 21. REMOVE SAVED JOB
// ==========================================

app.delete("/api/saved-jobs/:jobId", verifyToken, function(req, res) {
    const jobId = req.params.jobId;

    if (!isValidId(jobId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid job ID!"
        });
    }

    const sql = `
        DELETE FROM saved_jobs
        WHERE student_id = ? AND job_id = ?
    `;

    db.query(sql, [req.user.id, jobId], function(error, result) {
        if (error) return sendDatabaseError(res, error);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Saved job not found!"
            });
        }

        res.json({
            success: true,
            message: "Saved job removed successfully!"
        });
    });
});


// ==========================================
// 22. UPDATE APPLICATION STATUS (ADMIN)
// ==========================================

app.put(
    "/api/applications/:id",
    verifyToken,
    verifyAdmin,
    function(req, res) {
        const applicationId = req.params.id;
        const { status } = req.body;

        if (!isValidId(applicationId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid application ID!"
            });
        }

        const allowedStatuses = [
            "Pending",
            "Reviewed",
            "Accepted",
            "Rejected"
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid application status!"
            });
        }

        const sql = `
            UPDATE applications
            SET status = ?
            WHERE id = ?
        `;

        db.query(sql, [status, applicationId], function(error, result) {
            if (error) return sendDatabaseError(res, error);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Application not found!"
                });
            }

            res.json({
                success: true,
                message: "Application status updated successfully!"
            });
        });
    }
);


// ==========================================
// 23. ADMIN VIEW ALL APPLICATIONS
// ==========================================

app.get(
    "/api/admin/applications",
    verifyToken,
    verifyAdmin,
    function(req, res) {
        const sql = `
            SELECT
                applications.id,
                applications.student_id,
                students.full_name,
                students.email,
                jobs.id AS job_id,
                jobs.title,
                jobs.company,
                applications.status,
                applications.cover_letter,
                applications.applied_at
            FROM applications
            JOIN students
                ON applications.student_id = students.id
            JOIN jobs
                ON applications.job_id = jobs.id
            ORDER BY applications.applied_at DESC
        `;

        db.query(sql, function(error, results) {
            if (error) return sendDatabaseError(res, error);

            res.json({
                success: true,
                applications: results
            });
        });
    }
);


// ==========================================
// 24. ADMIN VIEW ALL SAVED JOBS
// ==========================================

app.get(
    "/api/admin/saved-jobs",
    verifyToken,
    verifyAdmin,
    function(req, res) {
        const sql = `
            SELECT
                saved_jobs.id,
                students.full_name,
                students.email,
                jobs.title,
                jobs.company,
                saved_jobs.saved_at
            FROM saved_jobs
            JOIN students
                ON saved_jobs.student_id = students.id
            JOIN jobs
                ON saved_jobs.job_id = jobs.id
            ORDER BY saved_jobs.saved_at DESC
        `;

        db.query(sql, function(error, results) {
            if (error) return sendDatabaseError(res, error);

            res.json({
                success: true,
                savedJobs: results
            });
        });
    }
);



// ==========================================
// PUBLIC JOB BOARD IMPORTERS
// Imports only published listings exposed by supported employer job-board feeds.
// ==========================================
function plainText(value) {
    return String(value || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim();
}

// Extract recognizable technical and workplace skills from a job description.
// This is a transparent dictionary-based extractor, not an AI/LLM classifier.
function extractRequiredSkills(description) {
    const text = String(description || "").toLowerCase();
    const skills = [
        ["JavaScript", /\bjavascript\b|\bjs\b/],
        ["TypeScript", /\btypescript\b/],
        ["Python", /\bpython\b/],
        ["Java", /\bjava\b/],
        ["C++", /\bc\+\+\b/],
        ["C#", /\bc#\b|\bc-sharp\b/],
        ["C", /\bc language\b|\blanguage c\b/],
        ["Go", /\bgolang\b|\bgo language\b/],
        ["Ruby", /\bruby\b/],
        ["PHP", /\bphp\b/],
        ["Swift", /\bswift\b/],
        ["Kotlin", /\bkotlin\b/],
        ["Rust", /\brust\b/],
        ["HTML", /\bhtml5?\b/],
        ["CSS", /\bcss3?\b/],
        ["React", /\breact(?:\.js)?\b/],
        ["Angular", /\bangular\b/],
        ["Vue.js", /\bvue(?:\.js)?\b/],
        ["Next.js", /\bnext\.js\b/],
        ["Node.js", /\bnode(?:\.js)?\b/],
        ["Express.js", /\bexpress(?:\.js)?\b/],
        ["Django", /\bdjango\b/],
        ["Flask", /\bflask\b/],
        ["FastAPI", /\bfastapi\b/],
        ["Spring", /\bspring(?: boot)?\b/],
        [".NET", /\.net\b|\bdotnet\b/],
        ["SQL", /\bsql\b/],
        ["MySQL", /\bmysql\b/],
        ["PostgreSQL", /\bpostgres(?:ql)?\b/],
        ["MongoDB", /\bmongodb\b/],
        ["Redis", /\bredis\b/],
        ["AWS", /\baws\b|\bamazon web services\b/],
        ["Azure", /\bazure\b/],
        ["Google Cloud", /\bgoogle cloud\b|\bgcp\b/],
        ["Docker", /\bdocker\b/],
        ["Kubernetes", /\bkubernetes\b/],
        ["Git", /\bgit\b/],
        ["Linux", /\blinux\b/],
        ["REST APIs", /\brest(?:ful)? apis?\b/],
        ["GraphQL", /\bgraphql\b/],
        ["Machine Learning", /\bmachine learning\b/],
        ["Deep Learning", /\bdeep learning\b/],
        ["Artificial Intelligence", /\bartificial intelligence\b|\bai\b/],
        ["NLP", /\bnatural language processing\b|\bnlp\b/],
        ["Data Analysis", /\bdata analysis\b|\bdata analytics\b/],
        ["Data Science", /\bdata science\b/],
        ["Pandas", /\bpandas\b/],
        ["NumPy", /\bnumpy\b/],
        ["TensorFlow", /\btensorflow\b/],
        ["PyTorch", /\bpytorch\b/],
        ["Scikit-learn", /\bscikit.learn\b|\bsklearn\b/],
        ["Computer Vision", /\bcomputer vision\b/],
        ["Figma", /\bfigma\b/],
        ["UI/UX Design", /\bui\/ux\b|\buser experience design\b/],
        ["Agile", /\bagile\b/],
        ["Scrum", /\bscrum\b/],
        ["Communication", /\bcommunication skills?\b/],
        ["Problem Solving", /\bproblem.solving\b/],
        ["Project Management", /\bproject management\b/],
        ["Leadership", /\bleadership\b/],
        ["Excel", /\bexcel\b/]
    ];

    return skills
        .filter(([, pattern]) => pattern.test(text))
        .map(([name]) => name)
        .join(", ")
        .slice(0, 1000);
}

function getJobRecords(provider, payload) {
    if (provider === "greenhouse") return payload.jobs || [];
    if (provider === "lever") return Array.isArray(payload) ? payload : [];
    if (provider === "ashby") return payload.jobs || [];
    if (provider === "recruitee") return payload.offers || [];
    if (provider === "workable") return payload.jobs || [];
    return [];
}

function normalizePublicJob(provider, item, board) {
    let title = "", company = board, location = "Not specified";
    let description = "", sourceUrl = "", category = "", employment = "";

    if (provider === "greenhouse") {
        title = item.title;
        location = (item.location && item.location.name) || location;
        description = plainText(item.content);
        sourceUrl = item.absolute_url;
        category = (item.departments || []).map(x => x.name).join(", ");
    } else if (provider === "lever") {
        title = item.text;
        location = (item.categories && item.categories.location) || location;
        description = plainText([item.description, ...(item.additional || []).map(x => x.content || "")].join(" "));
        sourceUrl = item.hostedUrl;
        category = (item.categories && item.categories.commitment) || "";
    } else if (provider === "ashby") {
        title = item.title;
        location = item.location || (item.isRemote ? "Remote" : location);
        description = plainText(item.descriptionPlain || item.descriptionHtml);
        sourceUrl = item.jobUrl || item.applyUrl;
        category = [item.department, item.team].filter(Boolean).join(", ");
        employment = item.employmentType || "";
    } else if (provider === "recruitee") {
        title = item.title;
        location = typeof item.location === "string" ? item.location :
            (item.location && (item.location.city || item.location.name)) || location;
        description = plainText(item.description || item.description_html);
        sourceUrl = item.careers_url || item.url || item.careers_apply_url;
        category = item.department || item.department_name || "";
        employment = item.employment_type || "";
    } else if (provider === "workable") {
        title = item.title;
        location = (item.location && (item.location.location_str || item.location.city)) || location;
        description = plainText(item.description || item.description_text);
        sourceUrl = item.url || item.application_url || item.shortlink;
        category = item.department || "";
        employment = item.employment_type || item.employmentType || "";
    }

    if (!title || !sourceUrl) return null;
    const typeText = String(employment + " " + category + " " + title);
    const jobType = /intern/i.test(typeText) ? "Internship" :
        (/part.?time/i.test(typeText) ? "Part-time" :
        (/contract/i.test(typeText) ? "Contract" : "Full-time"));

    return {
        title: String(title).slice(0, 190),
        company: String(item.company_name || item.company || company).slice(0, 190),
        jobType,
        location: String(location).slice(0, 190),
        description: String(description).slice(0, 12000),
        sourceUrl: String(sourceUrl).slice(0, 1000)
    };
}

async function importPublicJobs(req, res) {
    const provider = String(req.params.provider || "").toLowerCase();
    const input = String(req.params.board || "").trim();
    const supported = ["greenhouse", "lever", "ashby", "recruitee", "workable"];

    if (!supported.includes(provider)) {
        return res.status(400).json({ success: false, message: "Unsupported platform. Choose Greenhouse, Lever, Ashby, Recruitee or Workable." });
    }

    // Accept a company name, a board slug, or a provider-specific public careers URL.
    function resolveBoardIdentifier(value, source) {
        let candidate = value;
        if (/^https?:\/\//i.test(value)) {
            let url;
            try { url = new URL(value); } catch { throw new Error("That careers page URL is not valid."); }
            const host = url.hostname.toLowerCase().replace(/^www\./, "");
            const parts = url.pathname.split("/").filter(Boolean);
            if (source === "greenhouse" && (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io")) candidate = parts[0] || "";
            else if (source === "lever" && host === "jobs.lever.co") candidate = parts[0] || "";
            else if (source === "ashby" && host === "jobs.ashbyhq.com") candidate = parts[0] || "";
            else if (source === "recruitee" && host.endsWith(".recruitee.com")) candidate = host.slice(0, -".recruitee.com".length);
            else if (source === "workable" && (host === "apply.workable.com" || host === "www.workable.com")) candidate = parts[0] || "";
            else throw new Error("This URL does not look like a public " + source + " job-board URL. Choose the matching platform or paste its job-board URL.");
        } else {
            candidate = value.toLowerCase()
                .replace(/\b(incorporated|inc|corporation|corp|limited|ltd|llc)\b/g, " ")
                .trim()
                .replace(/[^a-z0-9_-]+/g, "-")
                .replace(/^-+|-+$/g, "");
        }
        if (!/^[a-zA-Z0-9_-]{2,80}$/.test(candidate)) {
            throw new Error("Could not identify the public job board. Try the company's exact name or its provider-specific careers URL.");
        }
        return candidate;
    }

    let board;
    try { board = resolveBoardIdentifier(input, provider); }
    catch (error) { return res.status(400).json({ success: false, message: error.message }); }

    const urls = {
        greenhouse: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`,
        lever: `https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`,
        ashby: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`,
        recruitee: `https://${encodeURIComponent(board)}.recruitee.com/api/offers`,
        workable: `https://www.workable.com/api/accounts/${encodeURIComponent(board)}?details=true`
    };

    try {
        const response = await fetch(urls[provider], {
            headers: { "Accept": "application/json", "User-Agent": "StudentJobRecommendationSystem/1.0" }
        });
        if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
        const payload = await response.json();
        const records = getJobRecords(provider, payload);
        if (!records.length) {
            return res.json({ success: true, imported: 0, message: "No public listings were returned. Check the board identifier and whether the company publishes a public job feed." });
        }

        const normalized = records.map(item => normalizePublicJob(provider, item, board)).filter(Boolean);
        const tasks = normalized.map(job => new Promise((resolve, reject) => {
            const sql = `INSERT INTO jobs
                (title,company,job_type,location,description,required_skills,source_name,source_url)
                VALUES (?,?,?,?,?,?,?,?)
                ON DUPLICATE KEY UPDATE title=VALUES(title), company=VALUES(company),
                job_type=VALUES(job_type), location=VALUES(location), description=VALUES(description), required_skills=VALUES(required_skills),
                source_name=VALUES(source_name)`;
            db.query(sql, [job.title, job.company, job.jobType, job.location, job.description, extractRequiredSkills(job.description), provider, job.sourceUrl],
                (error, result) => error ? reject(error) : resolve(result.affectedRows > 0));
        }));

        const results = await Promise.all(tasks);
        res.json({
            success: true,
            imported: results.filter(Boolean).length,
            message: `Processed ${normalized.length} valid public ${provider} listings from ${records.length} records.`
        });
    } catch (error) {
        console.error(`Public ${provider} import failed:`, error.message);
        res.status(502).json({ success: false, message: `Could not import this ${provider} board: ${error.message}` });
    }
}

app.post("/api/admin/import/:provider/:board", verifyToken, verifyAdmin, importPublicJobs);


// ==========================================
// SENTENCE-BERT + COSINE SIMILARITY RECOMMENDATIONS
// ==========================================

app.post("/api/recommendations", verifyToken, async function(req, res) {
    const cvText = String(req.body.cv_text || "").trim();

    if (cvText.length < 20 || cvText.length > 30000) {
        return res.status(400).json({
            success: false,
            message: "Please provide CV/resume text between 20 and 30,000 characters."
        });
    }

    const aiServiceUrl = String(process.env.AI_SERVICE_URL || "").replace(/\/+$/, "");

    if (!aiServiceUrl) {
        return res.status(503).json({
            success: false,
            message: "The AI recommendation service is not configured. Set AI_SERVICE_URL on the backend."
        });
    }

    db.query(
        "SELECT id, title, company, description, required_skills FROM jobs ORDER BY created_at DESC, id DESC",
        async function(error, jobs) {
            if (error) return sendDatabaseError(res, error);

            if (!jobs.length) {
                return res.json({
                    success: true,
                    recommendations: [],
                    message: "No jobs are available yet."
                });
            }

            try {
                const allRecommendations = [];
                const jobsToAnalyze = jobs.slice(0, 30);
                const batchSize = 30;

                for (let i = 0; i < jobsToAnalyze.length; i += batchSize) {
                    const jobBatch = jobsToAnalyze.slice(i, i + batchSize);

                    const aiResponse = await fetch(`${aiServiceUrl}/recommend`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Accept": "application/json"
                        },
                        body: JSON.stringify({
                            cv_text: cvText,
                            jobs: jobBatch
                        })
                    });

                    const responseText = await aiResponse.text();

                    let payload = {};
                    try {
                        payload = JSON.parse(responseText);
                    } catch (parseError) {
                        payload = { raw_response: responseText };
                    }

                    if (!aiResponse.ok) {
                        console.error("AI SERVICE STATUS:", aiResponse.status);
                        console.error("AI SERVICE RESPONSE:", responseText);

                        return res.status(502).json({
                            success: false,
                            message: payload.detail || payload.message || responseText
                        });
                    }

                    allRecommendations.push(
                        ...(payload.recommendations || [])
                    );
                }

                allRecommendations.sort(
                    (a, b) => b.match_score - a.match_score
                );

                return res.json({
                    success: true,
                    model: "sentence-transformers/all-MiniLM-L6-v2",
                    scoring: "70% semantic cosine similarity + 30% keyword skill overlap",
                    recommendations: allRecommendations
                });

            } catch (aiError) {
                console.error("AI service connection failed:", aiError);

                return res.status(502).json({
                    success: false,
                    message: "Could not connect to the AI recommendation service. Check AI_SERVICE_URL and ensure the AI service is running."
                });
            }
        }
    );
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

app.use(function(error, req, res, next) {
    console.error(error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        message: "An unexpected server error occurred!"
    });
});


// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, function() {
    console.log(`Server running on port ${PORT}`);
});

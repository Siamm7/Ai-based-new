require("./config");
const bcrypt = require("bcryptjs");
const db = require("./db");

(async () => {
  const name = process.env.ADMIN_NAME || "System Administrator";
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!email || password.length < 8) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 8 characters) in backend/.env.");
    process.exitCode = 1; db.end(); return;
  }
  const hash = await bcrypt.hash(password, 12);
  db.query(
    `INSERT INTO students (full_name,email,password,role) VALUES (?,?,?,'admin')
     ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), password=VALUES(password), role='admin'`,
    [name,email,hash],
    (err) => {
      if (err) { console.error(err.message); process.exitCode=1; }
      else console.log(`Admin account ready: ${email}`);
      db.end();
    }
  );
})();

require("./config");
const mysql = require("mysql2");

const connection = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "ai_job_system",
  charset: "utf8mb4",
  // TiDB Cloud Starter requires TLS on its public endpoint.
  ssl: process.env.NODE_ENV === "production"
    ? { minVersion: "TLSv1.2" }
    : undefined
});

connection.connect(error => {
  if (error) {
    console.error("Database connection failed:", error.message);
  } else {
    console.log(`Database connected: ${process.env.DB_NAME || "ai_job_system"}`);
  }
});

module.exports = connection;

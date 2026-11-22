# AI-Based Internship and Job Recommendation System

This version connects the student and admin pages to the Express/MySQL API. It removes the old browser-only job/application storage that caused records to differ between pages.

## Requirements

- Node.js 18 or newer
- MySQL 8 or newer
- A modern browser
- VS Code Live Server (or another static web server) for the frontend

## 1. Set up MySQL

Open MySQL Workbench or the MySQL command line and run `backend/schema.sql`.

This creates:
- `students` (accounts, roles, profile, resume path)
- `jobs` (job listings and source attribution)
- `applications` (one application per student per job)
- `saved_jobs`

The unique key on `(student_id, job_id)` is the database-level duplicate-application protection. Do not remove it.

If you already have an `ai_job_system` database with data, back it up before changing its schema. `CREATE TABLE IF NOT EXISTS` does not retrofit columns or indexes into older tables; compare the existing tables with `schema.sql` and migrate them deliberately rather than dropping the database.

## 2. Configure the backend

```bash
cd backend
copy .env.example .env
```

On macOS/Linux, use `cp .env.example .env`.

Edit `.env` and set your MySQL username/password and a long random `JWT_SECRET`. Then:

```bash
npm install
npm start
```

Check `http://localhost:5000/api/test`. It should return a JSON success response. Check the terminal for the MySQL connection message.

## 3. Create the first admin account

Set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `backend/.env`, then run:

```bash
npm run create-admin
```

If that script is not listed in your installed package scripts, run `node create-admin.js` from the `backend` directory. The admin account is stored with a bcrypt password hash. Do not share its password.

## 4. Run the frontend

Open the project folder in VS Code and use Live Server to open `index.html`.

The frontend API URL is in `config.js`:

```js
window.API_BASE_URL = "http://localhost:5000/api";
```

For deployment, replace it with your deployed backend URL ending in `/api`. Keep it on HTTPS.

## 5. Add jobs and import public job-board listings

Log in using the admin account and open `admin.html`.

- Add/edit/delete listings through the admin form.
- The importer supports public Greenhouse and Lever job-board endpoints. Enter the employer's board identifier (for example, the board slug), select the provider, and click Import.
- Importing only works when the employer exposes a public board and the provider returns its listings. It does not search every website or bypass logins, robots rules, paywalls, or access restrictions.
- Imported records are deduplicated by their source URL. The employer board slug is used as the company label because the public board APIs do not always expose a canonical legal company name.

## 4. Run the Sentence-BERT AI service (required for semantic recommendations)

The project now includes a separate Python AI service because Sentence-BERT is a Python model. The main application backend remains Node.js + Express, and Express securely proxies authenticated recommendation requests to this service.

```bash
cd ai-service
python -m venv .venv
# Windows:
.venv\\Scripts\\activate
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

The first startup downloads `sentence-transformers/all-MiniLM-L6-v2`; allow internet access and enough memory. Check `http://localhost:8000/health`.

Set `AI_SERVICE_URL=http://127.0.0.1:8000` in `backend/.env`, then restart the Node backend. The student must upload a readable PDF/DOCX resume from the Profile page; the browser extracts the text and stores it for the signed-in session/browser. On Explore Jobs, the frontend sends that text to the authenticated Express endpoint, which retrieves MySQL jobs and calls the AI service.

## Recommendation algorithm

1. **Sentence-BERT** (`all-MiniLM-L6-v2`) encodes the resume and each job's title, company, description and required skills into semantic embeddings.
2. **Cosine similarity** compares the resume embedding with each job embedding. The semantic score is the non-negative cosine similarity expressed as a percentage.
3. **Keyword matching** checks which explicit required skills appear in the resume text.
4. The final ranking score is `70% × semantic score + 30% × keyword score`.

The UI displays the final match percentage, semantic percentage, raw cosine similarity, keyword percentage, and matched/missing skills. This is a ranking score, not a probability of being hired. If no resume text is available or the AI service is not deployed, the UI falls back to the transparent profile-skill keyword score and does not claim that it is AI-generated.

## What is fixed in this version

- Registration and login now call the backend API; passwords are not stored in browser storage.
- Profiles and resume files are saved through authenticated backend endpoints.
- The Explore Jobs page loads listings from MySQL instead of the hard-coded demo array.
- Applications are saved to MySQL, tied to the logged-in student, and duplicate applications are rejected by the database unique key.
- My Applications loads the current account's records from the API.
- Admin job management and application status updates use protected API routes.
- Admin-only access is checked by the server, not just hidden in the UI.
- Greenhouse and Lever public-board import endpoints are available to admins.

## Important limitations / deployment notes

- Semantic recommendations require the separate Python AI service in `ai-service/`. Deploy and configure it using the instructions above; otherwise the frontend falls back to keyword matching.
- Resume upload is stored on the backend disk. On many cloud hosts, local disk is temporary; use persistent storage or object storage before production deployment.
- The project does not include email verification, password reset, rate limiting, automated tests, or production monitoring.
- Admin importer supports Greenhouse and Lever only. Other platforms require their own permitted API/feed integration.
- Do not deploy with the development JWT secret or a permissive CORS configuration.

## Deployment outline

1. Provision a managed MySQL database and run `backend/schema.sql`.
2. Deploy the `backend` folder to a Node.js host. Set `PORT`, `NODE_ENV=production`, `JWT_SECRET`, all `DB_*` variables, `CORS_ORIGIN`, and `AI_SERVICE_URL` to the deployed AI service base URL.
3. Deploy `ai-service/` as a Python service (start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`) and allow time for the model download. Set `AI_SERVICE_URL` on the Node backend to this service's public HTTPS URL.\n4. Create the admin account using the same production environment variables.
5. Deploy the project root as a static site. Update `config.js` to the production API URL before deploying.
6. Configure persistent resume storage before accepting real user uploads.

The code was syntax-checked locally. A live MySQL integration test and public hosting deployment were not possible in this environment because no database credentials or hosting account were provided.

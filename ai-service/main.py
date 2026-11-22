import os
from typing import Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

MODEL_NAME = os.getenv("SBERT_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
app = FastAPI(title="Job Recommendation AI Service", version="1.0.0")
model = None

class Job(BaseModel):
    id: int
    title: str = ""
    company: str = ""
    description: str = ""
    required_skills: Any = ""

class RecommendationRequest(BaseModel):
    cv_text: str = Field(min_length=20, max_length=30000)
    jobs: list[Job]

@app.on_event("startup")
def load_model():
    global model
    model = SentenceTransformer(MODEL_NAME)

def skills_list(value):
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    if not value:
        return []
    import json
    try:
        parsed = json.loads(value) if isinstance(value, str) else value
        if isinstance(parsed, list):
            return [str(x).strip() for x in parsed if str(x).strip()]
    except Exception:
        pass
    return [x.strip() for x in str(value).split(",") if x.strip()]

@app.get("/health")
def health():
    return {"success": True, "service": "sbert-cosine", "model": MODEL_NAME, "model_loaded": model is not None}

@app.post("/recommend")
def recommend(payload: RecommendationRequest):
    if model is None:
        raise HTTPException(status_code=503, detail="Sentence-BERT model is not loaded yet.")
    if not payload.jobs:
        return {"success": True, "model": MODEL_NAME, "recommendations": []}

    cv = payload.cv_text.strip()
    job_texts = []
    for job in payload.jobs:
        skills = skills_list(job.required_skills)
        combined = " ".join([job.title, job.company, job.description, "Required skills: " + ", ".join(skills)])
        job_texts.append(combined[:5000] or job.title or "Job")

    # Sentence-BERT creates dense semantic embeddings for the CV and each job.
    embeddings = model.encode([cv[:12000]] + job_texts, normalize_embeddings=True, convert_to_numpy=True)
    cv_embedding = embeddings[0].reshape(1, -1)
    job_embeddings = embeddings[1:]
    # Cosine similarity compares the CV embedding with each job embedding.
    semantic_scores = cosine_similarity(cv_embedding, job_embeddings)[0]

    cv_lower = cv.lower()
    results = []
    for index, job in enumerate(payload.jobs):
        skills = skills_list(job.required_skills)
        matched = [skill for skill in skills if skill.lower() in cv_lower]
        missing = [skill for skill in skills if skill.lower() not in cv_lower]
        keyword_score = (len(matched) / len(skills) * 100) if skills else 0.0
        semantic_score = max(0.0, min(100.0, float(semantic_scores[index]) * 100.0))
        # Weighted combination: semantic meaning + explicit skill overlap.
        final_score = 0.70 * semantic_score + 0.30 * keyword_score
        results.append({
            "job_id": job.id,
            "semantic_score": round(semantic_score, 2),
            "cosine_similarity": round(float(semantic_scores[index]), 4),
            "keyword_score": round(keyword_score, 2),
            "match_score": round(final_score, 2),
            "matched_skills": matched,
            "missing_skills": missing
        })
    results.sort(key=lambda item: item["match_score"], reverse=True)
    return {"success": True, "model": MODEL_NAME, "scoring": "70% semantic cosine similarity + 30% keyword skill overlap", "recommendations": results}

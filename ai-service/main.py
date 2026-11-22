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

@app.post("/recommend")
def recommend(payload: RecommendationRequest):
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="Sentence-BERT model is not loaded yet."
        )

    if not payload.jobs:
        return {
            "success": True,
            "model": MODEL_NAME,
            "recommendations": []
        }

    import gc

    cv = payload.cv_text.strip().lower()

    # Encode the CV only once.
    cv_embedding = model.encode(
        [cv[:12000]],
        normalize_embeddings=True,
        convert_to_numpy=True,
        batch_size=1
    )

    results = []
    batch_size = 8

    # Process jobs in small batches to reduce RAM usage.
    for start in range(0, len(payload.jobs), batch_size):
        batch = payload.jobs[start:start + batch_size]
        job_texts = []

        for job in batch:
            skills = skills_list(job.required_skills)

            combined = " ".join([
                str(job.title or ""),
                str(job.company or ""),
                str(job.description or ""),
                "Required skills: " + ", ".join(skills)
            ])

            job_texts.append(combined[:1500] or "Job")

        job_embeddings = model.encode(
            job_texts,
            normalize_embeddings=True,
            convert_to_numpy=True,
            batch_size=2
        )

        semantic_scores = cosine_similarity(
            cv_embedding, job_embeddings
        )[0]

        for index, job in enumerate(batch):
            skills = skills_list(job.required_skills)

            matched = [
                skill for skill in skills
                if skill.lower() in cv
            ]

            missing = [
                skill for skill in skills
                if skill.lower() not in cv
            ]

            keyword_score = (
                len(matched) / len(skills) * 100
            ) if skills else 0.0

            semantic_score = max(
                0.0,
                min(100.0, float(semantic_scores[index]) * 100.0)
            )

            final_score = (
                0.70 * semantic_score +
                0.30 * keyword_score
            )

            results.append({
                "job_id": job.id,
                "semantic_score": round(semantic_score, 2),
                "cosine_similarity": round(
                    float(semantic_scores[index]), 4
                ),
                "keyword_score": round(keyword_score, 2),
                "match_score": round(final_score, 2),
                "matched_skills": matched,
                "missing_skills": missing
            })

        del job_embeddings, job_texts, semantic_scores
        gc.collect()

    results.sort(
        key=lambda item: item["match_score"],
        reverse=True
    )

    return {
        "success": True,
        "model": MODEL_NAME,
        "scoring": "70% semantic cosine similarity + 30% keyword skill overlap",
        "recommendations": results
    }

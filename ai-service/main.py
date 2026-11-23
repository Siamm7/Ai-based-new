
import os
import gc
import json
import re
import numpy as np

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from fastembed import TextEmbedding

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

app = FastAPI(title="Job Recommendation AI Service", version="2.0.0")

model = None


class Job(BaseModel):
    id: int
    title: str = ""
    company: str = ""
    description: str = ""
    required_skills: object = ""


class RecommendationRequest(BaseModel):
    cv_text: str = Field(min_length=20, max_length=30000)
    jobs: list[Job]


@app.on_event("startup")
def load_model():
    global model
    model = TextEmbedding(
        model_name="sentence-transformers/all-MiniLM-L6-v2",
        threads=1
    )


def skills_list(value):
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]

    if not value:
        return []

    try:
        parsed = json.loads(value) if isinstance(value, str) else value
        if isinstance(parsed, list):
            return [str(x).strip() for x in parsed if str(x).strip()]
    except Exception:
        pass

    return [x.strip() for x in str(value).split(",") if x.strip()]


# Normalize common names and abbreviations without treating related technologies
# (for example, PostgreSQL and SQL) as interchangeable.
SKILL_ALIASES = {
    "javascript": ["javascript", "java script", "js"],
    "typescript": ["typescript", "type script"],
    "react": ["react", "react.js", "reactjs"],
    "node.js": ["node.js", "nodejs", "node js"],
    "next.js": ["next.js", "nextjs", "next js"],
    "vue.js": ["vue.js", "vuejs", "vue js"],
    "angular": ["angular", "angular.js", "angularjs"],
    "html": ["html", "html5"],
    "css": ["css", "css3"],
    "object-oriented programming": [
        "object-oriented programming",
        "object oriented programming",
        "oop"
    ],
    "c++": ["c++", "cpp"],
    "c#": ["c#", "c sharp"],
    "postgresql": ["postgresql", "postgres"],
    "mongodb": ["mongodb", "mongo db"],
    " amazon web services ": ["aws", "amazon web services"],
}

ALIAS_LOOKUP = {
    alias.strip(): canonical.strip()
    for canonical, aliases in SKILL_ALIASES.items()
    for alias in aliases
}


def normalize_skill_text(value):
    text = str(value or "").lower()

    for alias in sorted(ALIAS_LOOKUP, key=len, reverse=True):
        canonical = ALIAS_LOOKUP[alias]
        pattern = r"(?<![a-z0-9])" + re.escape(alias) + r"(?![a-z0-9])"
        text = re.sub(pattern, canonical, text)

    return re.sub(r"\s+", " ", text).strip()


def contains_skill(cv_text, required_skill):
    normalized_cv = normalize_skill_text(cv_text)
    normalized_skill = normalize_skill_text(required_skill)

    if not normalized_skill:
        return False

    pattern = (
        r"(?<![a-z0-9])"
        + re.escape(normalized_skill)
        + r"(?![a-z0-9])"
    )
    return re.search(pattern, normalized_cv) is not None


@app.get("/health")
def health():
    return {
        "success": True,
        "service": "fastembed-cosine",
        "model": MODEL_NAME,
        "model_loaded": model is not None
    }


@app.post("/recommend")
def recommend(payload: RecommendationRequest):
    if model is None:
        raise HTTPException(status_code=503, detail="AI model not loaded")

    if not payload.jobs:
        return {
            "success": True,
            "model": MODEL_NAME,
            "recommendations": []
        }

    cv = payload.cv_text.strip().lower()[:12000]

    cv_embedding = next(
        model.query_embed(cv)
    )

    results = []
    batch_size = 4

    for start in range(0, len(payload.jobs), batch_size):
        batch = payload.jobs[start:start + batch_size]

        job_texts = []
        batch_skills = []

        for job in batch:
            skills = skills_list(job.required_skills)
            batch_skills.append(skills)

            text = " ".join([
                job.title or "",
                job.company or "",
                job.description or "",
                "Required skills: " + ", ".join(skills)
            ])

            job_texts.append(text[:1500] or "Job")

        embeddings = list(model.embed(job_texts))

        for index, job in enumerate(batch):
            job_embedding = embeddings[index]

            semantic_score = float(
                np.dot(cv_embedding, job_embedding)
            ) * 100

            semantic_score = max(0.0, min(100.0, semantic_score))

            skills = batch_skills[index]

            matched = [
                skill for skill in skills
                if contains_skill(cv, skill)
            ]

            missing = [
                skill for skill in skills
                if not contains_skill(cv, skill)
            ]

            keyword_score = (
                len(matched) / len(skills) * 100
            ) if skills else 0.0

            final_score = (
                0.70 * semantic_score +
                0.30 * keyword_score
            )

            results.append({
                "job_id": job.id,
                "semantic_score": round(semantic_score, 2),
                "cosine_similarity": round(semantic_score / 100, 4),
                "keyword_score": round(keyword_score, 2),
                "match_score": round(final_score, 2),
                "matched_skills": matched,
                "missing_skills": missing
            })

        del embeddings, job_texts, batch_skills
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

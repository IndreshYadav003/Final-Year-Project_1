import json
import os
from datetime import date, datetime, timedelta
from typing import List, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


app = FastAPI(
    title="Wanderlust Travel Planner API",
    version="1.0.0",
    description="FastAPI backend for AI-generated travel itineraries using Claude.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TripRequest(BaseModel):
    destination: str = Field(..., example="Goa, India")
    departure_city: str = Field(..., example="New Delhi")
    start_date: date = Field(..., example="2026-12-20")
    duration_days: int = Field(..., ge=1, le=30, example=5)
    travelers: int = Field(..., ge=1, le=20, example=2)
    budget_amount: int = Field(..., ge=1000, example=40000)
    budget_category: str = Field(..., example="Mid-range")
    interests: List[str] = Field(default_factory=list, example=["Culture", "Food", "Nature"])
    accommodation_type: str = Field(..., example="Hotel (3 Star)")
    transport_preference: str = Field(..., example="Mixed")
    special_requirements: Optional[str] = Field(default=None, example="Vegetarian meals preferred")


class DayPlan(BaseModel):
    day: int
    date: str
    title: str
    activities: List[str]
    tips: List[str]
    estimated_day_budget: int


class BudgetBreakdown(BaseModel):
    hotel: int
    food: int
    local_transport: int
    activities: int
    miscellaneous: int
    total: int


class ItineraryResponse(BaseModel):
    source: str
    summary: str
    itinerary: List[DayPlan]
    travel_tips: List[str]
    budget_breakdown: BudgetBreakdown
    raw_model_output: Optional[str] = None


def build_prompt(payload: TripRequest) -> str:
    interests = ", ".join(payload.interests) if payload.interests else "General sightseeing"
    special = payload.special_requirements or "No special requirements provided."
    return f"""
You are an expert AI travel planner.

Create a realistic, practical, and personalized itinerary for the following trip.

Trip details:
- Destination: {payload.destination}
- Departure city: {payload.departure_city}
- Start date: {payload.start_date.isoformat()}
- Duration: {payload.duration_days} days
- Travelers: {payload.travelers}
- Budget amount: INR {payload.budget_amount}
- Budget category: {payload.budget_category}
- Interests: {interests}
- Accommodation type: {payload.accommodation_type}
- Transport preference: {payload.transport_preference}
- Special requirements: {special}

Requirements:
- Return a concise trip summary.
- Create a day-by-day itinerary with a short title for each day.
- For each day, include 3 to 5 activity bullet points with practical timing language.
- Add 1 to 2 daily tips.
- Estimate a day budget in INR for each day.
- Include final travel tips.
- Include a budget breakdown with hotel, food, local_transport, activities, miscellaneous, and total in INR.
- Stay within the user's budget as closely as possible.

Respond strictly in valid JSON with this shape:
{{
  "summary": "string",
  "itinerary": [
    {{
      "day": 1,
      "date": "YYYY-MM-DD",
      "title": "string",
      "activities": ["string"],
      "tips": ["string"],
      "estimated_day_budget": 0
    }}
  ],
  "travel_tips": ["string"],
  "budget_breakdown": {{
    "hotel": 0,
    "food": 0,
    "local_transport": 0,
    "activities": 0,
    "miscellaneous": 0,
    "total": 0
  }}
}}
""".strip()


def call_claude(prompt: str) -> dict:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured.")

    model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
    max_tokens = int(os.getenv("ANTHROPIC_MAX_TOKENS", "2500"))

    body = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": 0.4,
        "messages": [{"role": "user", "content": prompt}],
    }

    request = Request(
        url="https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=502, detail=f"Claude API HTTP error: {details}") from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f"Claude API connection error: {exc.reason}") from exc

    text_chunks = [
        block.get("text", "")
        for block in data.get("content", [])
        if isinstance(block, dict) and block.get("type") == "text"
    ]
    raw_text = "\n".join(chunk for chunk in text_chunks if chunk).strip()
    if not raw_text:
        raise HTTPException(status_code=502, detail="Claude API returned an empty response.")

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail="Claude API returned non-JSON content. Tighten the prompt or add response post-processing.",
        ) from exc

    parsed["raw_model_output"] = raw_text
    return parsed


def generate_demo_itinerary(payload: TripRequest) -> dict:
    base_date = payload.start_date
    per_day = max(payload.budget_amount // max(payload.duration_days, 1), 1500)
    interests = payload.interests or ["Culture", "Food", "Nature"]

    itinerary = []
    for day in range(payload.duration_days):
        current_date = base_date + timedelta(days=day)
        primary_interest = interests[day % len(interests)]
        itinerary.append(
            {
                "day": day + 1,
                "date": current_date.isoformat(),
                "title": f"Day {day + 1} - {primary_interest} Highlights in {payload.destination}",
                "activities": [
                    f"08:30 AM - Breakfast near your stay and plan the day's route.",
                    f"10:00 AM - Explore a top {primary_interest.lower()} attraction in {payload.destination}.",
                    f"01:30 PM - Lunch at a well-rated local restaurant matching your budget.",
                    f"04:00 PM - Leisure walk, local shopping, or photo stop based on your interests.",
                    f"07:30 PM - Dinner and light evening exploration before returning to your accommodation.",
                ],
                "tips": [
                    f"Use {payload.transport_preference.lower()} transport to save time between stops.",
                    "Keep some budget buffer for entry fees, snacks, and local transfers.",
                ],
                "estimated_day_budget": per_day,
            }
        )

    hotel = int(payload.budget_amount * 0.35)
    food = int(payload.budget_amount * 0.2)
    local_transport = int(payload.budget_amount * 0.15)
    activities = int(payload.budget_amount * 0.2)
    miscellaneous = payload.budget_amount - (hotel + food + local_transport + activities)

    return {
        "summary": (
            f"A {payload.duration_days}-day personalized trip to {payload.destination} for "
            f"{payload.travelers} traveler(s), balanced around {', '.join(interests)} "
            f"within an estimated INR {payload.budget_amount} budget."
        ),
        "itinerary": itinerary,
        "travel_tips": [
            "Book major attractions and transport in advance during peak travel periods.",
            "Carry both digital payment options and some local cash for smaller vendors.",
            "Check local weather the night before each day to adjust outdoor plans.",
        ],
        "budget_breakdown": {
            "hotel": hotel,
            "food": food,
            "local_transport": local_transport,
            "activities": activities,
            "miscellaneous": miscellaneous,
            "total": payload.budget_amount,
        },
        "raw_model_output": None,
    }


@app.get("/")
def root() -> dict:
    return {
        "message": "Wanderlust backend is running.",
        "docs": "/docs",
        "health": "/health",
        "generate_itinerary": "/api/itinerary",
    }


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "anthropic_configured": bool(os.getenv("ANTHROPIC_API_KEY")),
    }


@app.post("/api/itinerary", response_model=ItineraryResponse)
def create_itinerary(payload: TripRequest) -> ItineraryResponse:
    prompt = build_prompt(payload)

    try:
        if os.getenv("ANTHROPIC_API_KEY"):
            result = call_claude(prompt)
            result["source"] = "claude"
        else:
            result = generate_demo_itinerary(payload)
            result["source"] = "demo"
    except RuntimeError:
        result = generate_demo_itinerary(payload)
        result["source"] = "demo"

    try:
        return ItineraryResponse(**result)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Generated itinerary could not be validated: {exc}",
        ) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)

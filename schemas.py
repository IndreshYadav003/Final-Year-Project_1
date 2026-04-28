from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


# ── Auth Schemas ──────────────────────────────────────────────
class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


# ── Trip Schemas ──────────────────────────────────────────────
class TripCreateRequest(BaseModel):
    destination: str
    days: int
    budget: int
    travel_style: Optional[str] = "balanced"  # budget / balanced / luxury


class TripResponse(BaseModel):
    id: int
    destination: str
    days: int
    budget: int
    travel_style: str
    itinerary: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Destination Schemas ───────────────────────────────────────
class DestinationResponse(BaseModel):
    id: int
    name: str
    country: str
    description: Optional[str]
    category: Optional[str]
    avg_budget: Optional[int]
    emoji: Optional[str]
    rating: Optional[str]

    class Config:
        from_attributes = True

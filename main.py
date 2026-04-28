from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine
import models
from routes import auth, trips, destinations

# Create all database tables on startup
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Wanderlust API",
    description="Backend for the Wanderlust Smart Travel Planner",
    version="1.0.0",
)

# ── CORS — allow your frontend to talk to this backend ────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(trips.router)
app.include_router(destinations.router)


@app.get("/", tags=["Health"])
def root():
    return {
        "status": "✅ Wanderlust API is running",
        "docs": "/docs",
        "version": "1.0.0"
    }

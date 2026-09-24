"""Single-origin Devnet app: serve the built game and its API from one process."""

from pathlib import Path

from fastapi.staticfiles import StaticFiles
from starlette.applications import Starlette
from starlette.routing import Mount

from app.main import app as api_app


FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def create_hosted_app(frontend_dist: Path = FRONTEND_DIST, backend=api_app) -> Starlette:
    return Starlette(routes=[
        Mount("/api", app=backend),
        Mount("/", app=StaticFiles(directory=frontend_dist, html=True)),
    ])


app = create_hosted_app()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.imports import router as imports_router
from app.config import settings
from app.database import init_db


app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(imports_router)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/")
def root():
    return {"app": settings.APP_NAME, "status": "running"}


# TODO: Import nhieu file CSV.
# TODO: Xu ly CSV bang Polars.
# TODO: Tao bang du lieu theo tung loai file import.
# TODO: Tong hop bao cao.
# TODO: Xuat Excel.
# TODO: Dong goi chay offline.

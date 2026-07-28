from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.customer_processing import router as customer_processing_router
from app.api.cif import router as cif_router
from app.api.dashboard import router as dashboard_router
from app.api.health import router as health_router
from app.api.imports import router as imports_router
from app.config import settings
from app.database import init_db
from app.imports.importer import enqueue_pending_import_files, start_import_workers
from app.seed_data import seed_initial_data


app = FastAPI(
    title=settings.APP_NAME,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(imports_router)
app.include_router(customer_processing_router)
app.include_router(cif_router)
app.include_router(admin_router)
app.include_router(dashboard_router)


@app.on_event("startup")
def on_startup():
    init_db()
    seed_initial_data()
    start_import_workers()
    enqueue_pending_import_files()


@app.get("/")
def root():
    return {"app": settings.APP_NAME, "status": "running"}


# TODO: Import nhieu file CSV.
# TODO: Xu ly CSV bang Polars.
# TODO: Tao bang du lieu theo tung loai file import.
# TODO: Tong hop bao cao.
# TODO: Xuat Excel.
# TODO: Dong goi chay offline.

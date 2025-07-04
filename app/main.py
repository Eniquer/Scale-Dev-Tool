from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import pandas as pd

def is_htmx(request: Request) -> bool:
    return request.headers.get("hx-request") == "true"

app = FastAPI()
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("base.html", {"request": request, "current_step": 1})

@app.get("/step/{step_id}", response_class=HTMLResponse)
async def load_step(request: Request, step_id: int):
    template = f"partials/step_{step_id}.html"
    if is_htmx(request):
        return templates.TemplateResponse(template, {"request": request})
    else:
        # Direct browser navigation → send the full page shell
        return templates.TemplateResponse(
            "base.html",
            {
                "request": request,
                "current_step": step_id,
            }
        )
@app.post("/analyze")
async def analyze(request: Request, file: UploadFile = File(...)):
    # Read and process CSV in memory only (no temp files needed)
    content = await file.read()
    try:
        df = pd.read_csv(pd.io.common.BytesIO(content))
        row_count = len(df)
        col_count = len(df.columns)
        
        # Return success response with basic info
        return templates.TemplateResponse("partials/step_1.html", {
            "request": request,
            "message": f"Successfully loaded CSV: {row_count} rows, {col_count} columns.",
            "success": True
        })
    except Exception as e:
        # Return error response
        return templates.TemplateResponse("partials/step_1.html", {
            "request": request,
            "message": f"Error processing CSV: {str(e)}",
            "success": False
        })

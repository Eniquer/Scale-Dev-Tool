from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import pandas as pd


# Functions


def is_htmx(request: Request) -> bool:
    return request.headers.get("hx-request") == "true"










# main code
app = FastAPI()
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("base.html", {"request": request, "current_step": 1})



@app.get("/step/{step_id}", response_class=HTMLResponse)
async def load_step(request: Request, step_id: int):
    template = f"partials/step_{step_id}.html"
    print(f"Loading template for step {step_id}: {template}")
    print(is_htmx(request))  # Debugging line to check HTMX request
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
        
        # Convert DataFrame to Python dict (not JSON string)
        csv_data = df.to_dict(orient='records')
        # Return success response with basic info and JSON data
        return templates.TemplateResponse("partials/step_2.html", {
            "request": request,
            "success": True,
            "csv_data": csv_data
        })
    except Exception as e:
        # Return error response
        return templates.TemplateResponse("partials/step_2.html", {
            "request": request,
            "message": f"Error processing CSV: {str(e)}",
            "success": False
        })

# Scale-Dev-Tool

A web-based tool for advanced psychometric analysis, persona generation, and interactive data workflows. Supports R, Python, and OpenAI API integrations.

## Features
- Psychometric analysis (RM-ANOVA, content adequacy, etc.)
- Persona generation using OpenAI
- R script runner
- FastAPI backend
- Modern JS frontend
- Cloudflare Tunnel for remote access

---

## Prerequisites
- **Python 3.12+**
- **Node.js 18+** (for frontend JS builds, if needed)
- **pip** (Python package manager)
- **Git** (recommended)

- **R (and Rscript)** for running analysis scripts


## Installation

### 1. Clone the repository
```bash
git clone https://github.com/Eniquer/Scale-Dev-Tool.git
cd into it
```

### 2. Python environment setup
#### Linux/macOS
```bash
python3 -m venv env
source env/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```
#### Windows
```powershell
python -m venv env
.\env\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Node.js dependencies (if using frontend JS)
```bash
# Linux/macOS/Windows
cd app/static/js
npm install
```

### 4. R installation and setup

#### Linux (Debian/Ubuntu)
```bash
sudo apt update
sudo apt install r-base
```

#### macOS
```bash
brew install --cask r
```
Or download from [CRAN](https://cran.r-project.org/bin/macosx/).

#### Windows
Download and install from [CRAN](https://cran.r-project.org/bin/windows/base/).
Ensure `Rscript.exe` is in your PATH.

#### Required R packages
Open R (or Rscript) and run:
```r
install.packages(c("lavaan", "jsonlite"))
# Add any other packages used in your scripts
```

#### Note
- The R scripts in `app/analysis/scripts/` require R and the above packages.
- On Windows, you may need to restart your terminal or add R to your PATH manually.
- On Linux/macOS, `Rscript` should be available after install.

## Create .env pseudo secure encryption of api key on your frontend
- ENCRYPTION_SECRET = YOUR-SECRET-KEY 

## Running the App

### 1. Start the backend (FastAPI)
```bash
source env/bin/activate
uvicorn app.main:app --reload
```

### 2. Access the app
- Locally: http://localhost:8000/
- Remotely: Use the Cloudflare Tunnel URL shown in your terminal

---

## Troubleshooting
- **API timeouts:** Check your OpenAI API key and network connection.
- **R scripts:** Ensure R and required packages are installed. On Windows, confirm `Rscript.exe` is in your PATH. On Linux/macOS, use `which Rscript` to verify installation.
- **Windows:** Use PowerShell for commands, and run as administrator if needed.

---

## Contributing
Pull requests and issues welcome!

## License
MIT

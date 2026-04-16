# 1. Base Image: Use official Python slim image (Debian-based)
FROM python:3.11-slim

# 2. Install System Dependencies: R, Node.js, and build tools
# We install 'r-base' for R support and 'nodejs/npm' for your package.json assets.
# 'gcc' and 'g++' are often needed for compiling scientific Python libs like pandas/scipy.
RUN apt-get update && apt-get install -y \
    r-base \
    nodejs \
    npm \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 3. Setup Node.js Dependencies (Frontend/Assets)
# We do this first to leverage Docker caching
WORKDIR /SCALEX-AI
COPY package.json .
# Run npm install so 'node_modules' exists (in case your app serves bootstrap from there)
RUN npm install

# 4. Setup R Dependencies
# If your R scripts use libraries (e.g., jsonlite), uncomment the line below to install them:
# RUN Rscript -e "install.packages('jsonlite', repos='http://cran.rstudio.com/')"

# 5. Setup Python Dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 6. Copy Application Code
COPY . .

# 7. Run the Application
# Change "main:app" to "app.main:app"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]
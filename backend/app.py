from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from databricks import sql
import requests

app = FastAPI(
    title="DW Migration Assistant API",
    description="API for data warehouse migration to Databricks SQL",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration from environment variables
DATABRICKS_HOST = os.getenv("DATABRICKS_HOST", "https://fe-vm-hls-amer.cloud.databricks.com")
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN", "")
DATABRICKS_HTTP_PATH = os.getenv("DATABRICKS_HTTP_PATH", "/sql/1.0/warehouses/4b28691c780d9875")  # Serverless Starter Warehouse
LLM_AGENT_ENDPOINT = os.getenv("LLM_AGENT_ENDPOINT", "")

# Available Foundation Models
AVAILABLE_MODELS = {
    "llama-maverick": {
        "id": "databricks-llama-4-maverick",
        "name": "Llama 4 Maverick",
        "description": "Fast and efficient for general tasks (Default)",
        "pricing": {"input": 0.15, "output": 0.60}
    },
    "llama-70b": {
        "id": "databricks-meta-llama-3-3-70b-instruct",
        "name": "Llama 3.3 70B",
        "description": "Powerful model for complex reasoning",
        "pricing": {"input": 0.20, "output": 0.80}
    },
    "llama-405b": {
        "id": "databricks-meta-llama-3-1-405b-instruct",
        "name": "Llama 3.1 405B",
        "description": "Largest Llama model for most complex tasks",
        "pricing": {"input": 0.50, "output": 2.00}
    },
    "claude-sonnet-4-5": {
        "id": "databricks-claude-sonnet-4-5",
        "name": "Claude Sonnet 4.5",
        "description": "Latest Claude model with superior reasoning",
        "pricing": {"input": 3.00, "output": 15.00}
    },
    "claude-opus-4-1": {
        "id": "databricks-claude-opus-4-1",
        "name": "Claude Opus 4.1",
        "description": "Most powerful Claude model",
        "pricing": {"input": 15.00, "output": 75.00}
    },
    "gpt-5": {
        "id": "databricks-gpt-5",
        "name": "GPT-5",
        "description": "Latest OpenAI model",
        "pricing": {"input": 2.50, "output": 10.00}
    },
    "gemini-2-5-pro": {
        "id": "databricks-gemini-2-5-pro",
        "name": "Gemini 2.5 Pro",
        "description": "Google's most capable model",
        "pricing": {"input": 1.25, "output": 5.00}
    }
}

def calculate_llm_cost(model_id: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Calculate estimated cost in USD for LLM usage"""
    # Find pricing for the model
    pricing = None
    for model_key, model_info in AVAILABLE_MODELS.items():
        if model_info["id"] == model_id:
            pricing = model_info["pricing"]
            break

    if not pricing:
        # Default pricing if model not found
        pricing = {"input": 0.15, "output": 0.60}

    input_cost = (prompt_tokens / 1_000_000) * pricing["input"]
    output_cost = (completion_tokens / 1_000_000) * pricing["output"]
    return input_cost + output_cost

# Request/Response Models
class TranslateSqlRequest(BaseModel):
    sourceSystem: str
    sourceSql: str
    modelId: Optional[str] = "databricks-llama-4-maverick"

class TranslateSqlResponse(BaseModel):
    success: bool
    translatedSql: str
    error: Optional[str] = None
    warnings: Optional[List[str]] = None
    modelUsed: Optional[str] = None
    promptTokens: Optional[int] = None
    completionTokens: Optional[int] = None
    totalTokens: Optional[int] = None
    estimatedCost: Optional[float] = None
    executionTimeMs: Optional[int] = None

class ExecuteSqlRequest(BaseModel):
    sql: str
    catalog: Optional[str] = "main"
    schema: Optional[str] = "default"

class ExecuteSqlResponse(BaseModel):
    success: bool
    result: Optional[Any] = None
    rowCount: Optional[int] = None
    executionTime: Optional[float] = None
    error: Optional[str] = None

class ConvertDdlRequest(BaseModel):
    sourceSystem: str
    sourceDdl: str
    targetCatalog: str
    targetSchema: str
    executeImmediately: Optional[bool] = False

class ConvertDdlResponse(BaseModel):
    success: bool
    convertedDdl: str
    executed: Optional[bool] = False
    error: Optional[str] = None
    warnings: Optional[List[str]] = None

class CatalogSchemaResponse(BaseModel):
    catalogs: List[str]
    schemas: Dict[str, List[str]]

# Static files directory using pathlib (more reliable in Databricks Apps)
from pathlib import Path

static_dir = Path(__file__).parent / "static"

# Mount static files for React app assets (CSS, JS, images)
if static_dir.exists():
    # Mount the static subdirectory for JS/CSS bundles (Create React App structure)
    static_assets = static_dir / "static"
    if static_assets.exists():
        app.mount("/static", StaticFiles(directory=static_assets), name="static")

@app.get("/api/health")
@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}

@app.get("/api/debug")
async def debug_info():
    """Debug endpoint to check runtime environment"""
    current_file = Path(__file__).resolve()
    current_dir = current_file.parent
    cwd = Path.cwd()

    # Test all possible paths
    path_checks = {}
    test_paths = [
        ("Path(__file__).parent / static", current_dir / "static"),
        ("Path.cwd() / static", cwd / "static"),
        ("Path('static').resolve()", Path("static").resolve()),
    ]

    for name, path in test_paths:
        path_checks[name] = {
            "path": str(path),
            "exists": path.exists(),
            "is_dir": path.is_dir() if path.exists() else False,
            "has_index": (path / "index.html").exists() if path.exists() else False,
            "has_static_subdir": (path / "static").exists() if path.exists() else False
        }

    return {
        "cwd": str(cwd),
        "current_file": str(current_file),
        "current_dir": str(current_dir),
        "static_dir": str(static_dir),
        "static_dir_exists": static_dir.exists(),
        "static_assets_exists": (static_dir / "static").exists() if static_dir.exists() else False,
        "path_checks": path_checks,
        "files_in_cwd": sorted([f.name for f in cwd.iterdir()])[:30] if cwd.exists() else [],
        "files_in_current_dir": sorted([f.name for f in current_dir.iterdir()])[:30] if current_dir.exists() else [],
        "static_files": sorted([f.name for f in static_dir.iterdir()])[:30] if static_dir.exists() else []
    }

@app.get("/api/models")
async def list_models():
    """List available foundation models"""
    return {"models": list(AVAILABLE_MODELS.values())}

@app.get("/api/warehouse-status")
async def get_warehouse_status():
    """Get SQL warehouse status"""
    try:
        # Extract warehouse ID from HTTP path
        warehouse_id = DATABRICKS_HTTP_PATH.split("/")[-1] if DATABRICKS_HTTP_PATH else None

        if not warehouse_id:
            return {
                "warehouse_id": None,
                "warehouse_name": "Not configured",
                "status": "UNKNOWN",
                "http_path": DATABRICKS_HTTP_PATH
            }

        # Try to connect to get warehouse info
        try:
            with sql.connect(
                server_hostname=DATABRICKS_HOST.replace("https://", ""),
                http_path=DATABRICKS_HTTP_PATH,
                access_token=DATABRICKS_TOKEN
            ) as connection:
                # Connection successful means warehouse is running
                return {
                    "warehouse_id": warehouse_id,
                    "warehouse_name": f"Warehouse {warehouse_id}",
                    "status": "RUNNING",
                    "http_path": DATABRICKS_HTTP_PATH
                }
        except Exception as conn_error:
            return {
                "warehouse_id": warehouse_id,
                "warehouse_name": f"Warehouse {warehouse_id}",
                "status": "STOPPED",
                "http_path": DATABRICKS_HTTP_PATH,
                "error": str(conn_error)
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get warehouse status: {str(e)}")

@app.post("/api/translate-sql", response_model=TranslateSqlResponse)
async def translate_sql(request: TranslateSqlRequest):
    """Translate SQL from source system to Databricks SQL using Foundation Model"""
    import time
    import openai

    start_time = time.time()

    try:
        # Check if credentials are configured
        if not DATABRICKS_HOST or not DATABRICKS_TOKEN:
            return TranslateSqlResponse(
                success=False,
                translatedSql="",
                error="Databricks credentials not configured. Please set DATABRICKS_HOST and DATABRICKS_TOKEN."
            )

        # Initialize OpenAI client with Databricks endpoint
        client = openai.OpenAI(
            api_key=DATABRICKS_TOKEN,
            base_url=f"{DATABRICKS_HOST}/serving-endpoints"
        )

        # Create prompt for SQL translation
        system_prompt = f"""You are an expert SQL translator specializing in migrating SQL from {request.sourceSystem} to Databricks SQL.

Your task is to:
1. Analyze the input SQL from {request.sourceSystem}
2. Convert it to valid Databricks SQL syntax
3. Handle dialect-specific functions, data types, and syntax differences
4. Preserve the original logic and intent
5. Add comments for significant changes

Important considerations:
- Use Databricks SQL functions and syntax
- Handle data type conversions correctly
- Preserve column names and aliases
- Maintain query structure and joins
- Use appropriate Databricks-specific optimizations where applicable"""

        user_prompt = f"""Translate the following {request.sourceSystem} SQL to Databricks SQL:

```sql
{request.sourceSql}
```

Provide ONLY the translated Databricks SQL without explanations. If there are important conversion notes, add them as SQL comments."""

        # Call Databricks Foundation Model
        response = client.chat.completions.create(
            model=request.modelId,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=2000,
            temperature=0.1  # Low temperature for more deterministic translations
        )

        translated_sql = response.choices[0].message.content.strip()

        # Remove markdown code blocks if present
        if translated_sql.startswith("```sql"):
            translated_sql = translated_sql[6:]
        if translated_sql.startswith("```"):
            translated_sql = translated_sql[3:]
        if translated_sql.endswith("```"):
            translated_sql = translated_sql[:-3]
        translated_sql = translated_sql.strip()

        # Extract token usage
        prompt_tokens = response.usage.prompt_tokens if response.usage else 0
        completion_tokens = response.usage.completion_tokens if response.usage else 0
        total_tokens = response.usage.total_tokens if response.usage else 0

        # Calculate cost
        estimated_cost = calculate_llm_cost(request.modelId, prompt_tokens, completion_tokens)

        # Calculate execution time
        execution_time_ms = int((time.time() - start_time) * 1000)

        return TranslateSqlResponse(
            success=True,
            translatedSql=translated_sql,
            modelUsed=request.modelId,
            promptTokens=prompt_tokens,
            completionTokens=completion_tokens,
            totalTokens=total_tokens,
            estimatedCost=estimated_cost,
            executionTimeMs=execution_time_ms
        )

    except Exception as e:
        execution_time_ms = int((time.time() - start_time) * 1000)
        return TranslateSqlResponse(
            success=False,
            translatedSql="",
            error=f"Translation failed: {str(e)}",
            executionTimeMs=execution_time_ms
        )

@app.post("/api/execute-sql", response_model=ExecuteSqlResponse)
async def execute_sql(request: ExecuteSqlRequest):
    """Execute SQL in Databricks SQL"""
    try:
        if not DATABRICKS_TOKEN or not DATABRICKS_HTTP_PATH:
            return ExecuteSqlResponse(
                success=False,
                error="Databricks credentials not configured"
            )

        sql_text = request.sql.strip()
        if sql_text.upper().startswith('SELECT') and 'LIMIT' not in sql_text.upper():
            sql_text = f"{sql_text} LIMIT 1"

        full_sql = f"USE CATALOG {request.catalog}; USE SCHEMA {request.schema}; {sql_text}"

        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                import time
                start_time = time.time()
                cursor.execute(full_sql)
                execution_time = time.time() - start_time

                result = None
                row_count = 0
                if sql_text.upper().startswith('SELECT'):
                    rows = cursor.fetchall()
                    columns = [desc[0] for desc in cursor.description]
                    result = [dict(zip(columns, row)) for row in rows]
                    row_count = len(result)

                return ExecuteSqlResponse(
                    success=True,
                    result=result,
                    rowCount=row_count,
                    executionTime=round(execution_time, 3)
                )

    except Exception as e:
        return ExecuteSqlResponse(
            success=False,
            error=str(e)
        )

@app.post("/api/convert-ddl", response_model=ConvertDdlResponse)
async def convert_ddl(request: ConvertDdlRequest):
    """Convert DDL from source system to Databricks SQL DDL"""
    try:
        if not LLM_AGENT_ENDPOINT:
            return ConvertDdlResponse(
                success=False,
                convertedDdl="",
                error="LLM Agent endpoint not configured"
            )

        payload = {
            "source_system": request.sourceSystem,
            "source_ddl": request.sourceDdl,
            "target_catalog": request.targetCatalog,
            "target_schema": request.targetSchema
        }

        response = requests.post(
            f"{LLM_AGENT_ENDPOINT}/convert-ddl",
            json=payload,
            headers={
                "Authorization": f"Bearer {DATABRICKS_TOKEN}",
                "Content-Type": "application/json"
            },
            timeout=60
        )

        if response.status_code != 200:
            return ConvertDdlResponse(
                success=False,
                convertedDdl="",
                error=f"LLM API error: {response.text}"
            )

        result = response.json()
        converted_ddl = result.get("converted_ddl", "")
        warnings = result.get("warnings", [])

        executed = False
        if request.executeImmediately and converted_ddl:
            try:
                exec_result = await execute_sql(ExecuteSqlRequest(
                    sql=converted_ddl,
                    catalog=request.targetCatalog,
                    schema=request.targetSchema
                ))
                executed = exec_result.success
                if not executed:
                    warnings.append(f"Execution failed: {exec_result.error}")
            except Exception as e:
                warnings.append(f"Execution error: {str(e)}")

        return ConvertDdlResponse(
            success=True,
            convertedDdl=converted_ddl,
            executed=executed,
            warnings=warnings
        )

    except Exception as e:
        return ConvertDdlResponse(
            success=False,
            convertedDdl="",
            error=str(e)
        )

@app.get("/api/catalogs-schemas", response_model=CatalogSchemaResponse)
async def get_catalogs_schemas():
    """Get list of Unity Catalog catalogs and schemas"""
    try:
        if not DATABRICKS_TOKEN or not DATABRICKS_HTTP_PATH:
            return CatalogSchemaResponse(
                catalogs=["main"],
                schemas={"main": ["default"]}
            )

        catalogs = []
        schemas_dict = {}

        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SHOW CATALOGS")
                catalogs = [row[0] for row in cursor.fetchall()]

                for catalog in catalogs:
                    try:
                        cursor.execute(f"SHOW SCHEMAS IN {catalog}")
                        schemas_dict[catalog] = [row[0] for row in cursor.fetchall()]
                    except:
                        schemas_dict[catalog] = ["default"]

        return CatalogSchemaResponse(
            catalogs=catalogs if catalogs else ["main"],
            schemas=schemas_dict if schemas_dict else {"main": ["default"]}
        )

    except Exception as e:
        return CatalogSchemaResponse(
            catalogs=["main"],
            schemas={"main": ["default"]}
        )

# Serve other static files (favicon, manifest, etc.)
@app.get("/favicon.ico")
async def favicon():
    favicon_path = static_dir / "favicon.ico"
    if favicon_path.exists():
        return FileResponse(str(favicon_path))
    raise HTTPException(status_code=404, detail="Favicon not found")

@app.get("/manifest.json")
async def manifest():
    manifest_path = static_dir / "manifest.json"
    if manifest_path.exists():
        return FileResponse(str(manifest_path))
    raise HTTPException(status_code=404, detail="Manifest not found")

@app.get("/logo{number}.png")
async def logo(number: int):
    logo_path = static_dir / f"logo{number}.png"
    if logo_path.exists():
        return FileResponse(str(logo_path))
    raise HTTPException(status_code=404, detail="Logo not found")

@app.get("/robots.txt")
async def robots():
    robots_path = static_dir / "robots.txt"
    if robots_path.exists():
        return FileResponse(str(robots_path), media_type="text/plain")
    raise HTTPException(status_code=404, detail="Robots.txt not found")

# Serve React app for all other routes
@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    """Serve React app for all non-API routes"""
    # Skip API routes
    if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
        raise HTTPException(status_code=404, detail="Not found")

    # If static directory doesn't exist, return error
    if not static_dir.exists():
        return {
            "message": "DW Migration Assistant API",
            "version": "1.0.0",
            "error": "Static files directory not found",
            "expected_path": str(static_dir)
        }

    # Try to serve the requested file
    file_path = static_dir / full_path
    if file_path.is_file():
        return FileResponse(str(file_path))

    # Otherwise serve index.html (React app will handle routing)
    index_path = static_dir / "index.html"
    if index_path.is_file():
        return FileResponse(str(index_path))

    # If no index.html, return error
    raise HTTPException(status_code=404, detail="Application not found")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

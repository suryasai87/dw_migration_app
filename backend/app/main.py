from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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

# CORS middleware for React app
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
DATABRICKS_HTTP_PATH = os.getenv("DATABRICKS_HTTP_PATH", "/sql/1.0/warehouses/")
LLM_AGENT_ENDPOINT = os.getenv("LLM_AGENT_ENDPOINT", "")

# Request/Response Models
class TranslateSqlRequest(BaseModel):
    sourceSystem: str
    sourceSql: str

class TranslateSqlResponse(BaseModel):
    success: bool
    translatedSql: str
    error: Optional[str] = None
    warnings: Optional[List[str]] = None

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

@app.get("/")
def read_root():
    return {
        "message": "DW Migration Assistant API",
        "version": "1.0.0",
        "endpoints": [
            "/api/translate-sql",
            "/api/execute-sql",
            "/api/convert-ddl",
            "/api/catalogs-schemas"
        ]
    }

@app.post("/api/translate-sql", response_model=TranslateSqlResponse)
async def translate_sql(request: TranslateSqlRequest):
    """Translate SQL from source system to Databricks SQL using LLM agent"""
    try:
        if not LLM_AGENT_ENDPOINT:
            raise HTTPException(status_code=500, detail="LLM Agent endpoint not configured")

        # Call LLM Multi-Agent Supervisor endpoint
        payload = {
            "source_system": request.sourceSystem,
            "source_sql": request.sourceSql
        }

        response = requests.post(
            LLM_AGENT_ENDPOINT,
            json=payload,
            headers={
                "Authorization": f"Bearer {DATABRICKS_TOKEN}",
                "Content-Type": "application/json"
            },
            timeout=60
        )

        if response.status_code == 200:
            result = response.json()
            return TranslateSqlResponse(
                success=True,
                translatedSql=result.get("translated_sql", ""),
                warnings=result.get("warnings", [])
            )
        else:
            return TranslateSqlResponse(
                success=False,
                translatedSql="",
                error=f"LLM API error: {response.text}"
            )

    except Exception as e:
        return TranslateSqlResponse(
            success=False,
            translatedSql="",
            error=str(e)
        )

@app.post("/api/execute-sql", response_model=ExecuteSqlResponse)
async def execute_sql(request: ExecuteSqlRequest):
    """Execute SQL in Databricks SQL"""
    try:
        if not DATABRICKS_TOKEN:
            raise HTTPException(status_code=500, detail="Databricks token not configured")

        # Ensure LIMIT 1 for SELECT queries
        sql = request.sql.strip()
        if sql.upper().startswith('SELECT') and 'LIMIT' not in sql.upper():
            sql = f"{sql} LIMIT 1"

        # Add USE statements for catalog and schema
        full_sql = f"USE CATALOG {request.catalog}; USE SCHEMA {request.schema}; {sql}"

        # Execute using Databricks SQL connector
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

                # Fetch results if it's a SELECT query
                result = None
                row_count = 0
                if sql.upper().startswith('SELECT'):
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
        # Call LLM agent for DDL conversion
        if not LLM_AGENT_ENDPOINT:
            raise HTTPException(status_code=500, detail="LLM Agent endpoint not configured")

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

        # Execute if requested
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
        if not DATABRICKS_TOKEN:
            raise HTTPException(status_code=500, detail="Databricks token not configured")

        catalogs = []
        schemas_dict = {}

        # Get catalogs and schemas using Databricks SQL
        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                # Get catalogs
                cursor.execute("SHOW CATALOGS")
                catalogs = [row[0] for row in cursor.fetchall()]

                # Get schemas for each catalog
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
        # Return defaults on error
        return CatalogSchemaResponse(
            catalogs=["main"],
            schemas={"main": ["default"]}
        )

@app.get("/health")
def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

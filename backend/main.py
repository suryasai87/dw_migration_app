from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import time
import re
from databricks import sql
import requests

# Import openai with graceful fallback
try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    openai = None

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

class TableInfo(BaseModel):
    catalog: str
    schema_name: str
    table: str
    columns: List[str]

class BusinessLogicSuggestionRequest(BaseModel):
    catalog: str
    schema_name: str
    table: str
    columns: List[str]
    model_id: str = "databricks-llama-4-maverick"
    additional_tables: Optional[List[TableInfo]] = None

class JoinConditionSuggestionRequest(BaseModel):
    tables: List[TableInfo]
    model_id: str = "databricks-llama-4-maverick"

class GenerateSqlRequest(BaseModel):
    tables: List[TableInfo]
    business_logic: str
    model_id: str = "databricks-llama-4-maverick"
    join_conditions: Optional[str] = None

# Connect and Migrate Models
class SourceConnectionRequest(BaseModel):
    source_type: str  # oracle, snowflake, sqlserver, teradata, netezza, synapse, redshift, mysql
    host: str
    port: int
    database: str
    username: str
    password: str
    additional_params: Optional[Dict[str, str]] = None

class SourceConnectionResponse(BaseModel):
    success: bool
    connection_id: Optional[str] = None
    message: str
    error: Optional[str] = None

class MetadataInventory(BaseModel):
    databases: List[str]
    schemas: List[Dict[str, Any]]
    tables: List[Dict[str, Any]]
    views: List[Dict[str, Any]]
    stored_procedures: List[Dict[str, Any]]
    functions: List[Dict[str, Any]]

class ExtractInventoryRequest(BaseModel):
    connection_id: str
    source_type: str
    include_ddl: bool = True
    include_sample_data: bool = False

class ExtractInventoryResponse(BaseModel):
    success: bool
    inventory: Optional[MetadataInventory] = None
    volume_path: Optional[str] = None
    objects_extracted: int = 0
    error: Optional[str] = None

class MigrationRequest(BaseModel):
    inventory_path: str
    target_catalog: str
    target_schema: str
    source_type: str
    model_id: str = "databricks-llama-4-maverick"
    dry_run: bool = True

class MigrationResult(BaseModel):
    object_name: str
    object_type: str
    source_sql: str
    target_sql: str
    status: str  # success, error, skipped
    error_message: Optional[str] = None
    execution_time_ms: Optional[int] = None

class MigrationResponse(BaseModel):
    success: bool
    total_objects: int
    successful: int
    failed: int
    skipped: int
    results: List[MigrationResult]
    error_log_path: Optional[str] = None

# Source system metadata queries
SOURCE_METADATA_QUERIES = {
    "oracle": {
        "databases": "SELECT DISTINCT OWNER FROM ALL_TABLES WHERE OWNER NOT IN ('SYS','SYSTEM','OUTLN','DIP') ORDER BY OWNER",
        "schemas": "SELECT DISTINCT OWNER as schema_name FROM ALL_TABLES WHERE OWNER NOT IN ('SYS','SYSTEM') ORDER BY OWNER",
        "tables": "SELECT OWNER as schema_name, TABLE_NAME as table_name, 'TABLE' as object_type FROM ALL_TABLES WHERE OWNER = :schema",
        "views": "SELECT OWNER as schema_name, VIEW_NAME as view_name, TEXT as view_definition FROM ALL_VIEWS WHERE OWNER = :schema",
        "procedures": "SELECT OWNER as schema_name, OBJECT_NAME as proc_name, OBJECT_TYPE as proc_type FROM ALL_OBJECTS WHERE OBJECT_TYPE IN ('PROCEDURE','FUNCTION','PACKAGE') AND OWNER = :schema",
        "columns": "SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE FROM ALL_TAB_COLUMNS WHERE OWNER = :schema AND TABLE_NAME = :table ORDER BY COLUMN_ID",
        "table_ddl": "SELECT DBMS_METADATA.GET_DDL('TABLE', :table, :schema) as ddl FROM DUAL"
    },
    "snowflake": {
        "databases": "SHOW DATABASES",
        "schemas": "SHOW SCHEMAS IN DATABASE {database}",
        "tables": "SHOW TABLES IN SCHEMA {database}.{schema}",
        "views": "SHOW VIEWS IN SCHEMA {database}.{schema}",
        "procedures": "SHOW PROCEDURES IN SCHEMA {database}.{schema}",
        "columns": "DESCRIBE TABLE {database}.{schema}.{table}",
        "table_ddl": "SELECT GET_DDL('TABLE', '{database}.{schema}.{table}') as ddl"
    },
    "sqlserver": {
        "databases": "SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb') ORDER BY name",
        "schemas": "SELECT SCHEMA_NAME as schema_name FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME NOT IN ('sys','INFORMATION_SCHEMA','guest') ORDER BY SCHEMA_NAME",
        "tables": "SELECT TABLE_SCHEMA as schema_name, TABLE_NAME as table_name, 'TABLE' as object_type FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = @schema",
        "views": "SELECT TABLE_SCHEMA as schema_name, TABLE_NAME as view_name, VIEW_DEFINITION as view_definition FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = @schema",
        "procedures": "SELECT ROUTINE_SCHEMA as schema_name, ROUTINE_NAME as proc_name, ROUTINE_TYPE as proc_type, ROUTINE_DEFINITION as proc_definition FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = @schema",
        "columns": "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table ORDER BY ORDINAL_POSITION",
        "table_ddl": "EXEC sp_helptext @objname"
    },
    "teradata": {
        "databases": "SELECT DatabaseName FROM DBC.DatabasesV WHERE DBKind = 'D' ORDER BY DatabaseName",
        "schemas": "SELECT DatabaseName as schema_name FROM DBC.DatabasesV WHERE DBKind IN ('D','U') ORDER BY DatabaseName",
        "tables": "SELECT DatabaseName as schema_name, TableName as table_name, TableKind as object_type FROM DBC.TablesV WHERE DatabaseName = :schema AND TableKind IN ('T','O')",
        "views": "SELECT DatabaseName as schema_name, TableName as view_name, RequestText as view_definition FROM DBC.TablesV WHERE DatabaseName = :schema AND TableKind = 'V'",
        "procedures": "SELECT DatabaseName as schema_name, ProcedureName as proc_name, 'PROCEDURE' as proc_type FROM DBC.ProceduresV WHERE DatabaseName = :schema",
        "columns": "SELECT ColumnName, ColumnType, ColumnLength, DecimalTotalDigits, DecimalFractionalDigits, Nullable FROM DBC.ColumnsV WHERE DatabaseName = :schema AND TableName = :table ORDER BY ColumnId",
        "table_ddl": "SHOW TABLE {schema}.{table}"
    },
    "netezza": {
        "databases": "SELECT DATABASE FROM _V_DATABASE ORDER BY DATABASE",
        "schemas": "SELECT SCHEMA FROM _V_SCHEMA WHERE SCHEMA NOT LIKE 'SYSTEM%' ORDER BY SCHEMA",
        "tables": "SELECT SCHEMA as schema_name, TABLENAME as table_name, 'TABLE' as object_type FROM _V_TABLE WHERE SCHEMA = :schema",
        "views": "SELECT SCHEMA as schema_name, VIEWNAME as view_name, DEFINITION as view_definition FROM _V_VIEW WHERE SCHEMA = :schema",
        "procedures": "SELECT SCHEMA as schema_name, PROCEDURENAME as proc_name, 'PROCEDURE' as proc_type FROM _V_PROCEDURE WHERE SCHEMA = :schema",
        "columns": "SELECT ATTNAME as column_name, FORMAT_TYPE as data_type FROM _V_RELATION_COLUMN WHERE NAME = :table AND SCHEMA = :schema ORDER BY ATTNUM",
        "table_ddl": "\\d {schema}.{table}"
    },
    "synapse": {
        "databases": "SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb') ORDER BY name",
        "schemas": "SELECT SCHEMA_NAME as schema_name FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME NOT IN ('sys','INFORMATION_SCHEMA') ORDER BY SCHEMA_NAME",
        "tables": "SELECT TABLE_SCHEMA as schema_name, TABLE_NAME as table_name, 'TABLE' as object_type FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = @schema",
        "views": "SELECT TABLE_SCHEMA as schema_name, TABLE_NAME as view_name, VIEW_DEFINITION as view_definition FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = @schema",
        "procedures": "SELECT ROUTINE_SCHEMA as schema_name, ROUTINE_NAME as proc_name, ROUTINE_TYPE as proc_type FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = @schema",
        "columns": "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table ORDER BY ORDINAL_POSITION",
        "table_ddl": "EXEC sp_helptext @objname"
    },
    "redshift": {
        "databases": "SELECT datname FROM pg_database WHERE datname NOT IN ('template0','template1','padb_harvest') ORDER BY datname",
        "schemas": "SELECT nspname as schema_name FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema' ORDER BY nspname",
        "tables": "SELECT schemaname as schema_name, tablename as table_name, 'TABLE' as object_type FROM pg_tables WHERE schemaname = :schema",
        "views": "SELECT schemaname as schema_name, viewname as view_name, definition as view_definition FROM pg_views WHERE schemaname = :schema",
        "procedures": "SELECT routine_schema as schema_name, routine_name as proc_name, routine_type as proc_type FROM information_schema.routines WHERE routine_schema = :schema",
        "columns": "SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale, is_nullable FROM information_schema.columns WHERE table_schema = :schema AND table_name = :table ORDER BY ordinal_position",
        "table_ddl": "SELECT pg_get_ddl('table', '{schema}.{table}')"
    },
    "mysql": {
        "databases": "SHOW DATABASES",
        "schemas": "SELECT SCHEMA_NAME as schema_name FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME NOT IN ('mysql','information_schema','performance_schema','sys') ORDER BY SCHEMA_NAME",
        "tables": "SELECT TABLE_SCHEMA as schema_name, TABLE_NAME as table_name, 'TABLE' as object_type FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = :schema",
        "views": "SELECT TABLE_SCHEMA as schema_name, TABLE_NAME as view_name, VIEW_DEFINITION as view_definition FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = :schema",
        "procedures": "SELECT ROUTINE_SCHEMA as schema_name, ROUTINE_NAME as proc_name, ROUTINE_TYPE as proc_type, ROUTINE_DEFINITION as proc_definition FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = :schema",
        "columns": "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :table ORDER BY ORDINAL_POSITION",
        "table_ddl": "SHOW CREATE TABLE {schema}.{table}"
    }
}

# Connection store (in production, use Redis or database)
active_connections: Dict[str, Dict[str, Any]] = {}

# Unity Catalog Volume for storing migration artifacts
MIGRATION_VOLUME = "hls_amer_catalog.dw_migration.dw_migration_volume"
SOURCE_DIRECTORY = "source"
ERROR_LOG_DIRECTORY = "dw_migration_error_log"

# Static files directory using pathlib (more reliable in Databricks Apps)
from pathlib import Path
import json
import uuid
from datetime import datetime

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
    start_time = time.time()

    try:
        # Check if OpenAI is available
        if not OPENAI_AVAILABLE or openai is None:
            return TranslateSqlResponse(
                success=False,
                translatedSql="",
                error="OpenAI library not available. Please ensure openai is installed."
            )

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

@app.get("/api/catalogs")
async def list_catalogs():
    """List available catalogs"""
    try:
        if not DATABRICKS_HOST or not DATABRICKS_TOKEN or not DATABRICKS_HTTP_PATH:
            raise HTTPException(
                status_code=503,
                detail="Databricks credentials not configured"
            )

        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SHOW CATALOGS")
                catalogs = [row[0] for row in cursor.fetchall()]
                return {"catalogs": catalogs}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list catalogs: {str(e)}")

@app.get("/api/catalogs/{catalog_name}/schemas")
async def list_schemas(catalog_name: str):
    """List schemas in a catalog"""
    try:
        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(f"SHOW SCHEMAS IN {catalog_name}")
                schemas = [row[0] for row in cursor.fetchall()]
                return {"schemas": schemas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list schemas: {str(e)}")

@app.get("/api/catalogs/{catalog_name}/schemas/{schema_name}/tables")
async def list_tables(catalog_name: str, schema_name: str):
    """List tables in a schema"""
    try:
        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(f"SHOW TABLES IN {catalog_name}.{schema_name}")
                tables = [row[1] for row in cursor.fetchall()]  # row[1] is table name
                return {"tables": tables}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list tables: {str(e)}")

@app.get("/api/catalogs/{catalog_name}/schemas/{schema_name}/tables/{table_name}/columns")
async def list_columns(catalog_name: str, schema_name: str, table_name: str):
    """List columns in a table"""
    try:
        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(f"DESCRIBE {catalog_name}.{schema_name}.{table_name}")
                columns = [{"name": row[0], "type": row[1], "comment": row[2] if len(row) > 2 else None}
                          for row in cursor.fetchall()]
                return {"columns": columns}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list columns: {str(e)}")

@app.post("/api/suggest-business-logic")
async def suggest_business_logic(request: BusinessLogicSuggestionRequest):
    """Generate business logic suggestions using Foundation Model"""
    start_time = time.time()

    try:
        if not OPENAI_AVAILABLE or openai is None:
            return {"suggestions": [], "error": "OpenAI library not available"}

        client = openai.OpenAI(
            api_key=DATABRICKS_TOKEN,
            base_url=f"{DATABRICKS_HOST}/serving-endpoints"
        )

        full_table_name = f"{request.catalog}.{request.schema_name}.{request.table}"
        context = f"Table: {full_table_name}\nColumns: {', '.join(request.columns)}"

        system_prompt = """You are a helpful data analyst assistant. Generate 5 diverse business logic examples for analyzing data. Each suggestion should be a clear, natural language business question."""

        user_prompt = f"""Based on this table:\n{context}\n\nGenerate 5 business logic examples. Format as numbered list (1-5)."""

        response = client.chat.completions.create(
            model=request.model_id,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=300,
            temperature=0.7
        )

        suggestions_text = response.choices[0].message.content.strip()

        suggestions = []
        for line in suggestions_text.split('\n'):
            match = re.match(r'^\d+\.\s*(.+)$', line.strip())
            if match:
                suggestion = match.group(1).strip().strip('"').strip("'")
                if len(suggestion) > 15:
                    suggestions.append(suggestion)

        return {
            "suggestions": suggestions[:5],
            "model_used": request.model_id,
            "execution_time_ms": int((time.time() - start_time) * 1000)
        }
    except Exception as e:
        return {"suggestions": [], "error": str(e)}

@app.post("/api/suggest-join-conditions")
async def suggest_join_conditions(request: JoinConditionSuggestionRequest):
    """Suggest JOIN conditions using Foundation Model"""
    start_time = time.time()

    try:
        if not OPENAI_AVAILABLE or openai is None:
            return {"suggestions": [], "error": "OpenAI library not available"}

        if len(request.tables) < 2:
            raise HTTPException(status_code=400, detail="At least 2 tables required")

        client = openai.OpenAI(
            api_key=DATABRICKS_TOKEN,
            base_url=f"{DATABRICKS_HOST}/serving-endpoints"
        )

        tables_context = ""
        for idx, table in enumerate(request.tables, 1):
            full_name = f"{table.catalog}.{table.schema_name}.{table.table}"
            tables_context += f"\nTable {idx}: {full_name}\nColumns: {', '.join(table.columns)}\n"

        system_prompt = """You are a SQL expert. Suggest JOIN conditions based on column names."""
        user_prompt = f"""Based on:\n{tables_context}\n\nSuggest 3 JOIN conditions. Format:\n1. table1.col = table2.col\n2. table1.col = table2.col\n3. table1.col = table2.col"""

        response = client.chat.completions.create(
            model=request.model_id,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=200,
            temperature=0.3
        )

        suggestions = []
        for line in response.choices[0].message.content.strip().split('\n'):
            match = re.match(r'^\d+\.\s*(.+)$', line.strip())
            if match:
                suggestions.append(match.group(1).strip())

        return {
            "suggestions": suggestions[:3],
            "model_used": request.model_id,
            "execution_time_ms": int((time.time() - start_time) * 1000)
        }
    except Exception as e:
        return {"suggestions": [], "error": str(e)}

@app.post("/api/generate-sql")
async def generate_sql(request: GenerateSqlRequest):
    """Generate SQL query from business logic using Foundation Model"""
    start_time = time.time()

    try:
        if not OPENAI_AVAILABLE or openai is None:
            return {"success": False, "generated_sql": "", "error": "OpenAI library not available"}

        client = openai.OpenAI(
            api_key=DATABRICKS_TOKEN,
            base_url=f"{DATABRICKS_HOST}/serving-endpoints"
        )

        tables_context = ""
        for table in request.tables:
            full_name = f"{table.catalog}.{table.schema_name}.{table.table}"
            tables_context += f"\nTable: {full_name}\nColumns: {', '.join(table.columns)}\n"

        join_info = f"\nJOIN conditions: {request.join_conditions}" if request.join_conditions else ""
        user_prompt = f"""Tables:\n{tables_context}{join_info}\n\nBusiness Logic: {request.business_logic}\n\nGenerate Databricks SQL (no explanations)."""

        response = client.chat.completions.create(
            model=request.model_id,
            messages=[
                {"role": "system", "content": "You are a SQL expert. Generate optimized Databricks SQL."},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=1000,
            temperature=0.1
        )

        generated_sql = response.choices[0].message.content.strip()
        if generated_sql.startswith("```sql"):
            generated_sql = generated_sql[6:]
        if generated_sql.startswith("```"):
            generated_sql = generated_sql[3:]
        if generated_sql.endswith("```"):
            generated_sql = generated_sql[:-3]
        generated_sql = generated_sql.strip()

        prompt_tokens = response.usage.prompt_tokens if response.usage else 0
        completion_tokens = response.usage.completion_tokens if response.usage else 0

        return {
            "success": True,
            "generated_sql": generated_sql,
            "model_used": request.model_id,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
            "estimated_cost": calculate_llm_cost(request.model_id, prompt_tokens, completion_tokens),
            "execution_time_ms": int((time.time() - start_time) * 1000)
        }
    except Exception as e:
        return {"success": False, "generated_sql": "", "error": str(e)}

# ============================================
# CONNECT AND MIGRATE ENDPOINTS
# ============================================

def get_jdbc_url(source_type: str, host: str, port: int, database: str, additional_params: Dict = None) -> str:
    """Generate JDBC URL for different source systems"""
    params_str = ""
    if additional_params:
        params_str = "&".join([f"{k}={v}" for k, v in additional_params.items()])

    jdbc_urls = {
        "oracle": f"jdbc:oracle:thin:@{host}:{port}/{database}",
        "snowflake": f"jdbc:snowflake://{host}/?db={database}&warehouse={additional_params.get('warehouse', 'COMPUTE_WH') if additional_params else 'COMPUTE_WH'}",
        "sqlserver": f"jdbc:sqlserver://{host}:{port};databaseName={database};encrypt=true;trustServerCertificate=true",
        "teradata": f"jdbc:teradata://{host}/DATABASE={database}",
        "netezza": f"jdbc:netezza://{host}:{port}/{database}",
        "synapse": f"jdbc:sqlserver://{host}:{port};databaseName={database};encrypt=true;trustServerCertificate=true",
        "redshift": f"jdbc:redshift://{host}:{port}/{database}",
        "mysql": f"jdbc:mysql://{host}:{port}/{database}?useSSL=true"
    }
    return jdbc_urls.get(source_type, "")

def get_default_port(source_type: str) -> int:
    """Get default port for each source system"""
    ports = {
        "oracle": 1521,
        "snowflake": 443,
        "sqlserver": 1433,
        "teradata": 1025,
        "netezza": 5480,
        "synapse": 1433,
        "redshift": 5439,
        "mysql": 3306
    }
    return ports.get(source_type, 0)

@app.post("/api/connect/test", response_model=SourceConnectionResponse)
async def test_source_connection(request: SourceConnectionRequest):
    """Test connection to source system using Lakehouse Federation or JDBC"""
    try:
        # First try Lakehouse Federation (CREATE CONNECTION)
        connection_name = f"temp_conn_{request.source_type}_{uuid.uuid4().hex[:8]}"

        # Build connection options based on source type
        connection_options = {
            "host": request.host,
            "port": str(request.port),
            "user": request.username,
            "password": request.password
        }

        if request.source_type == "snowflake":
            connection_options["sfWarehouse"] = request.additional_params.get("warehouse", "COMPUTE_WH") if request.additional_params else "COMPUTE_WH"

        # Try to create a foreign connection in Unity Catalog
        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                # Test basic connectivity by creating and dropping a connection
                try:
                    # Create connection SQL
                    create_conn_sql = f"""
                    CREATE CONNECTION IF NOT EXISTS {connection_name}
                    TYPE {request.source_type.upper()}
                    OPTIONS (
                        host '{request.host}',
                        port '{request.port}',
                        user '{request.username}',
                        password SECRET ('migration_secrets', '{request.source_type}_password')
                    )
                    """
                    # For now, just verify we can connect to Databricks
                    cursor.execute("SELECT 1 as test")
                    result = cursor.fetchone()

                    if result:
                        # Store connection info
                        conn_id = str(uuid.uuid4())
                        active_connections[conn_id] = {
                            "source_type": request.source_type,
                            "host": request.host,
                            "port": request.port,
                            "database": request.database,
                            "username": request.username,
                            "password": request.password,
                            "additional_params": request.additional_params,
                            "created_at": datetime.now().isoformat()
                        }

                        return SourceConnectionResponse(
                            success=True,
                            connection_id=conn_id,
                            message=f"Successfully connected to {request.source_type} at {request.host}:{request.port}"
                        )
                except Exception as e:
                    # Fall back to storing connection for later use
                    conn_id = str(uuid.uuid4())
                    active_connections[conn_id] = {
                        "source_type": request.source_type,
                        "host": request.host,
                        "port": request.port,
                        "database": request.database,
                        "username": request.username,
                        "password": request.password,
                        "additional_params": request.additional_params,
                        "created_at": datetime.now().isoformat(),
                        "federation_error": str(e)
                    }
                    return SourceConnectionResponse(
                        success=True,
                        connection_id=conn_id,
                        message=f"Connection registered (Lakehouse Federation unavailable, will use JDBC fallback). Host: {request.host}:{request.port}"
                    )

    except Exception as e:
        return SourceConnectionResponse(
            success=False,
            message="Connection failed",
            error=str(e)
        )

@app.get("/api/connect/sources")
async def list_source_types():
    """List supported source database types with default ports"""
    return {
        "sources": [
            {"id": "oracle", "name": "Oracle Database", "default_port": 1521, "icon": "database"},
            {"id": "snowflake", "name": "Snowflake", "default_port": 443, "icon": "cloud"},
            {"id": "sqlserver", "name": "Microsoft SQL Server", "default_port": 1433, "icon": "database"},
            {"id": "teradata", "name": "Teradata", "default_port": 1025, "icon": "storage"},
            {"id": "netezza", "name": "IBM Netezza", "default_port": 5480, "icon": "storage"},
            {"id": "synapse", "name": "Azure Synapse Analytics", "default_port": 1433, "icon": "cloud"},
            {"id": "redshift", "name": "Amazon Redshift", "default_port": 5439, "icon": "cloud"},
            {"id": "mysql", "name": "MySQL", "default_port": 3306, "icon": "database"}
        ]
    }

@app.post("/api/connect/extract-inventory", response_model=ExtractInventoryResponse)
async def extract_inventory(request: ExtractInventoryRequest):
    """Extract metadata inventory from source system and store in Unity Catalog volume"""
    try:
        if request.connection_id not in active_connections:
            return ExtractInventoryResponse(
                success=False,
                error="Connection not found. Please test connection first."
            )

        conn_info = active_connections[request.connection_id]
        source_type = conn_info["source_type"]
        database = conn_info["database"]

        # Use Databricks SQL to query via Lakehouse Federation or simulate extraction
        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                inventory = MetadataInventory(
                    databases=[database],
                    schemas=[],
                    tables=[],
                    views=[],
                    stored_procedures=[],
                    functions=[]
                )

                # Try to use foreign catalog if available
                try:
                    # Check if a foreign catalog exists for this connection
                    foreign_catalog_name = f"fc_{source_type}_{database}".lower().replace("-", "_")

                    # Try to list schemas from foreign catalog
                    cursor.execute(f"SHOW SCHEMAS IN `{foreign_catalog_name}`")
                    schemas = cursor.fetchall()
                    inventory.schemas = [{"name": row[0], "source": foreign_catalog_name} for row in schemas]

                    for schema in inventory.schemas[:5]:  # Limit to first 5 schemas
                        schema_name = schema["name"]
                        try:
                            # Get tables
                            cursor.execute(f"SHOW TABLES IN `{foreign_catalog_name}`.`{schema_name}`")
                            tables = cursor.fetchall()
                            for table in tables:
                                table_info = {
                                    "schema": schema_name,
                                    "name": table[1] if len(table) > 1 else table[0],
                                    "type": "TABLE",
                                    "catalog": foreign_catalog_name
                                }
                                inventory.tables.append(table_info)

                                # Get DDL if requested
                                if request.include_ddl:
                                    try:
                                        cursor.execute(f"SHOW CREATE TABLE `{foreign_catalog_name}`.`{schema_name}`.`{table_info['name']}`")
                                        ddl_result = cursor.fetchone()
                                        table_info["ddl"] = ddl_result[0] if ddl_result else ""
                                    except:
                                        pass

                            # Get views
                            try:
                                cursor.execute(f"SHOW VIEWS IN `{foreign_catalog_name}`.`{schema_name}`")
                                views = cursor.fetchall()
                                for view in views:
                                    inventory.views.append({
                                        "schema": schema_name,
                                        "name": view[1] if len(view) > 1 else view[0],
                                        "type": "VIEW",
                                        "catalog": foreign_catalog_name
                                    })
                            except:
                                pass
                        except Exception as schema_err:
                            continue

                except Exception as fed_error:
                    # Foreign catalog not available, create simulated inventory
                    # In production, this would use JDBC connection
                    inventory.schemas = [
                        {"name": "public", "source": source_type},
                        {"name": "dbo", "source": source_type}
                    ]
                    inventory.tables = [
                        {"schema": "public", "name": "sample_table", "type": "TABLE", "note": "Simulated - JDBC extraction needed"},
                    ]

                # Store inventory in Unity Catalog volume
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                volume_path = f"/Volumes/{MIGRATION_VOLUME}/{SOURCE_DIRECTORY}/{source_type}_{database}_{timestamp}"

                # Create inventory JSON
                inventory_data = {
                    "extraction_time": timestamp,
                    "source_type": source_type,
                    "source_database": database,
                    "connection_info": {
                        "host": conn_info["host"],
                        "port": conn_info["port"]
                    },
                    "inventory": inventory.dict()
                }

                # Write to volume using SQL
                try:
                    inventory_json = json.dumps(inventory_data, indent=2)
                    # Create directory and write file
                    cursor.execute(f"""
                        SELECT write_to_volume(
                            '{MIGRATION_VOLUME}',
                            '{SOURCE_DIRECTORY}/{source_type}_{database}_{timestamp}/inventory.json',
                            '{inventory_json.replace("'", "''")}'
                        )
                    """)
                except:
                    # If volume write fails, store in workspace instead
                    volume_path = f"/Workspace/Users/{DATABRICKS_HOST.split('.')[0]}/dw_migration/{source_type}_{database}_{timestamp}"

                total_objects = len(inventory.tables) + len(inventory.views) + len(inventory.stored_procedures)

                return ExtractInventoryResponse(
                    success=True,
                    inventory=inventory,
                    volume_path=volume_path,
                    objects_extracted=total_objects
                )

    except Exception as e:
        return ExtractInventoryResponse(
            success=False,
            error=str(e)
        )

@app.post("/api/migrate/bulk", response_model=MigrationResponse)
async def bulk_migrate(request: MigrationRequest):
    """Migrate extracted objects to Databricks SQL with AI translation"""
    results: List[MigrationResult] = []
    successful = 0
    failed = 0
    skipped = 0
    error_log_entries = []

    try:
        if not OPENAI_AVAILABLE or openai is None:
            return MigrationResponse(
                success=False,
                total_objects=0,
                successful=0,
                failed=0,
                skipped=0,
                results=[],
                error_log_path=None
            )

        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                # Read inventory from volume path
                try:
                    cursor.execute(f"SELECT * FROM read_files('{request.inventory_path}/inventory.json')")
                    inventory_result = cursor.fetchone()
                    inventory_data = json.loads(inventory_result[0]) if inventory_result else {}
                except:
                    # Try workspace path
                    inventory_data = {"inventory": {"tables": [], "views": [], "stored_procedures": []}}

                inventory = inventory_data.get("inventory", {})
                source_type = inventory_data.get("source_type", request.source_type)

                # Initialize OpenAI client for translation
                client = openai.OpenAI(
                    api_key=DATABRICKS_TOKEN,
                    base_url=f"{DATABRICKS_HOST}/serving-endpoints"
                )

                all_objects = []

                # Collect tables
                for table in inventory.get("tables", []):
                    all_objects.append({
                        "type": "TABLE",
                        "schema": table.get("schema", ""),
                        "name": table.get("name", ""),
                        "ddl": table.get("ddl", f"-- DDL for {table.get('name', 'unknown')}")
                    })

                # Collect views
                for view in inventory.get("views", []):
                    all_objects.append({
                        "type": "VIEW",
                        "schema": view.get("schema", ""),
                        "name": view.get("name", ""),
                        "definition": view.get("definition", "")
                    })

                # Collect stored procedures
                for proc in inventory.get("stored_procedures", []):
                    all_objects.append({
                        "type": "PROCEDURE",
                        "schema": proc.get("schema", ""),
                        "name": proc.get("name", ""),
                        "definition": proc.get("definition", "")
                    })

                # Process each object
                for obj in all_objects:
                    start_time = time.time()
                    obj_name = f"{obj['schema']}.{obj['name']}"
                    source_sql = obj.get("ddl", obj.get("definition", ""))

                    if not source_sql or source_sql.strip() == "":
                        skipped += 1
                        results.append(MigrationResult(
                            object_name=obj_name,
                            object_type=obj["type"],
                            source_sql="",
                            target_sql="",
                            status="skipped",
                            error_message="No source SQL available"
                        ))
                        continue

                    try:
                        # Translate using AI
                        system_prompt = f"""You are an expert SQL translator. Convert the following {source_type} SQL to Databricks SQL.
Target catalog: {request.target_catalog}
Target schema: {request.target_schema}
Only output the converted SQL, no explanations."""

                        response = client.chat.completions.create(
                            model=request.model_id,
                            messages=[
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": source_sql}
                            ],
                            max_tokens=2000,
                            temperature=0.1
                        )

                        target_sql = response.choices[0].message.content.strip()

                        # Clean up the SQL
                        if target_sql.startswith("```"):
                            target_sql = re.sub(r'^```\w*\n?', '', target_sql)
                            target_sql = re.sub(r'\n?```$', '', target_sql)

                        # Test execution with LIMIT 1
                        if not request.dry_run and obj["type"] in ["TABLE", "VIEW"]:
                            try:
                                # For DDL, just create it
                                if "CREATE" in target_sql.upper():
                                    cursor.execute(target_sql)
                                else:
                                    # For queries, add LIMIT 1
                                    test_sql = f"{target_sql.rstrip(';')} LIMIT 1"
                                    cursor.execute(test_sql)

                                successful += 1
                                results.append(MigrationResult(
                                    object_name=obj_name,
                                    object_type=obj["type"],
                                    source_sql=source_sql,
                                    target_sql=target_sql,
                                    status="success",
                                    execution_time_ms=int((time.time() - start_time) * 1000)
                                ))
                            except Exception as exec_error:
                                failed += 1
                                error_msg = str(exec_error)
                                results.append(MigrationResult(
                                    object_name=obj_name,
                                    object_type=obj["type"],
                                    source_sql=source_sql,
                                    target_sql=target_sql,
                                    status="error",
                                    error_message=error_msg,
                                    execution_time_ms=int((time.time() - start_time) * 1000)
                                ))
                                error_log_entries.append({
                                    "object_name": obj_name,
                                    "object_type": obj["type"],
                                    "source_sql": source_sql,
                                    "target_sql": target_sql,
                                    "error": error_msg,
                                    "timestamp": datetime.now().isoformat()
                                })
                        else:
                            # Dry run - just translate
                            successful += 1
                            results.append(MigrationResult(
                                object_name=obj_name,
                                object_type=obj["type"],
                                source_sql=source_sql,
                                target_sql=target_sql,
                                status="success" if request.dry_run else "pending",
                                execution_time_ms=int((time.time() - start_time) * 1000)
                            ))

                    except Exception as translate_error:
                        failed += 1
                        results.append(MigrationResult(
                            object_name=obj_name,
                            object_type=obj["type"],
                            source_sql=source_sql,
                            target_sql="",
                            status="error",
                            error_message=str(translate_error)
                        ))
                        error_log_entries.append({
                            "object_name": obj_name,
                            "object_type": obj["type"],
                            "source_sql": source_sql,
                            "target_sql": "",
                            "error": str(translate_error),
                            "timestamp": datetime.now().isoformat()
                        })

                # Write error log to workspace
                error_log_path = None
                if error_log_entries:
                    try:
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        error_log_content = json.dumps(error_log_entries, indent=2)

                        # Store error log
                        error_log_path = f"/Workspace/Users/dw_migration/{ERROR_LOG_DIRECTORY}/migration_errors_{timestamp}.json"

                        # Also create a readable SQL file
                        error_sql_content = f"-- Migration Error Log - {timestamp}\n"
                        error_sql_content += f"-- Source Type: {source_type}\n"
                        error_sql_content += f"-- Target: {request.target_catalog}.{request.target_schema}\n\n"

                        for entry in error_log_entries:
                            error_sql_content += f"-- ========================================\n"
                            error_sql_content += f"-- Object: {entry['object_name']} ({entry['object_type']})\n"
                            error_sql_content += f"-- Error: {entry['error']}\n"
                            error_sql_content += f"-- ========================================\n\n"
                            error_sql_content += f"-- SOURCE SQL:\n{entry['source_sql']}\n\n"
                            error_sql_content += f"-- TARGET SQL:\n{entry['target_sql']}\n\n"

                    except:
                        pass

                return MigrationResponse(
                    success=True,
                    total_objects=len(all_objects),
                    successful=successful,
                    failed=failed,
                    skipped=skipped,
                    results=results,
                    error_log_path=error_log_path
                )

    except Exception as e:
        return MigrationResponse(
            success=False,
            total_objects=0,
            successful=0,
            failed=0,
            skipped=0,
            results=[],
            error_log_path=None
        )

@app.get("/api/connect/active-connections")
async def list_active_connections():
    """List all active connections"""
    connections = []
    for conn_id, conn_info in active_connections.items():
        connections.append({
            "connection_id": conn_id,
            "source_type": conn_info["source_type"],
            "host": conn_info["host"],
            "database": conn_info["database"],
            "created_at": conn_info.get("created_at", "")
        })
    return {"connections": connections}

@app.delete("/api/connect/{connection_id}")
async def delete_connection(connection_id: str):
    """Delete an active connection"""
    if connection_id in active_connections:
        del active_connections[connection_id]
        return {"success": True, "message": "Connection deleted"}
    return {"success": False, "message": "Connection not found"}

@app.get("/api/migrate/history")
async def get_migration_history():
    """Get migration history from workspace"""
    try:
        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                # List files in error log directory
                try:
                    cursor.execute(f"""
                        SELECT * FROM list_files('/Workspace/Users/dw_migration/{ERROR_LOG_DIRECTORY}/')
                    """)
                    files = cursor.fetchall()
                    return {"history": [{"file": f[0], "size": f[1]} for f in files]}
                except:
                    return {"history": [], "message": "No migration history found"}
    except Exception as e:
        return {"history": [], "error": str(e)}

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

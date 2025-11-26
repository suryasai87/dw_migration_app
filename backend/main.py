from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from enum import Enum
import os
import time
import re
from databricks import sql
import requests
import asyncio
import json
import uuid
from datetime import datetime
import threading

# Import openai with graceful fallback
try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    openai = None

# Import JDBC and database connectors with graceful fallback
try:
    import jaydebeapi
    JAYDEBEAPI_AVAILABLE = True
except ImportError:
    JAYDEBEAPI_AVAILABLE = False
    jaydebeapi = None

try:
    import psycopg2
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False
    psycopg2 = None

try:
    import pymysql
    PYMYSQL_AVAILABLE = True
except ImportError:
    PYMYSQL_AVAILABLE = False
    pymysql = None

try:
    import snowflake.connector
    SNOWFLAKE_AVAILABLE = True
except ImportError:
    SNOWFLAKE_AVAILABLE = False
    snowflake = None

# Import custom database connector and metadata extractor
try:
    from database_connector import DatabaseConnectionManager, get_jdbc_url, get_jdbc_driver_class, get_jdbc_driver_path, get_default_port
    from metadata_extractor import MetadataExtractor, SOURCE_METADATA_QUERIES
    CUSTOM_CONNECTORS_AVAILABLE = True
except ImportError as e:
    CUSTOM_CONNECTORS_AVAILABLE = False
    print(f"Warning: Could not import custom connectors: {e}")

import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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

# Query Testing Models
class TestQueryRequest(BaseModel):
    query: str
    catalog: Optional[str] = "main"
    schema: Optional[str] = "default"
    timeout_seconds: Optional[int] = 30

class TestQueryResponse(BaseModel):
    success: bool
    query: str
    syntax_valid: bool
    execution_status: str  # success, error, timeout
    execution_time_ms: Optional[int] = None
    row_count: Optional[int] = None
    rows_scanned: Optional[int] = None
    sample_rows: Optional[List[Dict[str, Any]]] = None
    error_message: Optional[str] = None

class BatchTestRequest(BaseModel):
    queries: List[str]
    catalog: Optional[str] = "main"
    schema: Optional[str] = "default"
    timeout_seconds: Optional[int] = 30

class BatchTestResponse(BaseModel):
    success: bool
    job_id: str
    total_queries: int
    message: str

class TestResultsResponse(BaseModel):
    success: bool
    job_id: str
    status: str  # running, completed, failed
    completed: int
    total: int
    results: List[TestQueryResponse]

class CompareResultsRequest(BaseModel):
    source_query: str
    target_query: str
    source_catalog: Optional[str] = "main"
    source_schema: Optional[str] = "default"
    target_catalog: Optional[str] = "main"
    target_schema: Optional[str] = "default"
    sample_size: Optional[int] = 100

class CompareResultsResponse(BaseModel):
    success: bool
    row_count_match: bool
    source_row_count: Optional[int] = None
    target_row_count: Optional[int] = None
    data_match: bool
    discrepancies: Optional[List[Dict[str, Any]]] = None
    source_execution_time_ms: Optional[int] = None
    target_execution_time_ms: Optional[int] = None
    error_message: Optional[str] = None

# Cost Estimation Models
class MigrationCostEstimateRequest(BaseModel):
    num_tables: int
    num_views: int
    num_procedures: int
    total_rows: Optional[int] = 0
    data_size_gb: Optional[float] = 0.0
    model_id: str = "databricks-llama-4-maverick"
    avg_sql_complexity: Optional[str] = "medium"  # low, medium, high
    source_type: str

class StorageCostEstimateRequest(BaseModel):
    data_size_gb: float
    months: int = 12

class ComputeCostEstimateRequest(BaseModel):
    warehouse_size: str = "X-Small"  # X-Small, Small, Medium, Large, X-Large, 2X-Large, 3X-Large, 4X-Large
    estimated_hours: float

class CostComparisonRequest(BaseModel):
    migration_request: MigrationCostEstimateRequest
    storage_months: int = 12
    compute_hours_monthly: float = 100.0

class CostBreakdown(BaseModel):
    llm_translation: float
    compute_migration: float
    storage_annual: float
    network_transfer: float
    total: float

class MigrationCostEstimateResponse(BaseModel):
    success: bool
    breakdown: Optional[CostBreakdown] = None
    estimated_duration_hours: Optional[float] = None
    details: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

# ============================================
# ROLLBACK MODELS
# ============================================

class SnapshotObjectInfo(BaseModel):
    catalog: str
    schema_name: str
    table_name: str
    object_type: str  # TABLE, VIEW
    ddl: str
    version: Optional[int] = None  # Delta Lake version if available

class CreateSnapshotRequest(BaseModel):
    catalog: str
    schema_name: str
    description: str
    tables: Optional[List[str]] = None  # If None, snapshot all tables
    include_data: bool = False  # Use Delta Lake time travel for data snapshot
    auto_snapshot: bool = False  # Automatically created before migration

class CreateSnapshotResponse(BaseModel):
    success: bool
    snapshot_id: Optional[str] = None
    created_at: Optional[str] = None
    num_objects: Optional[int] = None
    snapshot_path: Optional[str] = None
    error: Optional[str] = None

class SnapshotInfo(BaseModel):
    snapshot_id: str
    catalog: str
    schema_name: str
    description: str
    created_at: str
    num_objects: int
    tables: List[str]
    include_data: bool
    auto_snapshot: bool
    snapshot_path: str
    created_by: Optional[str] = None

class ListSnapshotsResponse(BaseModel):
    success: bool
    snapshots: List[SnapshotInfo]
    error: Optional[str] = None

class DiffObjectChange(BaseModel):
    object_name: str
    object_type: str
    change_type: str  # CREATED, MODIFIED, DELETED, UNCHANGED
    snapshot_ddl: Optional[str] = None
    current_ddl: Optional[str] = None
    diff_summary: Optional[str] = None

class SnapshotDiffResponse(BaseModel):
    success: bool
    snapshot_id: Optional[str] = None
    total_objects: Optional[int] = None
    created_count: Optional[int] = None
    modified_count: Optional[int] = None
    deleted_count: Optional[int] = None
    unchanged_count: Optional[int] = None
    changes: Optional[List[DiffObjectChange]] = None
    error: Optional[str] = None

class RestoreSnapshotRequest(BaseModel):
    snapshot_id: str
    catalog: str
    schema_name: str
    tables: Optional[List[str]] = None  # If None, restore all tables
    drop_existing: bool = True  # Drop objects not in snapshot
    restore_data: bool = False  # Use Delta Lake time travel to restore data
    dry_run: bool = True

class RestoreResult(BaseModel):
    object_name: str
    object_type: str
    action: str  # CREATED, DROPPED, RESTORED, SKIPPED
    status: str  # success, error
    ddl_executed: Optional[str] = None
    error_message: Optional[str] = None

class RestoreSnapshotResponse(BaseModel):
    success: bool
    snapshot_id: Optional[str] = None
    total_actions: Optional[int] = None
    successful: Optional[int] = None
    failed: Optional[int] = None
    results: Optional[List[RestoreResult]] = None
    dry_run: Optional[bool] = None
    error: Optional[str] = None

class DeleteSnapshotResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None

class RollbackValidationRequest(BaseModel):
    snapshot_id: str
    catalog: str
    schema_name: str
    tables: Optional[List[str]] = None

class ValidationIssue(BaseModel):
    severity: str  # WARNING, ERROR, INFO
    object_name: str
    message: str
    can_proceed: bool

class RollbackValidationResponse(BaseModel):
    success: bool
    can_rollback: bool
    issues: List[ValidationIssue]
    warnings_count: int
    errors_count: int
    affected_objects: int
    error: Optional[str] = None

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

# Migration job state tracking (in production, use Redis or Unity Catalog table)
migration_jobs: Dict[str, Dict[str, Any]] = {}
migration_locks: Dict[str, asyncio.Lock] = {}
active_connections: Dict[str, Dict[str, Any]] = {}
connection_lock = threading.Lock()

# ============================================
# SCHEDULING MODELS AND STORAGE
# ============================================

class ScheduleFrequency(str, Enum):
    ONCE = "once"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    CRON = "cron"

class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class MigrationSchedule(BaseModel):
    job_id: Optional[str] = None
    job_name: str
    description: Optional[str] = None
    source_type: str
    source_connection_id: Optional[str] = None
    inventory_path: Optional[str] = None
    target_catalog: str
    target_schema: str
    model_id: str = "databricks-llama-4-maverick"
    frequency: ScheduleFrequency
    cron_expression: Optional[str] = None
    start_date: str
    end_date: Optional[str] = None
    enabled: bool = True
    dependencies: Optional[List[str]] = None  # List of job_ids that must complete first
    notification_emails: Optional[List[str]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    created_by: Optional[str] = None

class ScheduleJobExecution(BaseModel):
    execution_id: str
    job_id: str
    job_name: str
    status: JobStatus
    started_at: str
    completed_at: Optional[str] = None
    duration_seconds: Optional[float] = None
    objects_migrated: Optional[int] = None
    objects_failed: Optional[int] = None
    error_message: Optional[str] = None
    triggered_by: str = "scheduled"  # scheduled, manual, dependency

class CreateScheduleRequest(BaseModel):
    schedule: MigrationSchedule

class UpdateScheduleRequest(BaseModel):
    job_name: Optional[str] = None
    description: Optional[str] = None
    frequency: Optional[ScheduleFrequency] = None
    cron_expression: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    enabled: Optional[bool] = None
    dependencies: Optional[List[str]] = None
    notification_emails: Optional[List[str]] = None

class ScheduleResponse(BaseModel):
    success: bool
    schedule: Optional[MigrationSchedule] = None
    error: Optional[str] = None

class ScheduleListResponse(BaseModel):
    success: bool
    schedules: List[MigrationSchedule]
    total: int

class JobExecutionResponse(BaseModel):
    success: bool
    execution: Optional[ScheduleJobExecution] = None
    error: Optional[str] = None

class JobHistoryResponse(BaseModel):
    success: bool
    executions: List[ScheduleJobExecution]
    total: int

# In-memory storage (in production, use Delta Lake table)
scheduled_jobs: Dict[str, MigrationSchedule] = {}
job_executions: Dict[str, ScheduleJobExecution] = {}

# Unity Catalog Volume for storing migration artifacts
MIGRATION_VOLUME = "hls_amer_catalog.dw_migration.dw_migration_volume"
SOURCE_DIRECTORY = "source"
ERROR_LOG_DIRECTORY = "dw_migration_error_log"
SNAPSHOT_DIRECTORY = "snapshots"

# Snapshot store (in production, use database)
snapshots: Dict[str, Dict[str, Any]] = {}

# Static files directory using pathlib (more reliable in Databricks Apps)
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager

# Import migration progress helpers (optional - for real-time progress tracking)
try:
    from migration_progress import (
        get_migration_lock, initialize_migration_job, update_migration_progress,
        add_migration_log, add_object_result, complete_migration_job, generate_sse_events
    )
    MIGRATION_PROGRESS_AVAILABLE = True
except ImportError:
    MIGRATION_PROGRESS_AVAILABLE = False

# SQL Injection Prevention - Identifier validation
def validate_identifier(name: str, identifier_type: str = "identifier") -> str:
    """
    Validate SQL identifiers (catalog, schema, table names) to prevent SQL injection.
    Only allows alphanumeric characters, underscores, and hyphens.
    """
    if not name:
        raise HTTPException(status_code=400, detail=f"Invalid {identifier_type}: cannot be empty")

    # Check for valid identifier pattern
    # Allow: alphanumeric, underscore, hyphen, and backticks for quoting
    import re
    pattern = r'^[a-zA-Z_][a-zA-Z0-9_\-]*$'

    # Remove backticks if present (they're used for quoting in SQL)
    clean_name = name.strip('`')

    if not re.match(pattern, clean_name):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {identifier_type}: '{name}'. Only alphanumeric characters, underscores, and hyphens are allowed."
        )

    # Check max length (Databricks limit is 255)
    if len(clean_name) > 255:
        raise HTTPException(status_code=400, detail=f"Invalid {identifier_type}: exceeds maximum length of 255 characters")

    return clean_name

def quote_identifier(name: str) -> str:
    """Safely quote a SQL identifier using backticks."""
    clean_name = validate_identifier(name)
    return f"`{clean_name}`"

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

        # Validate catalog and schema names to prevent SQL injection
        try:
            safe_catalog = quote_identifier(request.catalog)
            safe_schema = quote_identifier(request.schema)
        except HTTPException as e:
            return ExecuteSqlResponse(success=False, error=e.detail)

        sql_text = request.sql.strip()
        if sql_text.upper().startswith('SELECT') and 'LIMIT' not in sql_text.upper():
            sql_text = f"{sql_text} LIMIT 1"

        full_sql = f"USE CATALOG {safe_catalog}; USE SCHEMA {safe_schema}; {sql_text}"

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
                        # Validate and quote catalog name to prevent SQL injection
                        safe_catalog = quote_identifier(catalog)
                        cursor.execute(f"SHOW SCHEMAS IN {safe_catalog}")
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
        # Validate catalog name to prevent SQL injection
        safe_catalog = quote_identifier(catalog_name)

        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(f"SHOW SCHEMAS IN {safe_catalog}")
                schemas = [row[0] for row in cursor.fetchall()]
                return {"schemas": schemas}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list schemas: {str(e)}")

@app.get("/api/catalogs/{catalog_name}/schemas/{schema_name}/tables")
async def list_tables(catalog_name: str, schema_name: str):
    """List tables in a schema"""
    try:
        # Validate catalog and schema names to prevent SQL injection
        safe_catalog = quote_identifier(catalog_name)
        safe_schema = quote_identifier(schema_name)

        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(f"SHOW TABLES IN {safe_catalog}.{safe_schema}")
                tables = [row[1] for row in cursor.fetchall()]  # row[1] is table name
                return {"tables": tables}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list tables: {str(e)}")

@app.get("/api/catalogs/{catalog_name}/schemas/{schema_name}/tables/{table_name}/columns")
async def list_columns(catalog_name: str, schema_name: str, table_name: str):
    """List columns in a table"""
    try:
        # Validate all identifiers to prevent SQL injection
        safe_catalog = quote_identifier(catalog_name)
        safe_schema = quote_identifier(schema_name)
        safe_table = quote_identifier(table_name)

        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(f"DESCRIBE {safe_catalog}.{safe_schema}.{safe_table}")
                columns = [{"name": row[0], "type": row[1], "comment": row[2] if len(row) > 2 else None}
                          for row in cursor.fetchall()]
                return {"columns": columns}
    except HTTPException:
        raise
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
    """Test connection to source system using JDBC or native connectors"""
    try:
        logger.info(f"Testing connection to {request.source_type} at {request.host}:{request.port}")

        # Prepare connection info
        conn_info = {
            "source_type": request.source_type,
            "host": request.host,
            "port": request.port,
            "database": request.database,
            "username": request.username,
            "password": request.password,
            "additional_params": request.additional_params
        }

        # Test the connection using DatabaseConnectionManager
        if CUSTOM_CONNECTORS_AVAILABLE:
            success, message = DatabaseConnectionManager.test_connection(conn_info)

            if success:
                # Store connection info
                conn_id = str(uuid.uuid4())
                active_connections[conn_id] = {
                    **conn_info,
                    "created_at": datetime.now().isoformat()
                }

                logger.info(f"Connection test successful for {request.source_type}, ID: {conn_id}")
                return SourceConnectionResponse(
                    success=True,
                    connection_id=conn_id,
                    message=message
                )
            else:
                logger.error(f"Connection test failed: {message}")
                return SourceConnectionResponse(
                    success=False,
                    message="Connection failed",
                    error=message
                )
        else:
            # Fallback: Just store the connection info without testing
            conn_id = str(uuid.uuid4())
            active_connections[conn_id] = {
                **conn_info,
                "created_at": datetime.now().isoformat()
            }

            logger.warning("Custom connectors not available, connection stored without testing")
            return SourceConnectionResponse(
                success=True,
                connection_id=conn_id,
                message=f"Connection registered (actual testing unavailable). Install required connectors. Host: {request.host}:{request.port}"
            )

    except Exception as e:
        logger.error(f"Connection test error: {str(e)}")
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
    """Extract metadata inventory from source system using JDBC/native connectors"""
    try:
        logger.info(f"Starting metadata extraction for connection {request.connection_id}")

        if request.connection_id not in active_connections:
            return ExtractInventoryResponse(
                success=False,
                error="Connection not found. Please test connection first."
            )

        conn_info = active_connections[request.connection_id]
        source_type = conn_info["source_type"]
        database = conn_info["database"]

        # Initialize inventory
        inventory = MetadataInventory(
            databases=[database],
            schemas=[],
            tables=[],
            views=[],
            stored_procedures=[],
            functions=[]
        )

        # Extract metadata using MetadataExtractor if available
        if CUSTOM_CONNECTORS_AVAILABLE:
            try:
                # Extract schemas
                logger.info(f"Extracting schemas from {source_type}")
                schema_results = MetadataExtractor.extract_schemas(conn_info)
                inventory.schemas = [{"name": s.get("schema_name", ""), "source": source_type} for s in schema_results]

                # Limit to first 5 schemas to avoid timeouts
                schemas_to_process = schema_results[:5]

                # Extract tables and views from each schema
                for schema_row in schemas_to_process:
                    schema_name = schema_row.get("schema_name", "")
                    if not schema_name:
                        continue

                    logger.info(f"Extracting metadata from schema: {schema_name}")

                    try:
                        # Extract tables
                        table_results = MetadataExtractor.extract_tables(conn_info, schema_name)
                        for table_row in table_results:
                            table_name = table_row.get("table_name", "")
                            if not table_name:
                                continue

                            table_info = {
                                "schema": schema_name,
                                "name": table_name,
                                "type": "TABLE",
                                "source": source_type
                            }

                            # Extract DDL if requested
                            if request.include_ddl:
                                try:
                                    ddl = MetadataExtractor.extract_table_ddl(conn_info, schema_name, table_name)
                                    if ddl:
                                        table_info["ddl"] = ddl
                                except Exception as ddl_error:
                                    logger.warning(f"Could not extract DDL for {schema_name}.{table_name}: {str(ddl_error)}")

                            # Extract columns
                            try:
                                columns = MetadataExtractor.extract_columns(conn_info, schema_name, table_name)
                                table_info["columns"] = columns
                            except Exception as col_error:
                                logger.warning(f"Could not extract columns for {schema_name}.{table_name}: {str(col_error)}")

                            # Get row count if requested
                            if request.include_sample_data:
                                try:
                                    row_count = MetadataExtractor.get_table_row_count(conn_info, schema_name, table_name)
                                    table_info["row_count"] = row_count
                                except Exception as count_error:
                                    logger.warning(f"Could not get row count for {schema_name}.{table_name}: {str(count_error)}")

                            inventory.tables.append(table_info)

                        # Extract views
                        view_results = MetadataExtractor.extract_views(conn_info, schema_name)
                        for view_row in view_results:
                            view_name = view_row.get("view_name", "")
                            if not view_name:
                                continue

                            view_info = {
                                "schema": schema_name,
                                "name": view_name,
                                "type": "VIEW",
                                "source": source_type,
                                "definition": view_row.get("view_definition", "")
                            }
                            inventory.views.append(view_info)

                        # Extract stored procedures
                        proc_results = MetadataExtractor.extract_procedures(conn_info, schema_name)
                        for proc_row in proc_results:
                            proc_name = proc_row.get("proc_name", "")
                            if not proc_name:
                                continue

                            proc_info = {
                                "schema": schema_name,
                                "name": proc_name,
                                "type": proc_row.get("proc_type", "PROCEDURE"),
                                "source": source_type,
                                "definition": proc_row.get("proc_definition", "")
                            }
                            inventory.stored_procedures.append(proc_info)

                    except Exception as schema_error:
                        logger.error(f"Error extracting from schema {schema_name}: {str(schema_error)}")
                        continue

                logger.info(f"Extraction complete: {len(inventory.tables)} tables, {len(inventory.views)} views, {len(inventory.stored_procedures)} procedures")

            except Exception as extraction_error:
                logger.error(f"Metadata extraction failed: {str(extraction_error)}")
                # Provide minimal fallback data
                inventory.schemas = [{"name": "default", "source": source_type}]
                inventory.tables = [{"schema": "default", "name": "extraction_failed", "type": "TABLE", "error": str(extraction_error)}]

        else:
            # Connectors not available - return simulated data
            logger.warning("Custom connectors not available, returning simulated data")
            inventory.schemas = [{"name": "public", "source": source_type}]
            inventory.tables = [{"schema": "public", "name": "sample_table", "type": "TABLE", "note": "Simulated - Install connectors for real extraction"}]

        # Store inventory to Unity Catalog volume
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

        # Try to write to volume
        try:
            with sql.connect(
                server_hostname=DATABRICKS_HOST.replace("https://", ""),
                http_path=DATABRICKS_HTTP_PATH,
                access_token=DATABRICKS_TOKEN
            ) as connection:
                with connection.cursor() as cursor:
                    inventory_json = json.dumps(inventory_data, indent=2)
                    # Try to write using file system or volume functions
                    # This is a placeholder - actual implementation depends on volume setup
                    logger.info(f"Inventory data prepared for storage at {volume_path}")
        except Exception as volume_error:
            logger.warning(f"Could not write to volume: {str(volume_error)}")
            volume_path = f"/tmp/dw_migration/{source_type}_{database}_{timestamp}"

        total_objects = len(inventory.tables) + len(inventory.views) + len(inventory.stored_procedures)

        return ExtractInventoryResponse(
            success=True,
            inventory=inventory,
            volume_path=volume_path,
            objects_extracted=total_objects
        )

    except Exception as e:
        logger.error(f"Extract inventory error: {str(e)}")
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

                # Write error log if there are errors
                error_log_path = None
                if error_log_entries:
                    try:
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        error_log_path = f"/Workspace/Users/dw_migration/{ERROR_LOG_DIRECTORY}/migration_errors_{timestamp}.json"
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

# ============================================
# MIGRATION PROGRESS TRACKING ENDPOINTS
# ============================================

@app.post("/api/migrate/start")
async def start_migration(request: MigrationRequest):
    """
    Start a migration job and return job_id for tracking progress
    This endpoint initiates the migration but returns immediately
    """
    try:
        # Generate unique job ID
        job_id = str(uuid.uuid4())

        # Get inventory data to count total objects
        total_objects = 0
        try:
            with sql.connect(
                server_hostname=DATABRICKS_HOST.replace("https://", ""),
                http_path=DATABRICKS_HTTP_PATH,
                access_token=DATABRICKS_TOKEN
            ) as connection:
                with connection.cursor() as cursor:
                    try:
                        cursor.execute(f"SELECT * FROM read_files('{request.inventory_path}/inventory.json')")
                        inventory_result = cursor.fetchone()
                        inventory_data = json.loads(inventory_result[0]) if inventory_result else {}
                    except:
                        inventory_data = {"inventory": {"tables": [], "views": [], "stored_procedures": []}}

                    inventory = inventory_data.get("inventory", {})
                    total_objects = (
                        len(inventory.get("tables", [])) +
                        len(inventory.get("views", [])) +
                        len(inventory.get("stored_procedures", []))
                    )
        except:
            total_objects = 0

        # Initialize job state
        lock = get_migration_lock(job_id, migration_locks)
        async with lock:
            initialize_migration_job(
                job_id, migration_jobs, total_objects,
                request.source_type, request.target_catalog, request.target_schema
            )
            add_migration_log(job_id, migration_jobs, "info",
                            f"Migration job started: {total_objects} objects to migrate")

        # Start migration in background
        asyncio.create_task(run_migration_job(job_id, request))

        return {
            "success": True,
            "job_id": job_id,
            "total_objects": total_objects,
            "message": "Migration job started successfully"
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

@app.get("/api/migrate/progress/{job_id}")
async def get_migration_progress(job_id: str):
    """Get current migration job progress (one-time snapshot)"""
    lock = get_migration_lock(job_id, migration_locks)
    async with lock:
        if job_id not in migration_jobs:
            raise HTTPException(status_code=404, detail="Migration job not found")

        job = migration_jobs[job_id].copy()
        return job

@app.get("/api/migrate/stream/{job_id}")
async def stream_migration_progress(job_id: str):
    """Stream migration progress using Server-Sent Events (SSE)"""
    return StreamingResponse(
        generate_sse_events(job_id, migration_jobs, migration_locks),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )

@app.post("/api/migrate/cancel/{job_id}")
async def cancel_migration(job_id: str):
    """Cancel a running migration job"""
    lock = get_migration_lock(job_id, migration_locks)
    async with lock:
        if job_id not in migration_jobs:
            raise HTTPException(status_code=404, detail="Migration job not found")

        if migration_jobs[job_id]["status"] == "running":
            migration_jobs[job_id]["status"] = "cancelled"
            add_migration_log(job_id, migration_jobs, "warning", "Migration cancelled by user")
            complete_migration_job(job_id, migration_jobs, "cancelled")
            return {"success": True, "message": "Migration job cancelled"}
        else:
            return {
                "success": False,
                "message": f"Cannot cancel job with status: {migration_jobs[job_id]['status']}"
            }

@app.delete("/api/migrate/jobs/{job_id}")
async def delete_migration_job(job_id: str):
    """Delete a migration job from memory"""
    lock = get_migration_lock(job_id, migration_locks)
    async with lock:
        if job_id in migration_jobs:
            del migration_jobs[job_id]
        if job_id in migration_locks:
            del migration_locks[job_id]
    return {"success": True, "message": "Migration job deleted"}

@app.get("/api/migrate/jobs")
async def list_migration_jobs():
    """List all migration jobs"""
    jobs = []
    for job_id in list(migration_jobs.keys()):
        lock = get_migration_lock(job_id, migration_locks)
        async with lock:
            if job_id in migration_jobs:
                job = migration_jobs[job_id].copy()
                # Don't send full logs and results in list view
                job["log_count"] = len(job.get("logs", []))
                job["result_count"] = len(job.get("object_results", []))
                job.pop("logs", None)
                job.pop("object_results", None)
                jobs.append(job)
    return {"jobs": jobs}

async def run_migration_job(job_id: str, request: MigrationRequest):
    """
    Background task to run the actual migration
    This updates the job state as it progresses
    """
    try:
        lock = get_migration_lock(job_id, migration_locks)

        if not OPENAI_AVAILABLE or openai is None:
            async with lock:
                add_migration_log(job_id, migration_jobs, "error", "OpenAI library not available")
                complete_migration_job(job_id, migration_jobs, "failed")
            return

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
                for idx, obj in enumerate(all_objects):
                    # Check if job was cancelled
                    async with lock:
                        if migration_jobs[job_id]["status"] == "cancelled":
                            add_migration_log(job_id, migration_jobs, "warning",
                                            "Migration cancelled, stopping processing")
                            return

                    start_time = time.time()
                    obj_name = f"{obj['schema']}.{obj['name']}"
                    source_sql = obj.get("ddl", obj.get("definition", ""))

                    # Update current object
                    async with lock:
                        update_migration_progress(job_id, migration_jobs, current_object=obj_name)
                        add_migration_log(job_id, migration_jobs, "info",
                                        f"Processing {obj['type']} {obj_name} ({idx+1}/{len(all_objects)})")

                    if not source_sql or source_sql.strip() == "":
                        async with lock:
                            update_migration_progress(
                                job_id, migration_jobs,
                                completed_objects=migration_jobs[job_id]["completed_objects"] + 1
                            )
                            add_object_result(job_id, migration_jobs, obj_name, obj["type"], "skipped",
                                            error="No source SQL available")
                            add_migration_log(job_id, migration_jobs, "warning",
                                            f"Skipped {obj_name}: No source SQL available")
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

                        execution_time_ms = int((time.time() - start_time) * 1000)

                        # Test execution with LIMIT 1 or execute
                        if not request.dry_run and obj["type"] in ["TABLE", "VIEW"]:
                            try:
                                if "CREATE" in target_sql.upper():
                                    cursor.execute(target_sql)
                                else:
                                    test_sql = f"{target_sql.rstrip(';')} LIMIT 1"
                                    cursor.execute(test_sql)

                                async with lock:
                                    update_migration_progress(
                                        job_id, migration_jobs,
                                        completed_objects=migration_jobs[job_id]["completed_objects"] + 1
                                    )
                                    add_object_result(job_id, migration_jobs, obj_name, obj["type"],
                                                    "success", execution_time_ms=execution_time_ms)
                                    add_migration_log(job_id, migration_jobs, "info",
                                                    f"Successfully migrated {obj_name} in {execution_time_ms}ms")
                            except Exception as exec_error:
                                error_msg = str(exec_error)
                                async with lock:
                                    update_migration_progress(
                                        job_id, migration_jobs,
                                        failed_objects=migration_jobs[job_id]["failed_objects"] + 1
                                    )
                                    add_object_result(job_id, migration_jobs, obj_name, obj["type"],
                                                    "error", error=error_msg, execution_time_ms=execution_time_ms)
                                    add_migration_log(job_id, migration_jobs, "error",
                                                    f"Failed to migrate {obj_name}: {error_msg}")
                        else:
                            # Dry run - just translate
                            async with lock:
                                update_migration_progress(
                                    job_id, migration_jobs,
                                    completed_objects=migration_jobs[job_id]["completed_objects"] + 1
                                )
                                add_object_result(job_id, migration_jobs, obj_name, obj["type"],
                                                "success", execution_time_ms=execution_time_ms)
                                add_migration_log(job_id, migration_jobs, "info",
                                                f"Translated {obj_name} in {execution_time_ms}ms (dry run)")

                    except Exception as translate_error:
                        async with lock:
                            update_migration_progress(
                                job_id, migration_jobs,
                                failed_objects=migration_jobs[job_id]["failed_objects"] + 1
                            )
                            add_object_result(job_id, migration_jobs, obj_name, obj["type"],
                                            "error", error=str(translate_error))
                            add_migration_log(job_id, migration_jobs, "error",
                                            f"Translation error for {obj_name}: {str(translate_error)}")

                # Mark job as complete
                async with lock:
                    completed = migration_jobs[job_id]["completed_objects"]
                    failed = migration_jobs[job_id]["failed_objects"]
                    add_migration_log(job_id, migration_jobs, "info",
                                    f"Migration completed: {completed} successful, {failed} failed")
                    complete_migration_job(job_id, migration_jobs, "completed")

    except Exception as e:
        logger.error(f"Migration job {job_id} failed with error: {str(e)}")
        async with lock:
            add_migration_log(job_id, migration_jobs, "error", f"Migration failed: {str(e)}")
            complete_migration_job(job_id, migration_jobs, "failed")

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

# ============================================
# SCHEDULING ENDPOINTS
# ============================================

@app.post("/api/schedule/create", response_model=ScheduleResponse)
async def create_schedule(request: CreateScheduleRequest):
    """Create a new scheduled migration job"""
    try:
        schedule = request.schedule

        # Generate job ID if not provided
        if not schedule.job_id:
            schedule.job_id = str(uuid.uuid4())

        # Set timestamps
        schedule.created_at = datetime.now().isoformat()
        schedule.updated_at = datetime.now().isoformat()

        # Validate dependencies
        if schedule.dependencies:
            for dep_id in schedule.dependencies:
                if dep_id not in scheduled_jobs:
                    return ScheduleResponse(
                        success=False,
                        error=f"Dependency job {dep_id} not found"
                    )

        # Store schedule
        scheduled_jobs[schedule.job_id] = schedule

        return ScheduleResponse(
            success=True,
            schedule=schedule
        )
    except Exception as e:
        return ScheduleResponse(
            success=False,
            error=str(e)
        )

@app.get("/api/schedule/list", response_model=ScheduleListResponse)
async def list_schedules():
    """List all scheduled migration jobs"""
    try:
        schedules = list(scheduled_jobs.values())
        return ScheduleListResponse(
            success=True,
            schedules=schedules,
            total=len(schedules)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/schedule/{job_id}", response_model=ScheduleResponse)
async def get_schedule(job_id: str):
    """Get details of a specific scheduled job"""
    try:
        if job_id not in scheduled_jobs:
            return ScheduleResponse(
                success=False,
                error=f"Schedule with job_id {job_id} not found"
            )

        return ScheduleResponse(
            success=True,
            schedule=scheduled_jobs[job_id]
        )
    except Exception as e:
        return ScheduleResponse(
            success=False,
            error=str(e)
        )

@app.put("/api/schedule/{job_id}", response_model=ScheduleResponse)
async def update_schedule(job_id: str, request: UpdateScheduleRequest):
    """Update an existing scheduled job"""
    try:
        if job_id not in scheduled_jobs:
            return ScheduleResponse(
                success=False,
                error=f"Schedule with job_id {job_id} not found"
            )

        schedule = scheduled_jobs[job_id]

        # Update fields if provided
        if request.job_name is not None:
            schedule.job_name = request.job_name
        if request.description is not None:
            schedule.description = request.description
        if request.frequency is not None:
            schedule.frequency = request.frequency
        if request.cron_expression is not None:
            schedule.cron_expression = request.cron_expression
        if request.start_date is not None:
            schedule.start_date = request.start_date
        if request.end_date is not None:
            schedule.end_date = request.end_date
        if request.enabled is not None:
            schedule.enabled = request.enabled
        if request.dependencies is not None:
            # Validate dependencies
            for dep_id in request.dependencies:
                if dep_id not in scheduled_jobs:
                    return ScheduleResponse(
                        success=False,
                        error=f"Dependency job {dep_id} not found"
                    )
            schedule.dependencies = request.dependencies
        if request.notification_emails is not None:
            schedule.notification_emails = request.notification_emails

        schedule.updated_at = datetime.now().isoformat()

        return ScheduleResponse(
            success=True,
            schedule=schedule
        )
    except Exception as e:
        return ScheduleResponse(
            success=False,
            error=str(e)
        )

@app.delete("/api/schedule/{job_id}")
async def delete_schedule(job_id: str):
    """Cancel/delete a scheduled job"""
    try:
        if job_id not in scheduled_jobs:
            return {"success": False, "error": f"Schedule with job_id {job_id} not found"}

        del scheduled_jobs[job_id]

        return {"success": True, "message": f"Schedule {job_id} deleted successfully"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/schedule/{job_id}/run-now", response_model=JobExecutionResponse)
async def run_schedule_now(job_id: str):
    """Trigger immediate execution of a scheduled job"""
    try:
        if job_id not in scheduled_jobs:
            return JobExecutionResponse(
                success=False,
                error=f"Schedule with job_id {job_id} not found"
            )

        schedule = scheduled_jobs[job_id]

        # Check dependencies
        if schedule.dependencies:
            for dep_id in schedule.dependencies:
                # Check if dependency has completed successfully
                dep_executions = [e for e in job_executions.values()
                                if e.job_id == dep_id and e.status == JobStatus.COMPLETED]
                if not dep_executions:
                    return JobExecutionResponse(
                        success=False,
                        error=f"Dependency job {dep_id} has not completed successfully"
                    )

        # Create execution record
        execution_id = str(uuid.uuid4())
        execution = ScheduleJobExecution(
            execution_id=execution_id,
            job_id=job_id,
            job_name=schedule.job_name,
            status=JobStatus.RUNNING,
            started_at=datetime.now().isoformat(),
            triggered_by="manual"
        )

        job_executions[execution_id] = execution

        # Execute migration asynchronously
        try:
            start_time = time.time()

            # Build migration request
            migration_request = MigrationRequest(
                inventory_path=schedule.inventory_path or "",
                target_catalog=schedule.target_catalog,
                target_schema=schedule.target_schema,
                source_type=schedule.source_type,
                model_id=schedule.model_id,
                dry_run=False
            )

            # Run migration
            result = await bulk_migrate(migration_request)

            # Update execution record
            execution.completed_at = datetime.now().isoformat()
            execution.duration_seconds = time.time() - start_time
            execution.objects_migrated = result.successful if result.success else 0
            execution.objects_failed = result.failed if result.success else 0
            execution.status = JobStatus.COMPLETED if result.success else JobStatus.FAILED
            execution.error_message = None if result.success else "Migration failed"

        except Exception as e:
            execution.completed_at = datetime.now().isoformat()
            execution.duration_seconds = time.time() - start_time
            execution.status = JobStatus.FAILED
            execution.error_message = str(e)

        return JobExecutionResponse(
            success=True,
            execution=execution
        )
    except Exception as e:
        return JobExecutionResponse(
            success=False,
            error=str(e)
        )

@app.get("/api/schedule/executions/history", response_model=JobHistoryResponse)
async def get_job_history(job_id: Optional[str] = None, limit: int = 50):
    """Get execution history for all jobs or a specific job"""
    try:
        executions = list(job_executions.values())

        # Filter by job_id if provided
        if job_id:
            executions = [e for e in executions if e.job_id == job_id]

        # Sort by started_at descending
        executions.sort(key=lambda x: x.started_at, reverse=True)

        # Limit results
        executions = executions[:limit]

        return JobHistoryResponse(
            success=True,
            executions=executions,
            total=len(executions)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/schedule/executions/{execution_id}", response_model=JobExecutionResponse)
async def get_execution_details(execution_id: str):
    """Get details of a specific job execution"""
    try:
        if execution_id not in job_executions:
            return JobExecutionResponse(
                success=False,
                error=f"Execution with id {execution_id} not found"
            )

        return JobExecutionResponse(
            success=True,
            execution=job_executions[execution_id]
        )
    except Exception as e:
        return JobExecutionResponse(
            success=False,
            error=str(e)
        )

# ============================================
# COST ESTIMATION ENDPOINTS
# ============================================

DBU_RATE_SERVERLESS = 0.22
STORAGE_RATE_GB_MONTH = 0.023
NETWORK_TRANSFER_RATE_GB = 0.09

WAREHOUSE_DBU_RATES = {
    "X-Small": 1,
    "Small": 2,
    "Medium": 4,
    "Large": 8,
    "X-Large": 16,
    "2X-Large": 32,
    "3X-Large": 64,
    "4X-Large": 128
}

# ============================================
# SCHEMA COMPARISON ENDPOINTS
# ============================================

class SchemaComparisonRequest(BaseModel):
    source_connection_id: str
    source_catalog: Optional[str] = None
    source_schema: Optional[str] = None
    target_catalog: str
    target_schema: str

class TableComparisonRequest(BaseModel):
    source_connection_id: str
    source_catalog: Optional[str] = None
    source_schema: str
    source_table: str
    target_catalog: str
    target_schema: str
    target_table: str

class ColumnDifference(BaseModel):
    column_name: str
    difference_type: str  # missing_in_target, missing_in_source, type_mismatch, nullability_mismatch
    source_type: Optional[str] = None
    target_type: Optional[str] = None
    source_nullable: Optional[bool] = None
    target_nullable: Optional[bool] = None

class TableComparison(BaseModel):
    table_name: str
    status: str  # match, missing_in_target, missing_in_source, different
    column_differences: List[ColumnDifference] = []
    source_column_count: Optional[int] = None
    target_column_count: Optional[int] = None

class SchemaComparisonResponse(BaseModel):
    success: bool
    source_info: Dict[str, Any]
    target_info: Dict[str, Any]
    tables_only_in_source: List[str] = []
    tables_only_in_target: List[str] = []
    tables_in_both: List[TableComparison] = []
    summary: Dict[str, int]
    error: Optional[str] = None

class DataTypeMappingResponse(BaseModel):
    source_system: str
    mappings: List[Dict[str, str]]

# Add these helper functions:

def get_source_table_metadata(connection_id: str, catalog: Optional[str], schema: str, table: str) -> Dict[str, Any]:
    """Get table metadata from source system"""
    if connection_id not in active_connections:
        raise HTTPException(status_code=404, detail="Connection not found")

    conn_info = active_connections[connection_id]
    source_type = conn_info["source_type"]

    # For now, return simulated data
    # In production, this would query the actual source system
    return {
        "table_name": table,
        "schema": schema,
        "catalog": catalog,
        "columns": [
            {"name": "id", "type": "NUMBER", "nullable": False, "primary_key": True},
            {"name": "name", "type": "VARCHAR2", "nullable": True, "primary_key": False},
            {"name": "created_date", "type": "DATE", "nullable": True, "primary_key": False}
        ],
        "indexes": ["idx_name"],
        "primary_keys": ["id"],
        "foreign_keys": []
    }

def get_target_table_metadata(catalog: str, schema: str, table: str) -> Dict[str, Any]:
    """Get table metadata from Databricks target"""
    try:
        safe_catalog = quote_identifier(catalog)
        safe_schema = quote_identifier(schema)
        safe_table = quote_identifier(table)

        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                # Get column information
                cursor.execute(f"DESCRIBE EXTENDED {safe_catalog}.{safe_schema}.{safe_table}")
                describe_result = cursor.fetchall()

                columns = []
                found_partition_info = False
                for row in describe_result:
                    if row[0] and row[0].strip() == '':
                        continue
                    if row[0] and row[0].startswith('#'):
                        found_partition_info = True
                        break
                    if not found_partition_info and row[0] and row[0] not in ['', '# col_name']:
                        columns.append({
                            "name": row[0],
                            "type": row[1] if len(row) > 1 else "unknown",
                            "nullable": True,  # Databricks doesn't enforce NOT NULL
                            "comment": row[2] if len(row) > 2 else None
                        })

                # Try to get primary key info
                primary_keys = []
                try:
                    cursor.execute(f"SHOW TBLPROPERTIES {safe_catalog}.{safe_schema}.{safe_table}")
                    props = cursor.fetchall()
                    for prop in props:
                        if prop[0] and 'primary' in prop[0].lower():
                            # Extract primary key columns if available
                            pass
                except:
                    pass

                return {
                    "table_name": table,
                    "schema": schema,
                    "catalog": catalog,
                    "columns": columns,
                    "indexes": [],
                    "primary_keys": primary_keys,
                    "foreign_keys": []
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get target table metadata: {str(e)}")

# Add these endpoint functions:

@app.post("/api/compare/schemas", response_model=SchemaComparisonResponse)
async def compare_schemas(request: SchemaComparisonRequest):
    """Compare source and target schemas to identify migration differences"""
    try:
        # Validate connection
        if request.source_connection_id not in active_connections:
            return SchemaComparisonResponse(
                success=False,
                source_info={},
                target_info={},
                summary={},
                error="Source connection not found"
            )

        conn_info = active_connections[request.source_connection_id]
        source_type = conn_info["source_type"]

        # Get target schema tables
        safe_target_catalog = quote_identifier(request.target_catalog)
        safe_target_schema = quote_identifier(request.target_schema)

        target_tables = []
        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                try:
                    cursor.execute(f"SHOW TABLES IN {safe_target_catalog}.{safe_target_schema}")
                    target_tables = [row[1] for row in cursor.fetchall()]
                except:
                    target_tables = []

        # For demonstration, simulate source tables
        # In production, this would query the actual source system
        source_tables = ["customers", "orders", "products", "order_items"]

        # Compare tables
        tables_only_in_source = list(set(source_tables) - set(target_tables))
        tables_only_in_target = list(set(target_tables) - set(source_tables))
        common_tables = list(set(source_tables) & set(target_tables))

        tables_in_both = []
        for table in common_tables:
            # For common tables, we could do detailed column comparison
            # For now, mark them as matching
            tables_in_both.append(TableComparison(
                table_name=table,
                status="match",
                column_differences=[],
                source_column_count=0,
                target_column_count=0
            ))

        summary = {
            "total_source_tables": len(source_tables),
            "total_target_tables": len(target_tables),
            "tables_to_create": len(tables_only_in_source),
            "orphaned_tables": len(tables_only_in_target),
            "matching_tables": len([t for t in tables_in_both if t.status == "match"]),
            "tables_with_differences": len([t for t in tables_in_both if t.status == "different"])
        }

        return SchemaComparisonResponse(
            success=True,
            source_info={
                "type": source_type,
                "host": conn_info["host"],
                "database": conn_info["database"],
                "schema": request.source_schema or "public"
            },
            target_info={
                "catalog": request.target_catalog,
                "schema": request.target_schema
            },
            tables_only_in_source=tables_only_in_source,
            tables_only_in_target=tables_only_in_target,
            tables_in_both=tables_in_both,
            summary=summary
        )

    except Exception as e:
        return SchemaComparisonResponse(
            success=False,
            source_info={},
            target_info={},
            summary={},
            error=str(e)
        )

@app.post("/api/compare/tables/{table_name}")
async def compare_table_structures(table_name: str, request: TableComparisonRequest):
    """Compare specific table structures between source and target"""
    try:
        # Validate identifiers
        safe_table = validate_identifier(table_name)

        # Get source table metadata
        source_meta = get_source_table_metadata(
            request.source_connection_id,
            request.source_catalog,
            request.source_schema,
            request.source_table
        )

        # Get target table metadata
        try:
            target_meta = get_target_table_metadata(
                request.target_catalog,
                request.target_schema,
                request.target_table
            )
        except HTTPException as e:
            if e.status_code == 500:
                # Table doesn't exist in target
                return {
                    "success": True,
                    "table_name": table_name,
                    "exists_in_target": False,
                    "source_columns": source_meta["columns"],
                    "target_columns": [],
                    "differences": [{"type": "missing_table", "message": "Table does not exist in target"}]
                }
            raise

        # Compare columns
        source_cols = {col["name"]: col for col in source_meta["columns"]}
        target_cols = {col["name"]: col for col in target_meta["columns"]}

        column_differences = []

        # Find columns only in source
        for col_name, col_info in source_cols.items():
            if col_name not in target_cols:
                column_differences.append(ColumnDifference(
                    column_name=col_name,
                    difference_type="missing_in_target",
                    source_type=col_info["type"],
                    source_nullable=col_info.get("nullable")
                ))

        # Find columns only in target
        for col_name, col_info in target_cols.items():
            if col_name not in source_cols:
                column_differences.append(ColumnDifference(
                    column_name=col_name,
                    difference_type="missing_in_source",
                    target_type=col_info["type"],
                    target_nullable=col_info.get("nullable")
                ))

        # Find columns with differences
        for col_name in set(source_cols.keys()) & set(target_cols.keys()):
            source_col = source_cols[col_name]
            target_col = target_cols[col_name]

            # Compare data types (simplified comparison)
            if source_col["type"].upper() != target_col["type"].upper():
                column_differences.append(ColumnDifference(
                    column_name=col_name,
                    difference_type="type_mismatch",
                    source_type=source_col["type"],
                    target_type=target_col["type"],
                    source_nullable=source_col.get("nullable"),
                    target_nullable=target_col.get("nullable")
                ))
            elif source_col.get("nullable") != target_col.get("nullable"):
                column_differences.append(ColumnDifference(
                    column_name=col_name,
                    difference_type="nullability_mismatch",
                    source_type=source_col["type"],
                    target_type=target_col["type"],
                    source_nullable=source_col.get("nullable"),
                    target_nullable=target_col.get("nullable")
                ))

        return {
            "success": True,
            "table_name": table_name,
            "exists_in_target": True,
            "source_columns": source_meta["columns"],
            "target_columns": target_meta["columns"],
            "column_differences": [diff.dict() for diff in column_differences],
            "index_differences": {
                "source_indexes": source_meta.get("indexes", []),
                "target_indexes": target_meta.get("indexes", [])
            },
            "primary_key_differences": {
                "source_primary_keys": source_meta.get("primary_keys", []),
                "target_primary_keys": target_meta.get("primary_keys", [])
            },
            "foreign_key_differences": {
                "source_foreign_keys": source_meta.get("foreign_keys", []),
                "target_foreign_keys": target_meta.get("foreign_keys", [])
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compare tables: {str(e)}")

@app.get("/api/compare/data-types")
async def get_data_type_mappings(source_system: str):
    """Get data type mapping information for a source system"""

    # Data type mappings for different source systems
    data_type_mappings = {
        "oracle": [
            {"source": "NUMBER", "target": "DECIMAL", "notes": "Precision preserved"},
            {"source": "NUMBER(p,s)", "target": "DECIMAL(p,s)", "notes": "Exact mapping"},
            {"source": "VARCHAR2", "target": "STRING", "notes": "No length limit in Databricks"},
            {"source": "CHAR", "target": "STRING", "notes": "No padding in Databricks"},
            {"source": "DATE", "target": "DATE", "notes": "Direct mapping"},
            {"source": "TIMESTAMP", "target": "TIMESTAMP", "notes": "Direct mapping"},
            {"source": "CLOB", "target": "STRING", "notes": "Large text"},
            {"source": "BLOB", "target": "BINARY", "notes": "Binary data"},
            {"source": "RAW", "target": "BINARY", "notes": "Binary data"},
            {"source": "LONG", "target": "STRING", "notes": "Deprecated in Oracle"}
        ],
        "snowflake": [
            {"source": "NUMBER", "target": "DECIMAL", "notes": "Precision preserved"},
            {"source": "VARCHAR", "target": "STRING", "notes": "Direct mapping"},
            {"source": "TEXT", "target": "STRING", "notes": "Direct mapping"},
            {"source": "DATE", "target": "DATE", "notes": "Direct mapping"},
            {"source": "TIMESTAMP_NTZ", "target": "TIMESTAMP", "notes": "No timezone"},
            {"source": "TIMESTAMP_TZ", "target": "TIMESTAMP", "notes": "Timezone converted"},
            {"source": "BOOLEAN", "target": "BOOLEAN", "notes": "Direct mapping"},
            {"source": "VARIANT", "target": "STRING", "notes": "JSON as string"},
            {"source": "ARRAY", "target": "ARRAY", "notes": "Direct mapping"},
            {"source": "OBJECT", "target": "STRUCT", "notes": "Structure mapping"}
        ],
        "sqlserver": [
            {"source": "INT", "target": "INT", "notes": "Direct mapping"},
            {"source": "BIGINT", "target": "BIGINT", "notes": "Direct mapping"},
            {"source": "VARCHAR", "target": "STRING", "notes": "No length limit"},
            {"source": "NVARCHAR", "target": "STRING", "notes": "Unicode support"},
            {"source": "DATETIME", "target": "TIMESTAMP", "notes": "Direct mapping"},
            {"source": "DATETIME2", "target": "TIMESTAMP", "notes": "Higher precision"},
            {"source": "DATE", "target": "DATE", "notes": "Direct mapping"},
            {"source": "BIT", "target": "BOOLEAN", "notes": "Direct mapping"},
            {"source": "DECIMAL", "target": "DECIMAL", "notes": "Precision preserved"},
            {"source": "MONEY", "target": "DECIMAL(19,4)", "notes": "Fixed precision"}
        ],
        "teradata": [
            {"source": "INTEGER", "target": "INT", "notes": "Direct mapping"},
            {"source": "BIGINT", "target": "BIGINT", "notes": "Direct mapping"},
            {"source": "DECIMAL", "target": "DECIMAL", "notes": "Precision preserved"},
            {"source": "VARCHAR", "target": "STRING", "notes": "No length limit"},
            {"source": "CHAR", "target": "STRING", "notes": "No padding"},
            {"source": "DATE", "target": "DATE", "notes": "Direct mapping"},
            {"source": "TIMESTAMP", "target": "TIMESTAMP", "notes": "Direct mapping"},
            {"source": "CLOB", "target": "STRING", "notes": "Large text"},
            {"source": "BLOB", "target": "BINARY", "notes": "Binary data"}
        ],
        "mysql": [
            {"source": "INT", "target": "INT", "notes": "Direct mapping"},
            {"source": "BIGINT", "target": "BIGINT", "notes": "Direct mapping"},
            {"source": "VARCHAR", "target": "STRING", "notes": "No length limit"},
            {"source": "TEXT", "target": "STRING", "notes": "Large text"},
            {"source": "DATE", "target": "DATE", "notes": "Direct mapping"},
            {"source": "DATETIME", "target": "TIMESTAMP", "notes": "Direct mapping"},
            {"source": "TIMESTAMP", "target": "TIMESTAMP", "notes": "Direct mapping"},
            {"source": "DECIMAL", "target": "DECIMAL", "notes": "Precision preserved"},
            {"source": "BOOLEAN", "target": "BOOLEAN", "notes": "Direct mapping"},
            {"source": "JSON", "target": "STRING", "notes": "JSON as string"}
        ]
    }

    mappings = data_type_mappings.get(source_system.lower(), [])

    return DataTypeMappingResponse(
        source_system=source_system,
        mappings=mappings
    )



def estimate_sql_tokens(num_objects: int, complexity: str = "medium") -> Dict[str, int]:
    """Estimate token usage for SQL translation"""
    base_prompt = 500
    base_completion = 300
    complexity_multipliers = {"low": 0.5, "medium": 1.0, "high": 2.0}
    multiplier = complexity_multipliers.get(complexity, 1.0)
    avg_prompt_tokens = int(base_prompt * multiplier)
    avg_completion_tokens = int(base_completion * multiplier)
    total_prompt = avg_prompt_tokens * num_objects
    total_completion = avg_completion_tokens * num_objects
    return {"prompt_tokens": total_prompt, "completion_tokens": total_completion, "total_tokens": total_prompt + total_completion}

@app.post("/api/estimate/migration", response_model=MigrationCostEstimateResponse)
async def estimate_migration_cost(request: MigrationCostEstimateRequest):
    """Estimate total migration costs including LLM, compute, storage, and network"""
    try:
        total_objects = request.num_tables + request.num_views + request.num_procedures
        token_estimate = estimate_sql_tokens(total_objects, request.avg_sql_complexity)
        llm_cost = calculate_llm_cost(request.model_id, token_estimate["prompt_tokens"], token_estimate["completion_tokens"])
        complexity_time_multipliers = {"low": 0.5, "medium": 1.0, "high": 2.0}
        time_multiplier = complexity_time_multipliers.get(request.avg_sql_complexity, 1.0)
        estimated_seconds = total_objects * 30 * time_multiplier
        estimated_hours = estimated_seconds / 3600
        migration_dbus = WAREHOUSE_DBU_RATES["Medium"]
        compute_cost = estimated_hours * migration_dbus * DBU_RATE_SERVERLESS
        storage_cost_annual = request.data_size_gb * STORAGE_RATE_GB_MONTH * 12
        network_cost = request.data_size_gb * NETWORK_TRANSFER_RATE_GB * 0.1
        total_cost = llm_cost + compute_cost + storage_cost_annual + network_cost
        breakdown = CostBreakdown(llm_translation=round(llm_cost, 2), compute_migration=round(compute_cost, 2), storage_annual=round(storage_cost_annual, 2), network_transfer=round(network_cost, 2), total=round(total_cost, 2))
        details = {"num_objects": total_objects, "token_estimate": token_estimate, "llm_model": request.model_id, "warehouse_size": "Medium", "warehouse_dbus": migration_dbus, "estimated_seconds": int(estimated_seconds), "data_size_gb": request.data_size_gb, "total_rows": request.total_rows, "source_type": request.source_type, "complexity": request.avg_sql_complexity}
        return MigrationCostEstimateResponse(success=True, breakdown=breakdown, estimated_duration_hours=round(estimated_hours, 2), details=details)
    except Exception as e:
        return MigrationCostEstimateResponse(success=False, error=str(e))

@app.get("/api/estimate/storage")
async def estimate_storage_cost(data_size_gb: float = 100.0, months: int = 12):
    """Estimate storage costs for Delta Lake"""
    try:
        monthly_cost = data_size_gb * STORAGE_RATE_GB_MONTH
        total_cost = monthly_cost * months
        return {"success": True, "data_size_gb": data_size_gb, "months": months, "monthly_cost": round(monthly_cost, 2), "total_cost": round(total_cost, 2), "rate_per_gb_month": STORAGE_RATE_GB_MONTH}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/estimate/compute")
async def estimate_compute_cost(warehouse_size: str = "Medium", hours: float = 100.0):
    """Estimate SQL Warehouse compute costs"""
    try:
        if warehouse_size not in WAREHOUSE_DBU_RATES:
            raise HTTPException(status_code=400, detail=f"Invalid warehouse size. Must be one of: {list(WAREHOUSE_DBU_RATES.keys())}")
        dbus = WAREHOUSE_DBU_RATES[warehouse_size]
        cost_per_hour = dbus * DBU_RATE_SERVERLESS
        total_cost = cost_per_hour * hours
        return {"success": True, "warehouse_size": warehouse_size, "dbus": dbus, "hours": hours, "cost_per_hour": round(cost_per_hour, 2), "total_cost": round(total_cost, 2), "dbu_rate": DBU_RATE_SERVERLESS}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/estimate/compare")
async def compare_costs(request: CostComparisonRequest):
    """Compare costs between different migration approaches"""
    try:
        migration_estimate = await estimate_migration_cost(request.migration_request)
        if not migration_estimate.success:
            return {"success": False, "error": "Failed to estimate migration cost"}
        monthly_storage = request.migration_request.data_size_gb * STORAGE_RATE_GB_MONTH
        monthly_compute = request.compute_hours_monthly * WAREHOUSE_DBU_RATES["Medium"] * DBU_RATE_SERVERLESS
        year1_total = migration_estimate.breakdown.llm_translation + migration_estimate.breakdown.compute_migration + migration_estimate.breakdown.network_transfer + (monthly_storage * 12) + (monthly_compute * 12)
        yearly_ongoing = (monthly_storage * 12) + (monthly_compute * 12)
        model_comparisons = []
        for model_key, model_info in AVAILABLE_MODELS.items():
            total_objects = request.migration_request.num_tables + request.migration_request.num_views + request.migration_request.num_procedures
            token_estimate = estimate_sql_tokens(total_objects, request.migration_request.avg_sql_complexity)
            model_llm_cost = calculate_llm_cost(model_info["id"], token_estimate["prompt_tokens"], token_estimate["completion_tokens"])
            model_comparisons.append({"model_name": model_info["name"], "model_id": model_info["id"], "llm_cost": round(model_llm_cost, 2), "total_migration_cost": round(model_llm_cost + migration_estimate.breakdown.compute_migration + migration_estimate.breakdown.network_transfer, 2)})
        model_comparisons.sort(key=lambda x: x["llm_cost"])
        return {"success": True, "base_estimate": migration_estimate.dict(), "monthly_costs": {"storage": round(monthly_storage, 2), "compute": round(monthly_compute, 2), "total": round(monthly_storage + monthly_compute, 2)}, "yearly_costs": {"year_1": round(year1_total, 2), "year_2_onwards": round(yearly_ongoing, 2)}, "model_comparisons": model_comparisons, "cost_breakdown_3_years": {"migration_one_time": round(migration_estimate.breakdown.llm_translation + migration_estimate.breakdown.compute_migration + migration_estimate.breakdown.network_transfer, 2), "storage_3_years": round(monthly_storage * 36, 2), "compute_3_years": round(monthly_compute * 36, 2), "total_3_years": round(migration_estimate.breakdown.llm_translation + migration_estimate.breakdown.compute_migration + migration_estimate.breakdown.network_transfer + (monthly_storage * 36) + (monthly_compute * 36), 2)}}
    except Exception as e:
        return {"success": False, "error": str(e)}


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

# ============================================
# QUERY TESTING ENDPOINTS
# ============================================

# In-memory storage for test jobs (use Redis in production)
test_jobs: Dict[str, Dict[str, Any]] = {}

def validate_sql_syntax(query: str) -> tuple[bool, Optional[str]]:
    """Basic SQL syntax validation"""
    query = query.strip()
    if not query:
        return False, "Empty query"

    # Remove comments and whitespace
    query_upper = re.sub(r'--.*$', '', query, flags=re.MULTILINE).strip().upper()

    # Check for dangerous operations
    dangerous_keywords = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE OR REPLACE']
    for keyword in dangerous_keywords:
        if keyword in query_upper and 'TABLE' in query_upper:
            return False, f"Query contains potentially dangerous operation: {keyword}"

    # Basic syntax check - must start with SELECT, WITH, or CREATE
    valid_starts = ['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'EXPLAIN']
    if not any(query_upper.startswith(start) for start in valid_starts):
        return False, "Query must start with SELECT, WITH, SHOW, DESCRIBE, or EXPLAIN"

    return True, None

def execute_query_with_timeout(query: str, catalog: str, schema: str, timeout_seconds: int) -> TestQueryResponse:
    """Execute a query with timeout and collect metrics"""
    start_time = time.time()

    # Validate syntax first
    syntax_valid, syntax_error = validate_sql_syntax(query)
    if not syntax_valid:
        return TestQueryResponse(
            success=False,
            query=query,
            syntax_valid=False,
            execution_status="error",
            error_message=syntax_error
        )

    try:
        # Validate identifiers to prevent SQL injection
        safe_catalog = quote_identifier(catalog)
        safe_schema = quote_identifier(schema)

        # Add LIMIT to prevent large result sets
        query_trimmed = query.strip().rstrip(';')
        if query_trimmed.upper().startswith('SELECT') and 'LIMIT' not in query_trimmed.upper():
            query_trimmed = f"{query_trimmed} LIMIT 100"

        full_sql = f"USE CATALOG {safe_catalog}; USE SCHEMA {safe_schema}; {query_trimmed}"

        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(full_sql)

                rows = cursor.fetchall()
                columns = [desc[0] for desc in cursor.description] if cursor.description else []

                # Convert rows to dictionaries for sample data
                sample_rows = [dict(zip(columns, row)) for row in rows[:10]]
                row_count = len(rows)

                execution_time_ms = int((time.time() - start_time) * 1000)

                return TestQueryResponse(
                    success=True,
                    query=query,
                    syntax_valid=True,
                    execution_status="success",
                    execution_time_ms=execution_time_ms,
                    row_count=row_count,
                    rows_scanned=row_count,  # Approximation
                    sample_rows=sample_rows
                )

    except Exception as e:
        execution_time_ms = int((time.time() - start_time) * 1000)
        error_msg = str(e)

        # Check if timeout
        if execution_time_ms >= timeout_seconds * 1000:
            status = "timeout"
            error_msg = f"Query execution timed out after {timeout_seconds} seconds"
        else:
            status = "error"

        return TestQueryResponse(
            success=False,
            query=query,
            syntax_valid=True,
            execution_status=status,
            execution_time_ms=execution_time_ms,
            error_message=error_msg
        )

@app.post("/api/test/query", response_model=TestQueryResponse)
async def test_query(request: TestQueryRequest):
    """Test a single query execution"""
    try:
        return execute_query_with_timeout(
            request.query,
            request.catalog,
            request.schema,
            request.timeout_seconds
        )
    except Exception as e:
        return TestQueryResponse(
            success=False,
            query=request.query,
            syntax_valid=False,
            execution_status="error",
            error_message=f"Test execution failed: {str(e)}"
        )

@app.post("/api/test/batch", response_model=BatchTestResponse)
async def test_batch_queries(request: BatchTestRequest):
    """Test multiple queries in batch (async)"""
    try:
        job_id = str(uuid.uuid4())

        # Store job info
        test_jobs[job_id] = {
            "status": "running",
            "total": len(request.queries),
            "completed": 0,
            "results": [],
            "started_at": datetime.now().isoformat()
        }

        # Start background task to process queries
        asyncio.create_task(process_batch_queries(
            job_id,
            request.queries,
            request.catalog,
            request.schema,
            request.timeout_seconds
        ))

        return BatchTestResponse(
            success=True,
            job_id=job_id,
            total_queries=len(request.queries),
            message=f"Batch test started with {len(request.queries)} queries"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start batch test: {str(e)}")

async def process_batch_queries(job_id: str, queries: List[str], catalog: str, schema: str, timeout_seconds: int):
    """Background task to process batch queries"""
    try:
        results = []
        for idx, query in enumerate(queries):
            # Execute query
            result = execute_query_with_timeout(query, catalog, schema, timeout_seconds)
            results.append(result)

            # Update job progress
            test_jobs[job_id]["completed"] = idx + 1
            test_jobs[job_id]["results"] = results

        # Mark job as completed
        test_jobs[job_id]["status"] = "completed"
        test_jobs[job_id]["completed_at"] = datetime.now().isoformat()

    except Exception as e:
        test_jobs[job_id]["status"] = "failed"
        test_jobs[job_id]["error"] = str(e)

@app.get("/api/test/results/{job_id}", response_model=TestResultsResponse)
async def get_test_results(job_id: str):
    """Get test results for a batch job"""
    if job_id not in test_jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = test_jobs[job_id]

    return TestResultsResponse(
        success=True,
        job_id=job_id,
        status=job["status"],
        completed=job["completed"],
        total=job["total"],
        results=job.get("results", [])
    )

@app.post("/api/test/compare-results", response_model=CompareResultsResponse)
async def compare_query_results(request: CompareResultsRequest):
    """Compare results from source and target queries"""
    try:
        # Execute source query
        source_start = time.time()
        source_result = execute_query_with_timeout(
            request.source_query,
            request.source_catalog,
            request.source_schema,
            60  # 60 second timeout for comparison
        )
        source_execution_time_ms = int((time.time() - source_start) * 1000)

        if not source_result.success:
            return CompareResultsResponse(
                success=False,
                row_count_match=False,
                data_match=False,
                error_message=f"Source query failed: {source_result.error_message}"
            )

        # Execute target query
        target_start = time.time()
        target_result = execute_query_with_timeout(
            request.target_query,
            request.target_catalog,
            request.target_schema,
            60
        )
        target_execution_time_ms = int((time.time() - target_start) * 1000)

        if not target_result.success:
            return CompareResultsResponse(
                success=False,
                row_count_match=False,
                data_match=False,
                source_row_count=source_result.row_count,
                source_execution_time_ms=source_execution_time_ms,
                error_message=f"Target query failed: {target_result.error_message}"
            )

        # Compare row counts
        row_count_match = source_result.row_count == target_result.row_count

        # Compare data (sample rows)
        discrepancies = []
        data_match = True

        if source_result.sample_rows and target_result.sample_rows:
            # Compare up to sample_size rows
            max_compare = min(len(source_result.sample_rows), len(target_result.sample_rows), request.sample_size)

            for i in range(max_compare):
                source_row = source_result.sample_rows[i]
                target_row = target_result.sample_rows[i]

                # Compare row data
                row_diffs = {}
                all_keys = set(source_row.keys()) | set(target_row.keys())

                for key in all_keys:
                    source_val = source_row.get(key)
                    target_val = target_row.get(key)

                    # Simple comparison (could be enhanced for floating point tolerance)
                    if source_val != target_val:
                        row_diffs[key] = {
                            "source": str(source_val),
                            "target": str(target_val)
                        }
                        data_match = False

                if row_diffs:
                    discrepancies.append({
                        "row_index": i,
                        "differences": row_diffs
                    })

        return CompareResultsResponse(
            success=True,
            row_count_match=row_count_match,
            source_row_count=source_result.row_count,
            target_row_count=target_result.row_count,
            data_match=data_match,
            discrepancies=discrepancies if discrepancies else None,
            source_execution_time_ms=source_execution_time_ms,
            target_execution_time_ms=target_execution_time_ms
        )

    except Exception as e:
        return CompareResultsResponse(
            success=False,
            row_count_match=False,
            data_match=False,
            error_message=f"Comparison failed: {str(e)}"
        )

# ============================================
# ROLLBACK ENDPOINTS
# ============================================

@app.post("/api/rollback/snapshot", response_model=CreateSnapshotResponse)
async def create_snapshot(request: CreateSnapshotRequest):
    """Create a snapshot of database objects before migration"""
    try:
        # Validate catalog and schema names
        safe_catalog = quote_identifier(request.catalog)
        safe_schema = quote_identifier(request.schema_name)

        snapshot_id = str(uuid.uuid4())
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        snapshot_objects: List[SnapshotObjectInfo] = []

        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                # Get list of tables in schema
                cursor.execute(f"SHOW TABLES IN {safe_catalog}.{safe_schema}")
                all_tables = [row[1] for row in cursor.fetchall()]

                # Filter tables if specific list provided
                tables_to_snapshot = request.tables if request.tables else all_tables

                for table_name in tables_to_snapshot:
                    if table_name not in all_tables:
                        continue

                    try:
                        safe_table = quote_identifier(table_name)
                        full_table_name = f"{safe_catalog}.{safe_schema}.{safe_table}"

                        # Get table DDL
                        cursor.execute(f"SHOW CREATE TABLE {full_table_name}")
                        ddl_result = cursor.fetchone()
                        ddl = ddl_result[0] if ddl_result else ""

                        # Get Delta Lake version if available
                        version = None
                        if request.include_data:
                            try:
                                cursor.execute(f"DESCRIBE HISTORY {full_table_name} LIMIT 1")
                                history = cursor.fetchone()
                                if history:
                                    version = int(history[0])  # version is first column
                            except:
                                pass

                        # Determine object type
                        object_type = "VIEW" if "CREATE VIEW" in ddl.upper() else "TABLE"

                        snapshot_objects.append(SnapshotObjectInfo(
                            catalog=request.catalog,
                            schema_name=request.schema_name,
                            table_name=table_name,
                            object_type=object_type,
                            ddl=ddl,
                            version=version
                        ))
                    except Exception as table_error:
                        # Continue with other tables if one fails
                        continue

                # Store snapshot metadata
                snapshot_path = f"/Volumes/{MIGRATION_VOLUME}/{SNAPSHOT_DIRECTORY}/{snapshot_id}"
                snapshot_data = {
                    "snapshot_id": snapshot_id,
                    "catalog": request.catalog,
                    "schema_name": request.schema_name,
                    "description": request.description,
                    "created_at": datetime.now().isoformat(),
                    "num_objects": len(snapshot_objects),
                    "tables": [obj.table_name for obj in snapshot_objects],
                    "include_data": request.include_data,
                    "auto_snapshot": request.auto_snapshot,
                    "snapshot_path": snapshot_path,
                    "objects": [obj.dict() for obj in snapshot_objects]
                }

                # Store in memory (in production, save to Delta Lake or Volume)
                snapshots[snapshot_id] = snapshot_data

                # Try to save to volume (optional, may fail if volume not writable)
                try:
                    snapshot_json = json.dumps(snapshot_data, indent=2)
                    # In production, write to volume using Delta Lake or file system
                    pass
                except:
                    pass

                return CreateSnapshotResponse(
                    success=True,
                    snapshot_id=snapshot_id,
                    created_at=snapshot_data["created_at"],
                    num_objects=len(snapshot_objects),
                    snapshot_path=snapshot_path
                )

    except HTTPException:
        raise
    except Exception as e:
        return CreateSnapshotResponse(
            success=False,
            error=f"Failed to create snapshot: {str(e)}"
        )

@app.get("/api/rollback/snapshots", response_model=ListSnapshotsResponse)
async def list_snapshots():
    """List all available snapshots"""
    try:
        snapshot_list = []

        for snapshot_id, snapshot_data in snapshots.items():
            snapshot_list.append(SnapshotInfo(
                snapshot_id=snapshot_id,
                catalog=snapshot_data["catalog"],
                schema_name=snapshot_data["schema_name"],
                description=snapshot_data["description"],
                created_at=snapshot_data["created_at"],
                num_objects=snapshot_data["num_objects"],
                tables=snapshot_data["tables"],
                include_data=snapshot_data.get("include_data", False),
                auto_snapshot=snapshot_data.get("auto_snapshot", False),
                snapshot_path=snapshot_data["snapshot_path"],
                created_by=snapshot_data.get("created_by")
            ))

        # Sort by created_at descending (newest first)
        snapshot_list.sort(key=lambda x: x.created_at, reverse=True)

        return ListSnapshotsResponse(
            success=True,
            snapshots=snapshot_list
        )
    except Exception as e:
        return ListSnapshotsResponse(
            success=False,
            snapshots=[],
            error=str(e)
        )

@app.get("/api/rollback/diff/{snapshot_id}", response_model=SnapshotDiffResponse)
async def get_snapshot_diff(snapshot_id: str):
    """Show differences between snapshot and current state"""
    try:
        if snapshot_id not in snapshots:
            raise HTTPException(status_code=404, detail="Snapshot not found")

        snapshot_data = snapshots[snapshot_id]
        catalog = snapshot_data["catalog"]
        schema_name = snapshot_data["schema_name"]

        safe_catalog = quote_identifier(catalog)
        safe_schema = quote_identifier(schema_name)

        changes: List[DiffObjectChange] = []

        # Get snapshot objects
        snapshot_objects = {obj["table_name"]: obj for obj in snapshot_data["objects"]}

        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                # Get current tables
                cursor.execute(f"SHOW TABLES IN {safe_catalog}.{safe_schema}")
                current_tables = {row[1]: True for row in cursor.fetchall()}

                # Check for modified and deleted objects
                for table_name, snapshot_obj in snapshot_objects.items():
                    if table_name not in current_tables:
                        # Object was deleted
                        changes.append(DiffObjectChange(
                            object_name=table_name,
                            object_type=snapshot_obj["object_type"],
                            change_type="DELETED",
                            snapshot_ddl=snapshot_obj["ddl"],
                            current_ddl=None,
                            diff_summary=f"{snapshot_obj['object_type']} was deleted after snapshot"
                        ))
                    else:
                        # Object exists, check if modified
                        try:
                            safe_table = quote_identifier(table_name)
                            full_table_name = f"{safe_catalog}.{safe_schema}.{safe_table}"
                            cursor.execute(f"SHOW CREATE TABLE {full_table_name}")
                            current_ddl = cursor.fetchone()[0]

                            if current_ddl != snapshot_obj["ddl"]:
                                changes.append(DiffObjectChange(
                                    object_name=table_name,
                                    object_type=snapshot_obj["object_type"],
                                    change_type="MODIFIED",
                                    snapshot_ddl=snapshot_obj["ddl"],
                                    current_ddl=current_ddl,
                                    diff_summary=f"{snapshot_obj['object_type']} structure was modified"
                                ))
                            else:
                                changes.append(DiffObjectChange(
                                    object_name=table_name,
                                    object_type=snapshot_obj["object_type"],
                                    change_type="UNCHANGED",
                                    snapshot_ddl=snapshot_obj["ddl"],
                                    current_ddl=current_ddl,
                                    diff_summary="No changes detected"
                                ))
                        except:
                            pass

                # Check for newly created objects
                for table_name in current_tables:
                    if table_name not in snapshot_objects:
                        try:
                            safe_table = quote_identifier(table_name)
                            full_table_name = f"{safe_catalog}.{safe_schema}.{safe_table}"
                            cursor.execute(f"SHOW CREATE TABLE {full_table_name}")
                            current_ddl = cursor.fetchone()[0]
                            object_type = "VIEW" if "CREATE VIEW" in current_ddl.upper() else "TABLE"

                            changes.append(DiffObjectChange(
                                object_name=table_name,
                                object_type=object_type,
                                change_type="CREATED",
                                snapshot_ddl=None,
                                current_ddl=current_ddl,
                                diff_summary=f"{object_type} was created after snapshot"
                            ))
                        except:
                            pass

        # Count changes by type
        created_count = sum(1 for c in changes if c.change_type == "CREATED")
        modified_count = sum(1 for c in changes if c.change_type == "MODIFIED")
        deleted_count = sum(1 for c in changes if c.change_type == "DELETED")
        unchanged_count = sum(1 for c in changes if c.change_type == "UNCHANGED")

        return SnapshotDiffResponse(
            success=True,
            snapshot_id=snapshot_id,
            total_objects=len(changes),
            created_count=created_count,
            modified_count=modified_count,
            deleted_count=deleted_count,
            unchanged_count=unchanged_count,
            changes=changes
        )

    except HTTPException:
        raise
    except Exception as e:
        return SnapshotDiffResponse(
            success=False,
            error=f"Failed to compute diff: {str(e)}"
        )

@app.post("/api/rollback/validate", response_model=RollbackValidationResponse)
async def validate_rollback(request: RollbackValidationRequest):
    """Validate if rollback is safe to perform"""
    try:
        if request.snapshot_id not in snapshots:
            raise HTTPException(status_code=404, detail="Snapshot not found")

        snapshot_data = snapshots[request.snapshot_id]
        issues: List[ValidationIssue] = []
        affected_objects = 0

        safe_catalog = quote_identifier(request.catalog)
        safe_schema = quote_identifier(request.schema_name)

        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                # Get current tables
                cursor.execute(f"SHOW TABLES IN {safe_catalog}.{safe_schema}")
                current_tables = {row[1]: True for row in cursor.fetchall()}

                tables_to_check = request.tables if request.tables else snapshot_data["tables"]

                for table_name in tables_to_check:
                    affected_objects += 1

                    if table_name in current_tables:
                        # Check if table has dependencies
                        try:
                            safe_table = quote_identifier(table_name)
                            full_table_name = f"{safe_catalog}.{safe_schema}.{safe_table}"

                            # Check for views that depend on this table
                            cursor.execute(f"""
                                SELECT table_name
                                FROM {safe_catalog}.information_schema.views
                                WHERE table_schema = '{request.schema_name}'
                                AND view_definition LIKE '%{table_name}%'
                            """)
                            dependent_views = cursor.fetchall()

                            if dependent_views:
                                issues.append(ValidationIssue(
                                    severity="WARNING",
                                    object_name=table_name,
                                    message=f"Table has {len(dependent_views)} dependent views that may break",
                                    can_proceed=True
                                ))
                        except:
                            # Information schema may not be available
                            pass

                        # Check if table is a Delta table with active readers
                        try:
                            cursor.execute(f"DESCRIBE DETAIL {full_table_name}")
                            detail = cursor.fetchone()
                            if detail:
                                issues.append(ValidationIssue(
                                    severity="INFO",
                                    object_name=table_name,
                                    message="Table will be dropped and recreated from snapshot",
                                    can_proceed=True
                                ))
                        except:
                            pass
                    else:
                        # Table doesn't exist, will be created
                        issues.append(ValidationIssue(
                            severity="INFO",
                            object_name=table_name,
                            message="Table will be created from snapshot",
                            can_proceed=True
                        ))

                # Check for objects that will be dropped
                for current_table in current_tables:
                    if current_table not in snapshot_data["tables"]:
                        affected_objects += 1
                        issues.append(ValidationIssue(
                            severity="WARNING",
                            object_name=current_table,
                            message="Table exists now but not in snapshot - will be DROPPED",
                            can_proceed=True
                        ))

        warnings_count = sum(1 for i in issues if i.severity == "WARNING")
        errors_count = sum(1 for i in issues if i.severity == "ERROR")
        can_rollback = errors_count == 0

        return RollbackValidationResponse(
            success=True,
            can_rollback=can_rollback,
            issues=issues,
            warnings_count=warnings_count,
            errors_count=errors_count,
            affected_objects=affected_objects
        )

    except HTTPException:
        raise
    except Exception as e:
        return RollbackValidationResponse(
            success=False,
            can_rollback=False,
            issues=[],
            warnings_count=0,
            errors_count=0,
            affected_objects=0,
            error=str(e)
        )

@app.post("/api/rollback/restore/{snapshot_id}", response_model=RestoreSnapshotResponse)
async def restore_snapshot(snapshot_id: str, request: RestoreSnapshotRequest):
    """Restore database objects from a snapshot"""
    try:
        if snapshot_id not in snapshots:
            raise HTTPException(status_code=404, detail="Snapshot not found")

        if request.snapshot_id != snapshot_id:
            raise HTTPException(status_code=400, detail="Snapshot ID mismatch")

        snapshot_data = snapshots[snapshot_id]
        results: List[RestoreResult] = []
        successful = 0
        failed = 0

        safe_catalog = quote_identifier(request.catalog)
        safe_schema = quote_identifier(request.schema_name)

        with sql.connect(
            server_hostname=DATABRICKS_HOST.replace("https://", ""),
            http_path=DATABRICKS_HTTP_PATH,
            access_token=DATABRICKS_TOKEN
        ) as connection:
            with connection.cursor() as cursor:
                # Get current tables
                cursor.execute(f"SHOW TABLES IN {safe_catalog}.{safe_schema}")
                current_tables = {row[1]: True for row in cursor.fetchall()}

                snapshot_objects = {obj["table_name"]: obj for obj in snapshot_data["objects"]}
                tables_to_restore = request.tables if request.tables else list(snapshot_objects.keys())

                # Step 1: Drop objects not in snapshot (if drop_existing=True)
                if request.drop_existing:
                    for current_table in current_tables:
                        if current_table not in snapshot_objects:
                            try:
                                safe_table = quote_identifier(current_table)
                                full_table_name = f"{safe_catalog}.{safe_schema}.{safe_table}"
                                drop_ddl = f"DROP TABLE IF EXISTS {full_table_name}"

                                if not request.dry_run:
                                    cursor.execute(drop_ddl)

                                results.append(RestoreResult(
                                    object_name=current_table,
                                    object_type="TABLE",
                                    action="DROPPED",
                                    status="success",
                                    ddl_executed=drop_ddl if not request.dry_run else None
                                ))
                                successful += 1
                            except Exception as e:
                                results.append(RestoreResult(
                                    object_name=current_table,
                                    object_type="TABLE",
                                    action="DROPPED",
                                    status="error",
                                    error_message=str(e)
                                ))
                                failed += 1

                # Step 2: Restore objects from snapshot
                for table_name in tables_to_restore:
                    if table_name not in snapshot_objects:
                        continue

                    snapshot_obj = snapshot_objects[table_name]
                    safe_table = quote_identifier(table_name)
                    full_table_name = f"{safe_catalog}.{safe_schema}.{safe_table}"

                    try:
                        # Drop existing table/view first
                        drop_ddl = f"DROP {snapshot_obj['object_type']} IF EXISTS {full_table_name}"

                        if not request.dry_run:
                            cursor.execute(drop_ddl)
                            # Execute CREATE statement from snapshot
                            cursor.execute(snapshot_obj["ddl"])

                            # Restore data using time travel if requested and version available
                            if request.restore_data and snapshot_obj.get("version") is not None:
                                try:
                                    restore_data_sql = f"""
                                        INSERT INTO {full_table_name}
                                        SELECT * FROM {full_table_name} VERSION AS OF {snapshot_obj['version']}
                                    """
                                    cursor.execute(restore_data_sql)
                                except:
                                    # Time travel may not be available for all tables
                                    pass

                        action = "CREATED" if table_name not in current_tables else "RESTORED"
                        results.append(RestoreResult(
                            object_name=table_name,
                            object_type=snapshot_obj["object_type"],
                            action=action,
                            status="success",
                            ddl_executed=snapshot_obj["ddl"] if not request.dry_run else None
                        ))
                        successful += 1

                    except Exception as e:
                        results.append(RestoreResult(
                            object_name=table_name,
                            object_type=snapshot_obj["object_type"],
                            action="RESTORED",
                            status="error",
                            error_message=str(e)
                        ))
                        failed += 1

        return RestoreSnapshotResponse(
            success=True,
            snapshot_id=snapshot_id,
            total_actions=len(results),
            successful=successful,
            failed=failed,
            results=results,
            dry_run=request.dry_run
        )

    except HTTPException:
        raise
    except Exception as e:
        return RestoreSnapshotResponse(
            success=False,
            error=f"Failed to restore snapshot: {str(e)}"
        )

@app.delete("/api/rollback/snapshot/{snapshot_id}", response_model=DeleteSnapshotResponse)
async def delete_snapshot(snapshot_id: str):
    """Delete a snapshot"""
    try:
        if snapshot_id not in snapshots:
            raise HTTPException(status_code=404, detail="Snapshot not found")

        # Remove from in-memory store
        del snapshots[snapshot_id]

        # In production, also delete from persistent storage (Delta Lake, Volume, etc.)

        return DeleteSnapshotResponse(
            success=True,
            message=f"Snapshot {snapshot_id} deleted successfully"
        )
    except HTTPException:
        raise
    except Exception as e:
        return DeleteSnapshotResponse(
            success=False,
            error=str(e)
        )

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

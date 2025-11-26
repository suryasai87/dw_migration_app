# Backend Data Models Reference

## Location: `/backend/main.py`

## Core Models

### TranslateSqlRequest
```python
class TranslateSqlRequest(BaseModel):
    source_system: str  # oracle, snowflake, sqlserver, teradata, netezza, synapse, redshift, mysql
    source_sql: str
    model_id: str = "databricks-llama-4-maverick"
```

### ExecuteSqlRequest
```python
class ExecuteSqlRequest(BaseModel):
    sql: str
    catalog: Optional[str] = None
    schema_name: Optional[str] = None
    max_rows: int = 1000
```

### SuggestBusinessLogicRequest
```python
class SuggestBusinessLogicRequest(BaseModel):
    catalog: str
    schema_name: str
    table: str
    columns: List[str]
    model_id: str = "databricks-llama-4-maverick"
```

### SuggestJoinConditionsRequest
```python
class SuggestJoinConditionsRequest(BaseModel):
    tables: List[Dict[str, Any]]  # [{catalog, schema_name, table, columns}, ...]
    model_id: str = "databricks-llama-4-maverick"
```

### GenerateSqlRequest
```python
class GenerateSqlRequest(BaseModel):
    tables: List[Dict[str, Any]]  # [{catalog, schema_name, table, columns}, ...]
    business_logic: str
    model_id: str = "databricks-llama-4-maverick"
    join_conditions: Optional[str] = None
```

## Connect & Migrate Models (v3)

### SourceConnectionRequest
```python
class SourceConnectionRequest(BaseModel):
    source_type: str  # oracle, snowflake, sqlserver, teradata, netezza, synapse, redshift, mysql
    host: str
    port: int
    database: str
    username: str
    password: str
    additional_params: Optional[Dict[str, str]] = None  # For Snowflake: warehouse, role
```

### SourceConnectionResponse
```python
class SourceConnectionResponse(BaseModel):
    success: bool
    connection_id: Optional[str] = None
    connection_method: str  # "lakehouse_federation" or "jdbc"
    message: str
    error: Optional[str] = None
```

### MetadataInventory
```python
class MetadataInventory(BaseModel):
    databases: List[str]
    schemas: List[Dict[str, Any]]
    tables: List[Dict[str, Any]]
    views: List[Dict[str, Any]]
    stored_procedures: List[Dict[str, Any]]
    functions: List[Dict[str, Any]]
```

### ExtractInventoryRequest
```python
class ExtractInventoryRequest(BaseModel):
    connection_id: str
```

### ExtractInventoryResponse
```python
class ExtractInventoryResponse(BaseModel):
    success: bool
    stats: Dict[str, int]  # {databases, schemas, tables, views, stored_procedures, functions}
    inventory_path: str
    error: Optional[str] = None
```

### MigrationRequest
```python
class MigrationRequest(BaseModel):
    inventory_path: str
    target_catalog: str
    target_schema: str
    source_type: str
    model_id: str = "databricks-llama-4-maverick"
    dry_run: bool = True  # Test with LIMIT 1 without creating objects
```

### MigrationResult
```python
class MigrationResult(BaseModel):
    object_name: str
    object_type: str
    source_sql: str
    target_sql: str
    status: str  # success, error, skipped
    error_message: Optional[str] = None
    execution_time_ms: Optional[int] = None
```

### MigrationResponse
```python
class MigrationResponse(BaseModel):
    success: bool
    total_objects: int
    successful_migrations: int
    failed_migrations: int
    skipped: int
    migration_details: List[MigrationResult]
    error_log_path: Optional[str] = None
```

## Source Metadata Queries

### Oracle
```python
{
    "databases": "SELECT DISTINCT OWNER FROM ALL_TABLES WHERE OWNER NOT IN ('SYS','SYSTEM','OUTLN','DIP') ORDER BY OWNER",
    "schemas": "SELECT DISTINCT OWNER as schema_name FROM ALL_TABLES WHERE OWNER NOT IN ('SYS','SYSTEM') ORDER BY OWNER",
    "tables": "SELECT OWNER as schema_name, TABLE_NAME as table_name, 'TABLE' as object_type FROM ALL_TABLES WHERE OWNER = :schema",
    "views": "SELECT OWNER as schema_name, VIEW_NAME as view_name, TEXT as view_definition FROM ALL_VIEWS WHERE OWNER = :schema",
    "procedures": "SELECT OWNER as schema_name, OBJECT_NAME as proc_name, OBJECT_TYPE as proc_type FROM ALL_OBJECTS WHERE OBJECT_TYPE IN ('PROCEDURE','FUNCTION','PACKAGE') AND OWNER = :schema",
    "columns": "SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE FROM ALL_TAB_COLUMNS WHERE OWNER = :schema AND TABLE_NAME = :table ORDER BY COLUMN_ID",
    "table_ddl": "SELECT DBMS_METADATA.GET_DDL('TABLE', :table, :schema) as ddl FROM DUAL"
}
```

### Snowflake
```python
{
    "databases": "SHOW DATABASES",
    "schemas": "SHOW SCHEMAS IN DATABASE {database}",
    "tables": "SHOW TABLES IN SCHEMA {database}.{schema}",
    "views": "SHOW VIEWS IN SCHEMA {database}.{schema}",
    "procedures": "SHOW PROCEDURES IN SCHEMA {database}.{schema}",
    "columns": "DESCRIBE TABLE {database}.{schema}.{table}",
    "table_ddl": "SELECT GET_DDL('TABLE', '{database}.{schema}.{table}') as ddl"
}
```

### SQL Server / Azure Synapse
```python
{
    "databases": "SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb') ORDER BY name",
    "schemas": "SELECT SCHEMA_NAME as schema_name FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME NOT IN ('sys','INFORMATION_SCHEMA','guest') ORDER BY SCHEMA_NAME",
    "tables": "SELECT TABLE_SCHEMA as schema_name, TABLE_NAME as table_name, 'TABLE' as object_type FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = @schema",
    "views": "SELECT TABLE_SCHEMA as schema_name, TABLE_NAME as view_name, VIEW_DEFINITION as view_definition FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = @schema",
    "procedures": "SELECT ROUTINE_SCHEMA as schema_name, ROUTINE_NAME as proc_name, ROUTINE_TYPE as proc_type, ROUTINE_DEFINITION as proc_definition FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = @schema",
    "columns": "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table ORDER BY ORDINAL_POSITION"
}
```

### Teradata
```python
{
    "databases": "SELECT DatabaseName FROM DBC.DatabasesV WHERE DBKind = 'D' ORDER BY DatabaseName",
    "schemas": "SELECT DatabaseName as schema_name FROM DBC.DatabasesV WHERE DBKind IN ('D','U') ORDER BY DatabaseName",
    "tables": "SELECT DatabaseName as schema_name, TableName as table_name, TableKind as object_type FROM DBC.TablesV WHERE DatabaseName = :schema AND TableKind = 'T'",
    "views": "SELECT DatabaseName as schema_name, TableName as view_name, RequestText as view_definition FROM DBC.TablesV WHERE DatabaseName = :schema AND TableKind = 'V'",
    "procedures": "SELECT DatabaseName as schema_name, TableName as proc_name, TableKind as proc_type FROM DBC.TablesV WHERE DatabaseName = :schema AND TableKind IN ('P','M')",
    "columns": "SELECT ColumnName, ColumnType, ColumnLength, DecimalTotalDigits, DecimalFractionalDigits, Nullable FROM DBC.ColumnsV WHERE DatabaseName = :schema AND TableName = :table ORDER BY ColumnId"
}
```

### Netezza
```python
{
    "databases": "SELECT DATABASE FROM _V_DATABASE ORDER BY DATABASE",
    "schemas": "SELECT SCHEMA FROM _V_SCHEMA WHERE DATABASE = :database ORDER BY SCHEMA",
    "tables": "SELECT SCHEMA as schema_name, TABLENAME as table_name, 'TABLE' as object_type FROM _V_TABLE WHERE SCHEMA = :schema",
    "views": "SELECT SCHEMA as schema_name, VIEWNAME as view_name, DEFINITION as view_definition FROM _V_VIEW WHERE SCHEMA = :schema",
    "procedures": "SELECT SCHEMA as schema_name, PROCEDURENAME as proc_name, PROCEDURETYPE as proc_type FROM _V_PROCEDURE WHERE SCHEMA = :schema",
    "columns": "SELECT ATTNAME as column_name, FORMAT_TYPE as data_type, ATTLEN as column_length, ATTNOTNULL as not_null FROM _V_RELATION_COLUMN WHERE NAME = :table AND SCHEMA = :schema ORDER BY ATTNUM"
}
```

### Redshift
```python
{
    "databases": "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname",
    "schemas": "SELECT nspname as schema_name FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema' ORDER BY nspname",
    "tables": "SELECT schemaname as schema_name, tablename as table_name, 'TABLE' as object_type FROM pg_tables WHERE schemaname = :schema",
    "views": "SELECT schemaname as schema_name, viewname as view_name, definition as view_definition FROM pg_views WHERE schemaname = :schema",
    "procedures": "SELECT n.nspname as schema_name, p.proname as proc_name, CASE WHEN p.prorettype = 0 THEN 'PROCEDURE' ELSE 'FUNCTION' END as proc_type FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = :schema",
    "columns": "SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale, is_nullable FROM information_schema.columns WHERE table_schema = :schema AND table_name = :table ORDER BY ordinal_position"
}
```

### MySQL
```python
{
    "databases": "SHOW DATABASES",
    "schemas": "SELECT SCHEMA_NAME as schema_name FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME NOT IN ('mysql','information_schema','performance_schema','sys') ORDER BY SCHEMA_NAME",
    "tables": "SELECT TABLE_SCHEMA as schema_name, TABLE_NAME as table_name, 'TABLE' as object_type FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = :schema AND TABLE_TYPE = 'BASE TABLE'",
    "views": "SELECT TABLE_SCHEMA as schema_name, TABLE_NAME as view_name, VIEW_DEFINITION as view_definition FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = :schema",
    "procedures": "SELECT ROUTINE_SCHEMA as schema_name, ROUTINE_NAME as proc_name, ROUTINE_TYPE as proc_type FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = :schema",
    "columns": "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :table ORDER BY ORDINAL_POSITION",
    "table_ddl": "SHOW CREATE TABLE {schema}.{table}"
}
```

## Global State (In-Memory)

```python
# Active connections store
active_connections: Dict[str, Dict[str, Any]] = {}
# Key: connection_id (UUID)
# Value: {source_type, host, port, database, connection_method, created_at, foreign_catalog_name}

# Migration history
migration_history: List[Dict[str, Any]] = []
# Stored in memory, persists during app lifecycle
```

## Unity Catalog Volume Paths

```python
MIGRATION_VOLUME = "hls_amer_catalog.dw_migration.dw_migration_volume"
SOURCE_DIRECTORY = "source"  # For extracted inventory JSON files
ERROR_LOG_DIRECTORY = "dw_migration_error_log"  # For migration error logs
```

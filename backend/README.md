# DW Migration Assistant - Backend API & CLI

FastAPI backend and Python CLI for the Data Warehouse Migration Assistant.

## Features

- **REST API** for SQL translation, execution, and DDL conversion
- **CLI Tool** for command-line operations
- **Databricks Integration** with Unity Catalog support
- **LLM-powered** SQL translation using multi-agent supervisor

## Installation

### As a Python Package

```bash
cd backend
pip install -e .
```

### From PyPI (after publishing)

```bash
pip install dw-migration-assistant
```

## Configuration

Create a `.env` file in the backend directory:

```env
DATABRICKS_HOST=https://fe-vm-hls-amer.cloud.databricks.com
DATABRICKS_TOKEN=your_databricks_token
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/your_warehouse_id
LLM_AGENT_ENDPOINT=https://your-llm-endpoint
API_BASE_URL=http://localhost:8000
```

## Running the API Server

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

The API will be available at http://localhost:8000

### API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## CLI Usage

After installation, the `dw-migrate` command will be available:

### Translate SQL

```bash
# From file
dw-migrate translate --source oracle --file query.sql --output translated.sql

# From command line
dw-migrate translate --source snowflake --sql "SELECT * FROM employees"
```

### Execute SQL

```bash
# From file
dw-migrate execute --file query.sql --catalog main --schema default

# From command line
dw-migrate execute --sql "SELECT * FROM table" --catalog main
```

### Convert DDL

```bash
# Convert and save
dw-migrate convert-ddl --source sqlserver --file table.ddl --output converted.ddl

# Convert and execute immediately
dw-migrate convert-ddl --source teradata --file schema.ddl --execute --catalog main --schema analytics
```

### List Catalogs

```bash
dw-migrate list-catalogs
```

### Version

```bash
dw-migrate version
```

## API Endpoints

### POST /api/translate-sql
Translate SQL from source system to Databricks SQL

**Request:**
```json
{
  "sourceSystem": "oracle",
  "sourceSql": "SELECT * FROM employees WHERE hire_date > SYSDATE - 30"
}
```

**Response:**
```json
{
  "success": true,
  "translatedSql": "SELECT * FROM employees WHERE hire_date > CURRENT_DATE() - INTERVAL 30 DAYS",
  "warnings": []
}
```

### POST /api/execute-sql
Execute SQL in Databricks SQL

**Request:**
```json
{
  "sql": "SELECT * FROM employees",
  "catalog": "main",
  "schema": "default"
}
```

**Response:**
```json
{
  "success": true,
  "result": [...],
  "rowCount": 10,
  "executionTime": 1.234
}
```

### POST /api/convert-ddl
Convert DDL from source system to Databricks SQL

**Request:**
```json
{
  "sourceSystem": "sqlserver",
  "sourceDdl": "CREATE TABLE employees (...)",
  "targetCatalog": "main",
  "targetSchema": "default",
  "executeImmediately": false
}
```

**Response:**
```json
{
  "success": true,
  "convertedDdl": "CREATE TABLE employees (...)",
  "executed": false,
  "warnings": []
}
```

### GET /api/catalogs-schemas
Get list of Unity Catalog catalogs and schemas

**Response:**
```json
{
  "catalogs": ["main", "analytics"],
  "schemas": {
    "main": ["default", "staging"],
    "analytics": ["reports"]
  }
}
```

## Development

### Install Development Dependencies

```bash
pip install -e ".[dev]"
```

### Run Tests

```bash
pytest
```

### Code Formatting

```bash
black app/
isort app/
```

## Docker Deployment

```bash
docker build -t dw-migration-assistant .
docker run -p 8000:8000 --env-file .env dw-migration-assistant
```

## Databricks Deployment

The API can be deployed as a Databricks App. See the main README for deployment instructions.

## License

MIT License

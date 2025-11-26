# DW Migration Assistant

A comprehensive web application for data warehouse migrations to Databricks SQL, featuring real-time progress tracking, schema comparison, cost estimation, rollback capabilities, and AI-powered query translation.

## Features

### Migration Capabilities
- **Connect & Migrate**: Direct JDBC connections to source databases with bulk migration support
- **Real-Time Progress Tracking**: Server-Sent Events (SSE) for live migration status updates
- **Schema Comparison**: Compare source and target schemas before/after migration
- **Rollback Manager**: Create snapshots and rollback migrations if needed
- **Migration Scheduling**: Schedule migrations with cron expressions or one-time runs
- **Cost Estimation**: Estimate compute and storage costs before migration

### Multi-Platform Support
Supports migrations from 8 major data warehouse platforms:
- Oracle Data Warehouse
- Snowflake
- Microsoft SQL Server
- Teradata
- IBM Netezza
- Azure Synapse Analytics
- Amazon Redshift
- MySQL

### AI-Powered Features
- **SQL Translator**: AI-powered SQL translation using Databricks Foundation Models
- **Query Generator**: Generate queries from natural language
- **Multi-Table Join Generator**: Generate complex JOIN queries with AI-suggested join conditions
- **DDL Converter**: Convert DDL statements with Unity Catalog support

### AI Models Supported
- Llama 4 Maverick (Default - Fast and efficient)
- Llama 3.3 70B (Complex reasoning)
- Llama 3.1 405B (Most complex tasks)
- Claude Sonnet 4.5 (Superior reasoning)
- Claude Opus 4.1 (Most powerful)
- GPT-5 (Latest OpenAI)
- Gemini 2.5 Pro (Google's most capable)

## Technology Stack

### Frontend
- React 18 with TypeScript
- Material-UI (MUI) components
- Framer Motion for animations

### Backend
- FastAPI for REST API
- Databricks SQL Connector
- OpenAI Python SDK (for Foundation Model API)
- Python 3.8+

---

## Quick Start Deployment

### Prerequisites

1. **Databricks Workspace** with:
   - Unity Catalog enabled
   - SQL Warehouse (Serverless recommended)
   - Access to Foundation Model APIs

2. **Databricks CLI** installed and configured:
   ```bash
   pip install databricks-cli
   databricks configure --token
   ```

3. **Node.js** (v14+) and **Python 3.8+**

### Step-by-Step Deployment

#### 1. Clone the Repository

```bash
git clone https://github.com/suryasai87/dw_migration_app.git
cd dw_migration_app
```

#### 2. Configure Your Environment

##### Option A: Using app.yaml (Recommended for Databricks Apps)

Edit `backend/app.yaml` with your Databricks workspace details:

```yaml
command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
port: 8000
environment_variables:
  PYTHONPATH: "."
  # Required: Your Databricks Workspace URL
  DATABRICKS_HOST: "https://YOUR_WORKSPACE.cloud.databricks.com"
  # Required: SQL Warehouse HTTP Path
  DATABRICKS_HTTP_PATH: "/sql/1.0/warehouses/YOUR_WAREHOUSE_ID"
  # Optional: Default Unity Catalog settings
  DEFAULT_CATALOG: "main"
  DEFAULT_SCHEMA: "default"
```

##### Option B: Using Environment Variables (Local Development)

Create a `.env` file in the project root:

```env
# Required: Databricks Configuration
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=dapi_your_personal_access_token
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/your_warehouse_id

# Optional: Unity Catalog Defaults
DEFAULT_CATALOG=main
DEFAULT_SCHEMA=default

# Optional: For external AI models (if not using Databricks Foundation Models)
OPENAI_API_KEY=your_openai_api_key
```

#### 3. Find Your SQL Warehouse ID

1. Go to your Databricks workspace
2. Navigate to **SQL Warehouses** (in the SQL persona)
3. Click on your warehouse
4. Go to **Connection Details** tab
5. Copy the **HTTP Path** (e.g., `/sql/1.0/warehouses/abc123def456`)

#### 4. Build and Deploy

```bash
# Install frontend dependencies
npm install

# Build the React frontend
npm run build

# Copy build to backend static folder
rm -rf backend/static
cp -r build backend/static

# Create the Databricks App (first time only)
databricks apps create dw-migration-assistant \
  --description "Data Warehouse Migration Assistant for Databricks SQL"

# Upload code to Databricks Workspace
databricks workspace import-dir --overwrite backend \
  /Workspace/Users/YOUR_EMAIL@domain.com/dw-migration-assistant

# Deploy the app
databricks apps deploy dw-migration-assistant \
  --source-code-path /Workspace/Users/YOUR_EMAIL@domain.com/dw-migration-assistant
```

#### 5. Access Your App

Your app will be available at:
```
https://dw-migration-assistant-WORKSPACE_ID.REGION.databricksapps.com
```

Check deployment status:
```bash
databricks apps get dw-migration-assistant
```

---

## Unity Catalog Configuration

### Setting Up Unity Catalog Access

#### 1. Grant Permissions to App Service Principal

When deployed as a Databricks App, it gets a service principal. Grant it access:

```sql
-- Find your app's service principal name
-- Run: databricks apps get dw-migration-assistant | grep service_principal_name
-- Example output: "service_principal_name": "app-abc123 dw-migration-assistant"

-- Grant catalog access
GRANT USE CATALOG ON CATALOG your_catalog TO `app-abc123 dw-migration-assistant`;

-- Grant schema access
GRANT USE SCHEMA ON SCHEMA your_catalog.your_schema TO `app-abc123 dw-migration-assistant`;

-- Grant table read access (for browsing and querying)
GRANT SELECT ON SCHEMA your_catalog.your_schema TO `app-abc123 dw-migration-assistant`;

-- For migration features, also grant write access
GRANT CREATE TABLE ON SCHEMA your_catalog.your_schema TO `app-abc123 dw-migration-assistant`;
GRANT MODIFY ON SCHEMA your_catalog.your_schema TO `app-abc123 dw-migration-assistant`;
```

#### 2. Configure Default Catalog/Schema in app.yaml

```yaml
environment_variables:
  PYTHONPATH: "."
  DATABRICKS_HOST: "https://YOUR_WORKSPACE.cloud.databricks.com"
  DATABRICKS_HTTP_PATH: "/sql/1.0/warehouses/YOUR_WAREHOUSE_ID"
  # Set your default catalog and schema
  DEFAULT_CATALOG: "your_catalog"
  DEFAULT_SCHEMA: "your_schema"
```

#### 3. Multiple Catalog Access

To access multiple catalogs, grant permissions on each:

```sql
-- Repeat for each catalog your users need
GRANT USE CATALOG ON CATALOG catalog1 TO `app-abc123 dw-migration-assistant`;
GRANT USE CATALOG ON CATALOG catalog2 TO `app-abc123 dw-migration-assistant`;
GRANT USE SCHEMA ON CATALOG catalog1.* TO `app-abc123 dw-migration-assistant`;
GRANT USE SCHEMA ON CATALOG catalog2.* TO `app-abc123 dw-migration-assistant`;
```

---

## Configuration Files Reference

### backend/app.yaml

This is the main configuration file for Databricks Apps deployment:

```yaml
command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
port: 8000
environment_variables:
  # Required
  PYTHONPATH: "."
  DATABRICKS_HOST: "https://YOUR_WORKSPACE.cloud.databricks.com"
  DATABRICKS_HTTP_PATH: "/sql/1.0/warehouses/YOUR_WAREHOUSE_ID"

  # Optional: Unity Catalog defaults
  DEFAULT_CATALOG: "main"
  DEFAULT_SCHEMA: "default"

  # Optional: Migration settings
  MIGRATION_BATCH_SIZE: "1000"
  MIGRATION_TIMEOUT_SECONDS: "3600"

  # Optional: Cost estimation settings
  DBU_PRICE_PER_HOUR: "0.55"
  STORAGE_PRICE_PER_GB_MONTH: "0.023"
```

### backend/requirements.txt

Dependencies required for the backend:

```
fastapi>=0.100.0
uvicorn>=0.22.0
databricks-sql-connector>=2.9.0
pydantic>=2.0.0
openai>=1.12.0
requests>=2.28.0
python-multipart>=0.0.6
jaydebeapi>=1.2.3
psycopg2-binary>=2.9.0
pymysql>=1.1.0
snowflake-connector-python>=3.0.0
```

### .env (Local Development Only)

```env
# Databricks Connection
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=dapi_your_personal_access_token
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/your_warehouse_id

# Unity Catalog Defaults
DEFAULT_CATALOG=main
DEFAULT_SCHEMA=default

# Optional: External AI APIs
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
```

---

## Feature Guide

### Connect & Migrate

1. Navigate to **Connect & Migrate** in the sidebar
2. Select source database type (Oracle, SQL Server, etc.)
3. Enter connection details (host, port, database, credentials)
4. Click **Connect** to test the connection
5. Browse and select objects to migrate
6. Configure target catalog/schema in Unity Catalog
7. Click **Start Migration** to begin
8. Monitor progress in real-time with the progress tracker

### Schema Comparison

1. Navigate to **Schema Comparison**
2. Select source connection and target Unity Catalog location
3. Click **Compare Schemas**
4. View differences highlighted:
   - **Green**: Matching objects
   - **Yellow**: Modified objects
   - **Red**: Missing objects
5. Export comparison report as needed

### Migration Scheduling

1. Navigate to **Migration Scheduler**
2. Click **Create Schedule**
3. Configure:
   - Schedule name and description
   - Cron expression or one-time date
   - Source and target configurations
   - Objects to migrate
4. Enable/disable schedules as needed
5. View job history and execution logs

### Rollback Manager

1. Before migration, create a snapshot:
   - Navigate to **Rollback Manager**
   - Click **Create Snapshot**
   - Select objects to snapshot
2. If rollback needed:
   - Select the snapshot
   - Click **Restore**
   - Confirm restoration

### Cost Estimation

1. Navigate to **Cost Estimator**
2. Select source database and objects
3. Configure estimation parameters:
   - Data volume
   - Query complexity
   - Storage duration
4. View breakdown:
   - Compute costs (DBUs)
   - Storage costs
   - Data transfer costs
5. Compare with source platform costs

---

## API Endpoints

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/models` | GET | List available AI models |
| `/api/warehouse-status` | GET | SQL warehouse status |

### Unity Catalog Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/catalogs` | GET | List Unity Catalog catalogs |
| `/api/catalogs/{catalog}/schemas` | GET | List schemas in catalog |
| `/api/catalogs/{catalog}/schemas/{schema}/tables` | GET | List tables |
| `/api/catalogs/{catalog}/schemas/{schema}/tables/{table}/columns` | GET | List columns |

### Migration Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/migrate/start` | POST | Start a migration job |
| `/api/migrate/stream/{job_id}` | GET | SSE stream for progress |
| `/api/migrate/status/{job_id}` | GET | Get migration status |
| `/api/migrate/cancel/{job_id}` | POST | Cancel a migration |

### Schema Comparison Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/schema/compare` | POST | Compare source and target schemas |
| `/api/schema/diff/{comparison_id}` | GET | Get detailed diff |

### Scheduling Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/schedules` | GET/POST | List or create schedules |
| `/api/schedules/{id}` | GET/PUT/DELETE | Manage specific schedule |
| `/api/schedules/{id}/run` | POST | Trigger immediate run |

### Cost Estimation Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cost/estimate` | POST | Estimate migration costs |
| `/api/cost/breakdown` | POST | Get detailed cost breakdown |

---

## Local Development

### Frontend Only

```bash
npm install
npm start
# Runs on http://localhost:3000
```

### Backend Only

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Runs on http://localhost:8000
# API docs at http://localhost:8000/docs
```

### Full Stack

```bash
# Terminal 1: Frontend with proxy
npm start

# Terminal 2: Backend
cd backend && uvicorn main:app --reload --port 8000
```

---

## Project Structure

```
dw_migration_app/
├── src/                              # React frontend
│   ├── components/
│   │   ├── ConnectAndMigrate.tsx     # Database connection & migration
│   │   ├── MigrationProgress.tsx     # Real-time progress tracking
│   │   ├── SchemaComparison.tsx      # Schema diff viewer
│   │   ├── MigrationScheduler.tsx    # Schedule management
│   │   ├── RollbackManager.tsx       # Snapshot & rollback
│   │   ├── CostEstimator.tsx         # Cost estimation
│   │   ├── QueryGenerator.tsx        # AI query builder
│   │   ├── SqlTranslator.tsx         # AI SQL translation
│   │   ├── QueryTesting.tsx          # Automated query testing
│   │   └── ...
│   ├── services/
│   │   └── databricksService.ts      # API client
│   └── App.tsx
├── backend/
│   ├── main.py                       # FastAPI application
│   ├── migration_progress.py         # Progress tracking helpers
│   ├── database_connector.py         # JDBC connections
│   ├── metadata_extractor.py         # Schema extraction
│   ├── app.yaml                      # Databricks App config
│   ├── requirements.txt
│   └── static/                       # Built React app
├── .claude_context/                  # Context documentation
├── package.json
└── README.md
```

---

## Troubleshooting

### "No catalogs found" Error
- Verify SQL warehouse is running
- Check service principal permissions (see Unity Catalog Configuration)
- Click "Refresh Catalogs" button

### App Crashes on Deploy
- Check `app.yaml` has correct `DATABRICKS_HOST` and `DATABRICKS_HTTP_PATH`
- Verify `requirements.txt` has all dependencies
- Check app logs: `databricks apps get dw-migration-assistant`

### Migration Fails
- Verify source database credentials
- Check target schema permissions
- Ensure network connectivity to source database
- Review error logs in Migration Progress view

### "Lost connection to migration job" Error
- Check SQL warehouse didn't auto-stop
- Verify network stability
- Click "Refresh" to check job status

### Cost Estimation Shows $0
- Ensure you've selected objects to estimate
- Verify data volume information is available
- Check that pricing parameters are configured

---

## Security Notes

- **SQL Injection Prevention**: All identifier inputs are validated and quoted
- **OAuth Authentication**: Databricks Apps use OAuth for secure access
- **Service Principal**: App runs with limited service principal permissions
- **No Credential Storage**: Database credentials are used in-memory only

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License.

## Author

**Suryasai Turaga**
- Email: suryasai.turaga@databricks.com
- GitHub: [@suryasai87](https://github.com/suryasai87)

---

Built with React, FastAPI, and Databricks

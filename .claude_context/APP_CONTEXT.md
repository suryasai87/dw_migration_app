# DW Migration Assistant - Application Context

## Project Overview
A comprehensive web application for data warehouse migrations to Databricks SQL, built with React, TypeScript, FastAPI, and powered by Databricks Foundation Models.

## Repository
- **GitHub**: https://github.com/suryasai87/dw_migration_app
- **Owner**: Suryasai Turaga (suryasai.turaga@databricks.com)

## Deployment
- **Platform**: Databricks Apps
- **App URL**: https://dw-migration-assistant-1602460480284688.aws.databricksapps.com
- **Workspace**: fe-vm-hls-amer.cloud.databricks.com
- **SQL Warehouse ID**: 4b28691c780d9875
- **Service Principal**: app-46a7gs dw-migration-assistant

## Branches
| Branch | Description | Status |
|--------|-------------|--------|
| `main` | Original stable version with basic features | Stable |
| `feature/query-generator-v2` | Multi-Table Join Generator and improved Query Generator | Deployed |
| `feature/connect-and-migrate-v3` | Connect & Migrate with Lakehouse Federation support | Latest/Deployed |

## Technology Stack

### Frontend
- React 18 with TypeScript
- Material-UI (MUI) components
- Framer Motion for animations
- Located in `/src/` directory

### Backend
- FastAPI (Python)
- Databricks SQL Connector
- OpenAI Python SDK (for Foundation Model API)
- Located in `/backend/` directory
- Main file: `backend/main.py`
- Config: `backend/app.yaml`

## Key Files Structure
```
dw_migration_app/
├── src/
│   ├── components/
│   │   ├── Dashboard.tsx
│   │   ├── DataTypeMappings.tsx
│   │   ├── SqlTranslator.tsx
│   │   ├── DdlConverter.tsx
│   │   ├── QueryGenerator.tsx
│   │   ├── MultiTableJoinGenerator.tsx
│   │   ├── ConnectAndMigrate.tsx      # v3 feature
│   │   ├── QueryHistory.tsx
│   │   ├── Analytics.tsx
│   │   ├── Sidebar.tsx
│   │   └── Header.tsx
│   ├── services/
│   │   └── databricksService.ts
│   ├── config/
│   │   └── apiConfig.ts
│   └── App.tsx
├── backend/
│   ├── main.py                        # FastAPI application
│   ├── app.yaml                       # Databricks App config
│   ├── requirements.txt
│   └── static/                        # Built React app
└── package.json
```

## Features by Version

### v1 (main branch)
- Data Type Mappings (200+ types from 7 platforms)
- SQL Translator with AI models
- DDL Converter with Unity Catalog support
- Query History tracking
- Analytics Dashboard

### v2 (feature/query-generator-v2)
- Single-table Query Generator with AI suggestions
- Multi-Table Join Generator with AI-suggested JOIN conditions
- Improved catalog/schema/table dropdowns with refresh
- Better error handling

### v3 (feature/connect-and-migrate-v3)
- Connect & Migrate feature using Lakehouse Federation
- Support for 8 source systems:
  1. Oracle Data Warehouse (port 1521)
  2. Snowflake (port 443)
  3. Microsoft SQL Server (port 1433)
  4. Teradata (port 1025)
  5. IBM Netezza (port 5480)
  6. Azure Synapse Analytics (port 1433)
  7. Amazon Redshift (port 5439)
  8. MySQL (port 3306)
- Metadata inventory extraction (databases, schemas, tables, views, stored procedures, functions)
- Bulk migration with AI translation
- Error logging to workspace directory
- Stepper workflow UI

## API Endpoints

### Core APIs
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/models` | GET | List available AI models |
| `/api/warehouse-status` | GET | SQL warehouse status |
| `/api/catalogs` | GET | List Unity Catalog catalogs |
| `/api/catalogs/{catalog}/schemas` | GET | List schemas |
| `/api/catalogs/{catalog}/schemas/{schema}/tables` | GET | List tables |
| `/api/catalogs/{catalog}/schemas/{schema}/tables/{table}/columns` | GET | List columns |
| `/api/translate-sql` | POST | Translate SQL to Databricks |
| `/api/execute-sql` | POST | Execute SQL in Databricks |
| `/api/suggest-business-logic` | POST | AI business logic suggestions |
| `/api/suggest-join-conditions` | POST | AI JOIN suggestions |
| `/api/generate-sql` | POST | Generate SQL from natural language |

### Connect & Migrate APIs (v3)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/connect/test` | POST | Test source connection |
| `/api/connect/sources` | GET | List supported source systems |
| `/api/connect/extract-inventory` | POST | Extract metadata inventory |
| `/api/connect/active-connections` | GET | List active connections |
| `/api/migrate/bulk` | POST | Run bulk migration |
| `/api/migrate/history` | GET | Get migration history |

## AI Models Supported
- Llama 4 Maverick (default - fast)
- Llama 3.3 70B (complex reasoning)
- Llama 3.1 405B (most complex)
- Claude Sonnet 4.5
- Claude Opus 4.1
- GPT-5
- Gemini 2.5 Pro

## Unity Catalog Configuration
- **Migration Volume**: `hls_amer_catalog.dw_migration.dw_migration_volume`
- **Source Directory**: `source/` (for extracted inventory)
- **Error Log Directory**: `dw_migration_error_log/` (for migration errors)

## Deployment Commands
```bash
# Build frontend
npm run build

# Copy to backend
rm -rf backend/static && cp -r build backend/static

# Upload to workspace
databricks workspace import-dir --overwrite backend /Workspace/Users/suryasai.turaga@databricks.com/dw-migration-assistant

# Deploy app
databricks apps deploy dw-migration-assistant --source-code-path /Workspace/Users/suryasai.turaga@databricks.com/dw-migration-assistant

# Check status
databricks apps get dw-migration-assistant
```

## Known Issues & Fixes

### App Crash Fix (Resolved)
- **Issue**: `backend/app/` directory conflicted with `app.py` during import
- **Fix**: Renamed `app.py` to `main.py`, updated `app.yaml` to use `uvicorn main:app`

### Catalog Dropdown Empty (Resolved)
- **Issue**: Unity Catalog dropdowns not showing data
- **Fix**: Added refresh button, improved error handling, proper loading states

## Development Notes
- Frontend runs on port 3000 (`npm start`)
- Backend runs on port 8000 (`uvicorn main:app --reload`)
- Build output goes to `/build/` then copied to `/backend/static/`
- App uses OAuth for authentication when deployed to Databricks Apps

## Future Enhancement Ideas
- Real-time migration progress tracking
- Schema comparison before/after migration
- Automated testing of migrated queries
- Migration scheduling
- Rollback capabilities
- Cost estimation for migrations

# DW Migration Assistant

A comprehensive web application and CLI tool built with React, TypeScript, FastAPI, and powered by Databricks to simplify data warehouse migrations to Databricks SQL.

## Features

### Multi-Platform Support
Supports migrations from 7 major data warehouse platforms:
- Oracle Data Warehouse
- Snowflake
- Microsoft SQL Server
- Teradata
- IBM Netezza
- Azure Synapse Analytics
- Amazon Redshift

### Core Capabilities

- **Data Type Mappings**: View detailed mappings for 200+ data types from source systems to Databricks SQL
- **SQL Translator**: AI-powered SQL translation using Databricks Foundation Models (Llama, Claude, GPT, Gemini)
- **DDL Converter**: Convert and execute DDL statements with Unity Catalog support
- **Query Generator**: AI-powered single-table query generation from natural language
- **Multi-Table Join Generator**: Generate complex JOIN queries across multiple tables with AI-suggested join conditions
- **SQL Execution**: Execute queries directly in Databricks SQL with automatic LIMIT enforcement
- **Migration History**: Track your past migration queries and activities
- **Analytics Dashboard**: View insights and statistics about your migrations

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

## Deployment to Databricks Apps

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

3. **Node.js** (v14+) and **Python 3.8+** for building

### Step-by-Step Deployment

#### 1. Clone the Repository

```bash
git clone https://github.com/suryasai87/dw_migration_app.git
cd dw_migration_app
```

#### 2. Configure Your Databricks Settings

Edit `backend/app.yaml` with your Databricks workspace details:

```yaml
command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
port: 8000
environment_variables:
  PYTHONPATH: "."
  DATABRICKS_HOST: "https://YOUR_WORKSPACE.cloud.databricks.com"
  DATABRICKS_HTTP_PATH: "/sql/1.0/warehouses/YOUR_WAREHOUSE_ID"
```

**Finding Your Warehouse ID:**
1. Go to your Databricks workspace
2. Navigate to **SQL Warehouses**
3. Click on your warehouse
4. The HTTP Path is shown in the **Connection Details** tab

#### 3. Build the Frontend

```bash
npm install
npm run build
```

#### 4. Copy Build to Backend

```bash
rm -rf backend/static
cp -r build backend/static
```

#### 5. Create the Databricks App (First Time Only)

```bash
databricks apps create dw-migration-assistant \
  --description "Data Warehouse Migration Assistant for Databricks SQL"
```

#### 6. Upload Code to Workspace

```bash
databricks workspace import-dir --overwrite backend \
  /Workspace/Users/YOUR_EMAIL/dw-migration-assistant
```

#### 7. Deploy the App

```bash
databricks apps deploy dw-migration-assistant \
  --source-code-path /Workspace/Users/YOUR_EMAIL/dw-migration-assistant
```

#### 8. Access Your App

Your app will be available at:
```
https://YOUR_APP_NAME-WORKSPACE_ID.REGION.databricksapps.com
```

Check the deployment status:
```bash
databricks apps get dw-migration-assistant
```

---

## Connecting Your Own Unity Catalog

### Automatic Connection (Recommended)

When deployed as a Databricks App, the application automatically connects to your Unity Catalog using OAuth. The app's service principal inherits your workspace permissions.

### Grant Required Permissions

The app's service principal needs these permissions:

```sql
-- Grant catalog access
GRANT USE CATALOG ON CATALOG your_catalog TO `app-XXXXX dw-migration-assistant`;

-- Grant schema access
GRANT USE SCHEMA ON SCHEMA your_catalog.your_schema TO `app-XXXXX dw-migration-assistant`;

-- Grant table access (for browsing tables and columns)
GRANT SELECT ON SCHEMA your_catalog.your_schema TO `app-XXXXX dw-migration-assistant`;
```

Find the service principal name in the app details:
```bash
databricks apps get dw-migration-assistant | grep service_principal_name
```

### Manual Configuration (Local Development)

For local development, create a `.env` file:

```env
# Databricks Configuration
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=dapi_your_personal_access_token
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/your_warehouse_id

# Optional: Default catalog/schema
REACT_APP_DEFAULT_CATALOG=main
REACT_APP_DEFAULT_SCHEMA=default
```

### Troubleshooting Catalog Access

If catalogs don't appear in dropdowns:

1. **Check SQL Warehouse Status**: Ensure your warehouse is running
   ```bash
   # In Databricks SQL
   SELECT 1;  -- This should work if warehouse is running
   ```

2. **Verify Permissions**:
   ```sql
   -- Check what catalogs you can see
   SHOW CATALOGS;

   -- Check schemas in a catalog
   SHOW SCHEMAS IN your_catalog;
   ```

3. **Check App Logs**: Visit `https://YOUR_APP_URL/logz` after OAuth login

4. **Click "Refresh Catalogs"**: Use the refresh button in the Query Generator UI

---

## Using the Application

### Query Generator (Single Table)

1. Navigate to **Query Generator** in the sidebar
2. Select **Catalog** > **Schema** > **Table**
3. Click on columns to select them
4. Click **Get AI Suggestions** for business logic ideas
5. Enter your query description in natural language
6. Click **Generate SQL**
7. Review and **Execute in Databricks SQL**

### Multi-Table Join Generator

1. Navigate to **Multi-Table Join** in the sidebar
2. Add 2+ tables using the **Add Table** button
3. For each table: Select Catalog > Schema > Table > Columns
4. Click **AI Suggest JOINs** to get join condition recommendations
5. Enter your business logic (e.g., "Show total sales by customer with their contact info")
6. Click **Generate SQL with JOINs**
7. Review and execute

### SQL Translator

1. Navigate to **SQL Translator**
2. Select your source database platform
3. Paste your source SQL
4. Select an AI model (default: Llama 4 Maverick)
5. Click **Translate**
6. Review the translated Databricks SQL
7. Click **Execute** to run directly

---

## Local Development

### Frontend Development
```bash
npm install
npm start
# Runs on http://localhost:3000
```

### Backend Development
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Runs on http://localhost:8000
# API docs at http://localhost:8000/docs
```

### Full Stack Development
```bash
# Terminal 1: Frontend
npm start

# Terminal 2: Backend
cd backend && uvicorn main:app --reload --port 8000
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/models` | GET | List available AI models |
| `/api/warehouse-status` | GET | SQL warehouse status |
| `/api/catalogs` | GET | List Unity Catalog catalogs |
| `/api/catalogs/{catalog}/schemas` | GET | List schemas in catalog |
| `/api/catalogs/{catalog}/schemas/{schema}/tables` | GET | List tables |
| `/api/catalogs/{catalog}/schemas/{schema}/tables/{table}/columns` | GET | List columns |
| `/api/translate-sql` | POST | Translate SQL to Databricks |
| `/api/execute-sql` | POST | Execute SQL in Databricks |
| `/api/suggest-business-logic` | POST | AI business logic suggestions |
| `/api/suggest-join-conditions` | POST | AI JOIN condition suggestions |
| `/api/generate-sql` | POST | Generate SQL from natural language |

---

## Project Structure

```
dw_migration_app/
├── src/                              # React frontend
│   ├── components/
│   │   ├── Dashboard.tsx
│   │   ├── DataTypeMappings.tsx
│   │   ├── SqlTranslator.tsx         # AI SQL translation
│   │   ├── DdlConverter.tsx
│   │   ├── QueryGenerator.tsx        # Single-table query builder
│   │   ├── MultiTableJoinGenerator.tsx # Multi-table JOIN builder
│   │   ├── Sidebar.tsx
│   │   └── ...
│   ├── services/
│   │   └── databricksService.ts      # API client
│   └── App.tsx
├── backend/
│   ├── main.py                       # FastAPI application
│   ├── app.yaml                      # Databricks App config
│   ├── requirements.txt
│   └── static/                       # Built React app
├── package.json
└── README.md
```

---

## Branches

| Branch | Description |
|--------|-------------|
| `main` | Stable version with basic features |
| `feature/query-generator-v2` | Latest with Multi-Table Join Generator and improved UI |

To use the latest features:
```bash
git checkout feature/query-generator-v2
```

---

## Common Issues & Solutions

### "No catalogs found" Error
- Verify SQL warehouse is running
- Check service principal permissions
- Click "Refresh Catalogs" button

### App Crashes on Deploy
- Check `app.yaml` uses `main:app` not `app:app`
- Remove any `app/` directory conflicts
- Verify `requirements.txt` includes `openai==1.12.0`

### SQL Translation Fails
- Ensure Foundation Model API access is enabled
- Check DATABRICKS_TOKEN is valid
- Try a different AI model

### Slow Initial Load
- First request may take 10-30s while warehouse starts
- Serverless warehouses auto-start on demand

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

Built with React, FastAPI, and Databricks Foundation Models

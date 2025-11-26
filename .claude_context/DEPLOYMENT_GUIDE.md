# Deployment Guide

## Prerequisites

1. **Databricks CLI** installed and configured:
   ```bash
   pip install databricks-cli
   databricks configure --token
   ```

2. **Node.js** (v14+) for frontend build

3. **Python 3.8+** for backend

## Quick Deployment

### 1. Build Frontend
```bash
cd /Users/suryasai.turaga/dw_migration_app
npm install
npm run build
```

### 2. Copy Build to Backend
```bash
rm -rf backend/static
cp -r build backend/static
```

### 3. Upload to Databricks Workspace
```bash
databricks workspace import-dir --overwrite backend \
  /Workspace/Users/suryasai.turaga@databricks.com/dw-migration-assistant
```

### 4. Deploy the App
```bash
databricks apps deploy dw-migration-assistant \
  --source-code-path /Workspace/Users/suryasai.turaga@databricks.com/dw-migration-assistant
```

### 5. Check Status
```bash
databricks apps get dw-migration-assistant
```

## App Configuration (`backend/app.yaml`)

```yaml
command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
port: 8000
environment_variables:
  PYTHONPATH: "."
  DATABRICKS_HOST: "https://fe-vm-hls-amer.cloud.databricks.com"
  DATABRICKS_HTTP_PATH: "/sql/1.0/warehouses/4b28691c780d9875"
```

## Service Principal Permissions

Grant these permissions to the app's service principal:

```sql
-- Find service principal name
-- Run: databricks apps get dw-migration-assistant | grep service_principal_name
-- Result: app-46a7gs dw-migration-assistant

-- Grant catalog access
GRANT USE CATALOG ON CATALOG hls_amer_catalog TO `app-46a7gs dw-migration-assistant`;

-- Grant schema access
GRANT USE SCHEMA ON SCHEMA hls_amer_catalog.dw_migration TO `app-46a7gs dw-migration-assistant`;

-- Grant table access
GRANT SELECT ON SCHEMA hls_amer_catalog.dw_migration TO `app-46a7gs dw-migration-assistant`;

-- Grant volume access (for Connect & Migrate)
GRANT READ FILES ON VOLUME hls_amer_catalog.dw_migration.dw_migration_volume TO `app-46a7gs dw-migration-assistant`;
GRANT WRITE FILES ON VOLUME hls_amer_catalog.dw_migration.dw_migration_volume TO `app-46a7gs dw-migration-assistant`;
```

## Local Development

### Frontend (Terminal 1)
```bash
cd /Users/suryasai.turaga/dw_migration_app
npm start
# Runs on http://localhost:3000
```

### Backend (Terminal 2)
```bash
cd /Users/suryasai.turaga/dw_migration_app/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Runs on http://localhost:8000
# API docs at http://localhost:8000/docs
```

### Environment Variables (`.env`)
```env
DATABRICKS_HOST=https://fe-vm-hls-amer.cloud.databricks.com
DATABRICKS_TOKEN=dapi_your_token
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/4b28691c780d9875
```

## Troubleshooting

### App Crashes on Deploy
1. Check `app.yaml` uses `main:app` not `app:app`
2. Remove any conflicting `app/` directory
3. Verify `requirements.txt` includes all dependencies

### No Catalogs Found
1. Ensure SQL warehouse is running
2. Check service principal permissions
3. Use refresh button in UI

### SQL Translation Fails
1. Verify Foundation Model API access
2. Check DATABRICKS_TOKEN is valid
3. Try different AI model

### Slow Initial Load
- First request may take 10-30s while warehouse starts
- Serverless warehouses auto-start on demand

## Useful Commands

```bash
# Check app status
databricks apps get dw-migration-assistant

# View app logs
# Visit: https://dw-migration-assistant-1602460480284688.aws.databricksapps.com/logz

# Start/Stop app
databricks apps start dw-migration-assistant
databricks apps stop dw-migration-assistant

# List all apps
databricks apps list

# Delete app (careful!)
databricks apps delete dw-migration-assistant
```

## Git Workflow

```bash
# Create new feature branch
git checkout -b feature/new-feature

# Make changes, then build and test locally
npm run build
rm -rf backend/static && cp -r build backend/static

# Commit changes
git add .
git commit -m "Add new feature

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to GitHub
git push -u origin feature/new-feature

# Deploy to test
databricks workspace import-dir --overwrite backend /Workspace/Users/suryasai.turaga@databricks.com/dw-migration-assistant
databricks apps deploy dw-migration-assistant --source-code-path /Workspace/Users/suryasai.turaga@databricks.com/dw-migration-assistant
```

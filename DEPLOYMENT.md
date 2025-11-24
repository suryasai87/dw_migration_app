# Databricks App Deployment Guide

This guide explains how to deploy the DW Migration Assistant to your Databricks workspace.

## Prerequisites

- Databricks workspace access (fe-vm-hls-amer.cloud.databricks.com)
- Admin permissions to create Databricks Apps
- GitHub repository access

## Deployment Options

### Option 1: Deploy via Databricks UI (Recommended)

1. **Navigate to Databricks Apps**
   - Go to https://fe-vm-hls-amer.cloud.databricks.com/
   - Click on "Apps" in the left sidebar
   - Click "Create App"

2. **Configure App Settings**
   - Name: `dw-migration-assistant`
   - Description: "Data Warehouse Migration Assistant for Databricks SQL"
   - Source: GitHub Repository
   - Repository URL: `https://github.com/suryasai87/dw_migration_app`
   - Branch: `main`

3. **Set Environment Variables**
   Add the following environment variables:
   ```
   DATABRICKS_HOST=https://fe-vm-hls-amer.cloud.databricks.com
   DATABRICKS_TOKEN=<your-token>
   LLM_AGENT_ENDPOINT=<your-llm-endpoint>
   REACT_APP_LLM_ENDPOINT=/api/translate-sql
   REACT_APP_DEFAULT_CATALOG=main
   REACT_APP_DEFAULT_SCHEMA=default
   PORT=8080
   ```

4. **Configure Build Commands**
   - Build command: `npm install && npm run build && pip install -r backend/requirements.txt`
   - Start command: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 & npx serve -s build -l ${PORT:-8080}`

5. **Deploy**
   - Click "Create" to deploy the app
   - Wait for the app to build and deploy (may take 5-10 minutes)

6. **Access Your App**
   - Once deployed, your app will be available at:
     `https://fe-vm-hls-amer.cloud.databricks.com/apps/dw-migration-assistant`

### Option 2: Deploy via Databricks CLI

1. **Install Databricks CLI** (if not already installed)
   ```bash
   pip install databricks-cli
   ```

2. **Configure Authentication**
   ```bash
   databricks configure --token
   ```
   - Host: `https://fe-vm-hls-amer.cloud.databricks.com`
   - Token: Your personal access token

3. **Create the App**
   ```bash
   cd /Users/suryasai.turaga/dw_migration_app
   databricks apps create dw-migration-assistant \
     --description "Data Warehouse Migration Assistant" \
     --compute-size MEDIUM
   ```

4. **Deploy the App**
   ```bash
   databricks apps deploy dw-migration-assistant \
     --source-code-path . \
     --target dev
   ```

### Option 3: Manual Deployment

1. **Build Locally**
   ```bash
   cd /Users/suryasai.turaga/dw_migration_app
   npm run build
   ```

2. **Package the App**
   ```bash
   tar -czf dw-migration-app.tar.gz \
     build/ \
     backend/ \
     app.yml \
     package.json \
     .env.example
   ```

3. **Upload to Databricks**
   - Use the Databricks workspace file browser
   - Upload to `/FileStore/apps/dw-migration-assistant/`

4. **Create and Configure App via API**
   Use the Databricks Apps API to create and configure the app pointing to the uploaded files.

## Post-Deployment Configuration

### 1. Configure LLM Agent Endpoint

Update the LLM_AGENT_ENDPOINT environment variable with your actual multi-agent supervisor endpoint:

```bash
databricks apps update dw-migration-assistant \
  --env LLM_AGENT_ENDPOINT=<your-actual-endpoint>
```

### 2. Grant Permissions

Ensure the app service principal has the following permissions:
- Unity Catalog: `USE CATALOG` on target catalogs
- Unity Catalog: `CREATE SCHEMA` on target catalogs
- Unity Catalog: `USE SCHEMA` on target schemas
- SQL Warehouse: Access to execute queries

### 3. Configure SQL Warehouse

Set the DATABRICKS_HTTP_PATH to your SQL Warehouse:
```bash
databricks apps update dw-migration-assistant \
  --env DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/<warehouse-id>
```

## Verifying Deployment

### Check App Status
```bash
databricks apps get dw-migration-assistant
```

### Check App Logs
```bash
databricks apps get-deployment dw-migration-assistant --deployment-id <id>
```

### Access the App
Navigate to:
```
https://fe-vm-hls-amer.cloud.databricks.com/apps/dw-migration-assistant
```

### Test the Endpoints

1. **Test Frontend**
   - Should load the dashboard
   - Should display all navigation options
   - Should not show any 502 errors

2. **Test Backend API**
   - API docs: `/docs`
   - Health check: `/health`
   - Should return 200 status codes

3. **Test Features**
   - Data Type Mappings: Should load all mappings
   - SQL Translator: Should call LLM endpoint
   - DDL Converter: Should connect to Unity Catalog
   - SQL Execution: Should run queries successfully

## Troubleshooting

### 502 Bad Gateway Error

If you see a 502 error:

1. Check if both frontend and backend are running
2. Verify port configuration is not hardcoded
3. Check app logs for startup errors
4. Ensure environment variables are set correctly

**Fix:**
```bash
# Check app.yml uses dynamic port
PORT=${PORT:-8080}

# Restart the app
databricks apps start dw-migration-assistant
```

### Authentication Issues

If authentication fails:
- Verify DATABRICKS_TOKEN is valid
- Check token permissions
- Ensure service principal has correct roles

### LLM Endpoint Errors

If SQL translation fails:
- Verify LLM_AGENT_ENDPOINT is configured
- Check endpoint is accessible from Databricks
- Verify authentication headers are correct

### Unity Catalog Errors

If DDL execution fails:
- Check catalog and schema exist
- Verify permissions on catalogs/schemas
- Ensure DATABRICKS_HTTP_PATH is correct

## App URL

After successful deployment, access your app at:

**Production URL:**
```
https://fe-vm-hls-amer.cloud.databricks.com/apps/dw-migration-assistant
```

## Monitoring

### View App Metrics
- Go to Databricks workspace
- Navigate to Apps → dw-migration-assistant
- Click on "Metrics" tab

### Check Logs
- Go to Apps → dw-migration-assistant
- Click on "Logs" tab
- Filter by timestamp and severity

## Updating the App

To update with new changes:

1. **Push changes to GitHub**
   ```bash
   git push origin main
   ```

2. **Trigger redeployment**
   ```bash
   databricks apps create-update dw-migration-assistant
   ```

3. **Wait for deployment**
   Monitor the deployment status in the Databricks UI

## Support

For issues or questions:
- GitHub Issues: https://github.com/suryasai87/dw_migration_app/issues
- Internal Slack: #dw-migration-assistant

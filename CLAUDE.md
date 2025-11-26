# DW Migration Assistant - Claude Context

This is a Databricks App for data warehouse migrations. When working on this project, reference the context files in `.claude_context/` for detailed information.

## Quick Reference

### Project Structure
- **Frontend**: React + TypeScript + Material-UI in `/src/`
- **Backend**: FastAPI in `/backend/main.py`
- **App Config**: `/backend/app.yaml`
- **Context Docs**: `/.claude_context/`

### Key Files
- `src/App.tsx` - Main React app with routing
- `src/components/Sidebar.tsx` - Navigation menu
- `src/services/databricksService.ts` - API client
- `backend/main.py` - FastAPI endpoints

### Current Branches
| Branch | Description |
|--------|-------------|
| `main` | Stable base version |
| `feature/query-generator-v2` | Multi-Table Join Generator |
| `feature/connect-and-migrate-v3` | Latest - Connect & Migrate feature |

### Deployment
```bash
npm run build && rm -rf backend/static && cp -r build backend/static
databricks workspace import-dir --overwrite backend /Workspace/Users/suryasai.turaga@databricks.com/dw-migration-assistant
databricks apps deploy dw-migration-assistant --source-code-path /Workspace/Users/suryasai.turaga@databricks.com/dw-migration-assistant
```

### App URL
https://dw-migration-assistant-1602460480284688.aws.databricksapps.com

### Context Files
- `.claude_context/APP_CONTEXT.md` - Full project overview
- `.claude_context/BACKEND_MODELS.md` - Pydantic models and APIs
- `.claude_context/FRONTEND_COMPONENTS.md` - React components reference
- `.claude_context/DEPLOYMENT_GUIDE.md` - Deployment instructions

### Supported Source Systems
Oracle, Snowflake, SQL Server, Teradata, Netezza, Synapse, Redshift, MySQL

### AI Models
Llama 4 Maverick (default), Llama 3.3 70B, Llama 3.1 405B, Claude Sonnet 4.5, Claude Opus 4.1, GPT-5, Gemini 2.5 Pro

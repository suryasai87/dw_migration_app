# QueryForge Directory Analysis

## Directory Location
- **Workspace Path**: `/Workspace/Users/suryasai.turaga@databricks.com/queryforge`
- **Workspace ID**: 513501881403387
- **URL**: https://fe-vm-hls-amer.cloud.databricks.com/browse/folders/513501881403387

## Project Structure

```
queryforge/
├── app.py                          # FastAPI backend application
├── app.yaml                        # Databricks Apps configuration
├── requirements.txt                # Python dependencies
├── requirements-test.txt           # Test dependencies
├── .env                           # Environment variables (local)
├── .env.example                   # Environment template
├── static/                        # Static files for React UI
│   ├── index.html                # Main HTML file
│   └── assets/                   # Vite build output (CSS/JS)
│       ├── index-DWM4PdQm.js
│       ├── index-CvWDoHlO.css
│       └── [other hashed files]
├── tests/                        # Test files
├── add_session_id.py            # Utility scripts
├── add_token_tracking.py
├── setup_audit_table.py
├── create_audit_table.sql       # SQL scripts
├── add_session_id_column.sql
└── add_token_columns.sql
```

## Key Architectural Differences vs. DW Migration App

### 1. **Static File Structure**

**QueryForge** (Vite-based):
```
static/
├── index.html
└── assets/
    ├── index-[hash].js
    └── index-[hash].css
```

**DW Migration App** (Create React App):
```
static/
├── index.html
└── static/
    ├── css/main.e6c13ad2.css
    └── js/main.d7971e8e.js
```

### 2. **Static File Serving in app.py**

**QueryForge Pattern**:
```python
from pathlib import Path

static_dir = Path(__file__).parent / "static"

if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the React SPA for all other routes"""
        if full_path.startswith("api/") or full_path.startswith("docs"):
            raise HTTPException(status_code=404, detail="Not found")

        file_path = static_dir / full_path
        if file_path.is_file():
            return FileResponse(file_path)

        index_path = static_dir / "index.html"
        if index_path.is_file():
            return FileResponse(index_path)

        raise HTTPException(status_code=404, detail="Not found")
```

**Key Advantages**:
1. Uses `pathlib.Path` - more reliable in containerized environments
2. Mounts specific subdirectory (`/assets`) for bundled files
3. Catch-all route with proper file existence checks
4. Falls back to index.html for React routing

### 3. **app.yaml Configuration**

**QueryForge**:
```yaml
command: ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

default_source_ip_permissions:
  - action: ALLOW
    ip_addresses: ["0.0.0.0/0"]

env:
  - name: ENV
    value: "production"
  - name: DATABRICKS_HOST
    value: "https://fe-vm-leaps-fe.cloud.databricks.com"
  - name: DATABRICKS_TOKEN
    valueFrom: queryforge/databricks-token  # Secret reference
  - name: DATABRICKS_HTTP_PATH
    value: "/sql/1.0/warehouses/2dc6b7aacc451bcd"
```

**DW Migration App**:
```yaml
command: ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
port: 8000
environment_variables:
  PYTHONPATH: "."
  DATABRICKS_HOST: "${DATABRICKS_HOST}"
  DATABRICKS_TOKEN: "${DATABRICKS_TOKEN}"
```

### 4. **Frontend Build Tool**

- **QueryForge**: Vite (modern, faster builds, creates `/assets` directory)
- **DW Migration App**: Create React App (creates `/static` subdirectory)

### 5. **Features Comparison**

#### QueryForge Features:
✓ Text-to-SQL conversion using Foundation Models
✓ Multi-table JOIN query support
✓ Business logic suggestions (AI-powered)
✓ JOIN condition suggestions
✓ SQL execution with Databricks SQL
✓ Comprehensive audit logging (tokens, costs, execution time)
✓ Analytics dashboard (cost, performance, usage)
✓ Session tracking
✓ Model selection (Llama, Claude, GPT, Gemini, Qwen)
✓ Warehouse status monitoring
✓ Catalog/Schema/Table/Column browsing
✓ Sample data preview
✓ Export functionality
✓ Query history

#### DW Migration App Features:
✓ Data type mappings (200+ conversions)
✓ SQL translation (Oracle, Snowflake, SQL Server, etc. → Databricks)
✓ DDL conversion
✓ SQL execution with LIMIT 1 enforcement
✓ Unity Catalog integration
✓ Query history
✓ Analytics dashboard
✓ CLI tool (`dw-migrate`)

## Technical Insights

### 1. **Path Resolution**
QueryForge uses `pathlib.Path(__file__).parent` which is more reliable than `os.path.dirname(__file__)` in Databricks Apps runtime environment.

### 2. **File Mounting Strategy**
- Mount specific subdirectories (e.g., `/assets`) rather than entire directory
- Use catch-all route AFTER mounting for SPA routing

### 3. **Audit Logging**
QueryForge has comprehensive audit logging including:
- Token usage (prompt + completion)
- Estimated cost per query
- Execution time
- Session tracking
- Business logic and SQL lengths
- Error tracking

### 4. **LLM Integration**
Uses OpenAI client library with Databricks endpoint:
```python
client = openai.OpenAI(
    api_key=DATABRICKS_TOKEN,
    base_url=f"{DATABRICKS_HOST}/serving-endpoints"
)
```

### 5. **Error Handling**
- Comprehensive try-catch blocks
- Audit logging even on errors
- Proper HTTP status codes
- User-friendly error messages

## Deployment Workflow

1. **Build Frontend** (Vite):
   ```bash
   npm run build  # Creates static/assets/ directory
   ```

2. **Upload to Workspace**:
   ```bash
   databricks workspace import-dir static "/path/to/app/static" --overwrite
   databricks workspace import app.py "/path/to/app/app.py" --overwrite
   databricks workspace import app.yaml "/path/to/app/app.yaml" --overwrite
   ```

3. **Deploy App**:
   ```bash
   databricks apps deploy queryforge --source-code-path "/path/to/app"
   ```

## Recommendations for DW Migration App

### Immediate Fixes:
1. **Update static file serving to use `pathlib.Path`**
   ```python
   from pathlib import Path

   static_dir = Path(__file__).parent / "static"

   if static_dir.exists():
       app.mount("/static", StaticFiles(directory=static_dir / "static"), name="static")
   ```

2. **Improve catch-all route**:
   ```python
   @app.get("/{full_path:path}")
   async def serve_react_app(full_path: str):
       if full_path.startswith("api/"):
           raise HTTPException(status_code=404)

       file_path = static_dir / full_path
       if file_path.is_file():
           return FileResponse(file_path)

       index_path = static_dir / "index.html"
       if index_path.is_file():
           return FileResponse(index_path)

       raise HTTPException(status_code=404)
   ```

3. **Add audit logging** for SQL translations and executions

4. **Add session tracking** for analytics

### Future Enhancements:
- Add token usage tracking
- Cost estimation per query
- Performance analytics
- Export functionality improvements
- Multi-model support (like QueryForge)

## Conclusion

QueryForge demonstrates a production-ready Databricks App with:
- Robust static file serving using `pathlib`
- Comprehensive audit logging
- Multi-model LLM integration
- Advanced analytics and monitoring
- Proper error handling

The main issue with DW Migration App is the use of `os.path` instead of `pathlib.Path`, which causes path resolution issues in Databricks Apps runtime environment.

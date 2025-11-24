# DW Migration Assistant

A comprehensive web application and CLI tool built with React, TypeScript, FastAPI, and powered by Databricks to simplify data warehouse migrations to Databricks SQL.

## Features

### 🚀 Multi-Platform Support
Supports migrations from 7 major data warehouse platforms:
- Oracle Data Warehouse
- Snowflake
- Microsoft SQL Server
- Teradata
- IBM Netezza
- Azure Synapse Analytics
- Amazon Redshift

### 💡 Core Capabilities

- **Data Type Mappings**: View detailed mappings for 200+ data types from source systems to Databricks SQL
- **SQL Translator**: AI-powered SQL translation using Databricks LLM multi-agent supervisor
- **DDL Converter**: Convert and execute DDL statements with Unity Catalog support
- **SQL Execution**: Execute queries directly in Databricks SQL with automatic LIMIT enforcement
- **Migration History**: Track your past migration queries and activities
- **Analytics Dashboard**: View insights and statistics about your migrations
- **CLI Tool**: Command-line interface for automated workflows
- **REST API**: FastAPI backend for programmatic access

### 🎨 User Experience

- **Interactive UI**: Smooth animations and intuitive navigation powered by Framer Motion
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Real-time Feedback**: Immediate validation and execution results
- **Search Functionality**: Quickly find specific data type conversions

## Technology Stack

### Frontend
- React 18 with TypeScript
- Material-UI (MUI) components
- Framer Motion for animations
- Emotion for styling

### Backend
- FastAPI for REST API
- Databricks SQL Connector
- Python 3.8+
- Typer for CLI

## Quick Start

### Prerequisites

- Node.js (version 14 or higher)
- Python 3.8+ (for backend/CLI)
- Databricks workspace access
- npm or yarn

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/suryasai87/dw_migration_app.git
cd dw_migration_app
```

2. **Install frontend dependencies:**
```bash
npm install
```

3. **Install backend dependencies:**
```bash
cd backend
pip install -e .
cd ..
```

4. **Configure environment variables:**
```bash
cp .env.example .env
# Edit .env with your Databricks credentials
```

5. **Start the application:**
```bash
# Start both frontend and backend
npm run start:all

# Or start separately:
# Terminal 1: npm run start:backend
# Terminal 2: npm start
```

6. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

## Configuration

Create a `.env` file in the root directory:

```env
# Databricks Configuration
DATABRICKS_HOST=https://fe-vm-hls-amer.cloud.databricks.com
DATABRICKS_TOKEN=your_databricks_token
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/your_warehouse_id

# LLM Agent Configuration
LLM_AGENT_ENDPOINT=https://your-llm-agent-endpoint
REACT_APP_LLM_ENDPOINT=/api/translate-sql

# Unity Catalog Defaults
REACT_APP_DEFAULT_CATALOG=main
REACT_APP_DEFAULT_SCHEMA=default
```

## Usage

### Web Application

1. **Data Type Mappings**
   - Navigate to "Data Type Mappings" in the sidebar
   - Select your source data warehouse
   - Browse and search data type conversions

2. **SQL Translator**
   - Click "SQL Translator" in the sidebar
   - Select source system
   - Paste your source SQL
   - Click "Translate" to convert to Databricks SQL
   - Execute directly in Databricks SQL with one click

3. **DDL Converter**
   - Navigate to "DDL Converter"
   - Select source system and target Unity Catalog
   - Paste DDL statements
   - Convert and optionally execute immediately

### CLI Tool

After installing the backend package, use the `dw-migrate` command:

#### Translate SQL
```bash
# From file
dw-migrate translate --source oracle --file query.sql --output translated.sql

# From command line
dw-migrate translate --source snowflake --sql "SELECT * FROM employees"
```

#### Execute SQL
```bash
# Execute a query
dw-migrate execute --file query.sql --catalog main --schema default

# From command line
dw-migrate execute --sql "SELECT * FROM table" --catalog main
```

#### Convert DDL
```bash
# Convert and save
dw-migrate convert-ddl --source sqlserver --file table.ddl --output converted.ddl

# Convert and execute immediately
dw-migrate convert-ddl --source teradata --file schema.ddl --execute --catalog main --schema analytics
```

#### List Catalogs
```bash
dw-migrate list-catalogs
```

See the [Backend README](backend/README.md) for complete CLI documentation.

## API Endpoints

The FastAPI backend provides the following endpoints:

- `POST /api/translate-sql` - Translate SQL from source to Databricks
- `POST /api/execute-sql` - Execute SQL in Databricks
- `POST /api/convert-ddl` - Convert DDL statements
- `GET /api/catalogs-schemas` - List Unity Catalog catalogs and schemas

Full API documentation available at http://localhost:8000/docs when running.

## Databricks Deployment

### Deploy to Databricks Apps

The application can be deployed as a Databricks App:

```bash
# Configure Databricks CLI
databricks configure

# Deploy the app
databricks apps create dw-migration-assistant

# Or use the Databricks UI to deploy from this repository
```

The app will be available at:
```
https://fe-vm-hls-amer.cloud.databricks.com/apps/dw-migration-assistant
```

### Important Notes for Deployment

- The application uses dynamic port detection (no hardcoded ports)
- Authentication is handled automatically by Databricks
- Unity Catalog permissions are required for DDL execution
- LLM agent endpoint must be configured for SQL translation

## Project Structure

```
dw_migration_app/
├── src/                          # React frontend source
│   ├── components/               # React components
│   │   ├── Dashboard.tsx
│   │   ├── DataTypeMappings.tsx
│   │   ├── SqlTranslator.tsx     # SQL translation UI
│   │   ├── DdlConverter.tsx      # DDL conversion UI
│   │   ├── QueryHistory.tsx
│   │   └── Analytics.tsx
│   ├── config/
│   │   └── apiConfig.ts          # API configuration
│   ├── data/
│   │   └── dataTypeMappings.ts   # Data type mappings
│   ├── services/
│   │   └── databricksService.ts  # API client
│   └── App.tsx
├── backend/                      # FastAPI backend
│   ├── app/
│   │   ├── main.py              # FastAPI application
│   │   ├── cli.py               # CLI tool
│   │   └── __init__.py
│   ├── requirements.txt
│   ├── setup.py
│   └── README.md
├── public/
├── package.json
├── app.yaml                      # Databricks app config
├── databricks.yml                # Databricks bundle config
└── README.md
```

## Data Type Mappings

The application includes comprehensive mappings for:
- Numeric types (INT, BIGINT, DECIMAL, FLOAT, etc.)
- String types (VARCHAR, CHAR, TEXT, etc.)
- Date/Time types (DATE, TIMESTAMP, DATETIME, etc.)
- Binary types (BINARY, BLOB, etc.)
- Special types (JSON, XML, GEOGRAPHY, ARRAY, etc.)

Each mapping includes:
- Source data type
- Target Databricks SQL data type
- Migration notes and considerations

## Development

### Frontend Development
```bash
npm start
```

### Backend Development
```bash
cd backend
uvicorn app.main:app --reload
```

### Run Tests
```bash
# Frontend
npm test

# Backend
cd backend
pytest
```

### Build for Production
```bash
npm run build
```

## Available Scripts

- `npm start` - Start frontend (port 3000)
- `npm run start:backend` - Start backend API (port 8000)
- `npm run start:all` - Start both frontend and backend concurrently
- `npm run build` - Build frontend for production
- `npm test` - Run frontend tests

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
- GitHub Issues: https://github.com/suryasai87/dw_migration_app/issues
- Documentation: See [Backend README](backend/README.md) for API/CLI docs

## Acknowledgments

- Inspired by QueryForge AI
- Built for the Databricks ecosystem
- Data type mappings reference from official vendor documentation
- Powered by Databricks LLM multi-agent supervisor

## Author

**Suryasai Turaga**
- Email: suryasai.turaga@databricks.com
- GitHub: [@suryasai87](https://github.com/suryasai87)

---

Built with ❤️ for seamless data warehouse migrations to Databricks SQL

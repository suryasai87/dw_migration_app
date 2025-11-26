# Frontend Components Reference

## Location: `/src/components/`

## Main Application (`App.tsx`)

### View Routing
```typescript
const renderView = () => {
  switch (currentView) {
    case 'dashboard': return <Dashboard />;
    case 'dataTypeMappings': return <DataTypeMappings />;
    case 'sqlTranslator': return <SqlTranslator />;
    case 'ddlConverter': return <DdlConverter />;
    case 'queryGenerator': return <QueryGenerator />;
    case 'multiTableJoin': return <MultiTableJoinGenerator />;
    case 'connectAndMigrate': return <ConnectAndMigrate />;
    case 'queryHistory': return <QueryHistory />;
    case 'analytics': return <Analytics />;
    default: return <Dashboard />;
  }
};
```

### Theme Configuration
```typescript
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#FF6B35' },  // Databricks orange
    secondary: { main: '#004E89' },
  },
});
```

---

## Sidebar (`Sidebar.tsx`)

### Menu Items
```typescript
const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { id: 'dataTypeMappings', label: 'Data Type Mappings', icon: <TransformIcon /> },
  { id: 'sqlTranslator', label: 'SQL Translator', icon: <TranslateIcon /> },
  { id: 'ddlConverter', label: 'DDL Converter', icon: <BuildIcon /> },
  { id: 'queryGenerator', label: 'Query Generator', icon: <AutoFixHighIcon /> },
  { id: 'multiTableJoin', label: 'Multi-Table Join', icon: <JoinInnerIcon /> },
  { id: 'connectAndMigrate', label: 'Connect & Migrate', icon: <CloudSyncIcon /> },
  { id: 'queryHistory', label: 'Query History', icon: <HistoryIcon /> },
  { id: 'analytics', label: 'Analytics', icon: <AnalyticsIcon /> },
];
```

---

## QueryGenerator (`QueryGenerator.tsx`)

### State
```typescript
const [catalogs, setCatalogs] = useState<string[]>([]);
const [selectedCatalog, setSelectedCatalog] = useState('');
const [schemas, setSchemas] = useState<string[]>([]);
const [selectedSchema, setSelectedSchema] = useState('');
const [tables, setTables] = useState<string[]>([]);
const [selectedTable, setSelectedTable] = useState('');
const [columns, setColumns] = useState<any[]>([]);
const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
const [selectedModel, setSelectedModel] = useState('databricks-llama-4-maverick');
const [businessLogic, setBusinessLogic] = useState('');
const [generatedSql, setGeneratedSql] = useState('');
const [suggestions, setSuggestions] = useState<string[]>([]);
```

### Key Functions
- `loadCatalogs()` - Load Unity Catalog catalogs and AI models
- `handleGetSuggestions()` - Get AI-powered business logic suggestions
- `handleGenerate()` - Generate SQL from natural language
- `handleExecute()` - Execute generated SQL in Databricks

---

## MultiTableJoinGenerator (`MultiTableJoinGenerator.tsx`)

### Interface
```typescript
interface TableSelection {
  id: string;
  catalog: string;
  schema: string;
  table: string;
  columns: any[];
  selectedColumns: string[];
}
```

### State
```typescript
const [tables, setTables] = useState<TableSelection[]>([
  { id: '1', catalog: '', schema: '', table: '', columns: [], selectedColumns: [] },
  { id: '2', catalog: '', schema: '', table: '', columns: [], selectedColumns: [] }
]);
const [schemasMap, setSchemasMap] = useState<Record<string, string[]>>({});
const [tablesMap, setTablesMap] = useState<Record<string, string[]>>({});
const [joinConditions, setJoinConditions] = useState('');
const [joinSuggestions, setJoinSuggestions] = useState<string[]>([]);
```

### Key Functions
- `addTable()` - Add new table to the selection
- `removeTable(index)` - Remove table from selection (minimum 2)
- `handleSuggestJoins()` - Get AI-suggested JOIN conditions
- `handleGenerate()` - Generate multi-table SQL with JOINs

---

## ConnectAndMigrate (`ConnectAndMigrate.tsx`)

### Interfaces
```typescript
interface ConnectionConfig {
  source_type: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  additional_params: Record<string, string>;
}

interface InventoryStats {
  databases: number;
  schemas: number;
  tables: number;
  views: number;
  stored_procedures: number;
  functions: number;
}
```

### Source Systems
```typescript
const SOURCE_SYSTEMS = [
  { id: 'oracle', name: 'Oracle Data Warehouse', defaultPort: 1521, icon: '🔶' },
  { id: 'snowflake', name: 'Snowflake', defaultPort: 443, icon: '❄️' },
  { id: 'sqlserver', name: 'Microsoft SQL Server', defaultPort: 1433, icon: '🟦' },
  { id: 'teradata', name: 'Teradata', defaultPort: 1025, icon: '🟧' },
  { id: 'netezza', name: 'IBM Netezza', defaultPort: 5480, icon: '🔵' },
  { id: 'synapse', name: 'Azure Synapse Analytics', defaultPort: 1433, icon: '🟣' },
  { id: 'redshift', name: 'Amazon Redshift', defaultPort: 5439, icon: '🟠' },
  { id: 'mysql', name: 'MySQL', defaultPort: 3306, icon: '🐬' }
];
```

### Stepper Steps
```typescript
const steps = ['Connect to Source', 'Extract Inventory', 'Configure Migration', 'Run Migration'];
```

### State
```typescript
const [activeStep, setActiveStep] = useState(0);
const [connection, setConnection] = useState<ConnectionConfig>({...});
const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle');
const [connectionId, setConnectionId] = useState<string | null>(null);
const [inventoryStats, setInventoryStats] = useState<InventoryStats | null>(null);
const [inventoryPath, setInventoryPath] = useState<string>('');
const [targetCatalog, setTargetCatalog] = useState('');
const [targetSchema, setTargetSchema] = useState('');
const [dryRun, setDryRun] = useState(true);
const [migrationResults, setMigrationResults] = useState<any>(null);
```

### Key Functions
- `handleTestConnection()` - Test source database connection
- `handleExtractInventory()` - Extract metadata from source
- `handleRunMigration()` - Execute bulk migration

### UI Sections
1. `renderConnectionForm()` - Source system selection and credentials
2. `renderInventorySection()` - Extract and display inventory stats
3. `renderMigrationConfig()` - Target catalog/schema, AI model, dry run toggle
4. `renderMigrationResults()` - Success/failure counts, error log path

---

## DatabricksService (`/src/services/databricksService.ts`)

### Core Methods
```typescript
static async translateSql(request: TranslateSqlRequest): Promise<TranslateSqlResponse>
static async executeSql(request: ExecuteSqlRequest): Promise<ExecuteSqlResponse>
static async convertDdl(request: ConvertDdlRequest): Promise<ConvertDdlResponse>
static async getCatalogsAndSchemas(): Promise<CatalogSchema>
static async listModels(): Promise<{ models: any[] }>
static async getWarehouseStatus(): Promise<any>
static async listCatalogs(): Promise<{ catalogs: string[] }>
static async listSchemas(catalog: string): Promise<{ schemas: string[] }>
static async listTables(catalog: string, schema: string): Promise<{ tables: string[] }>
static async listColumns(catalog: string, schema: string, table: string): Promise<{ columns: any[] }>
static async suggestBusinessLogic(request: any): Promise<any>
static async generateSql(request: any): Promise<any>
static async suggestJoinConditions(request: any): Promise<any>
```

### Connect & Migrate Methods (v3)
```typescript
static async testSourceConnection(connection: any): Promise<any>
static async extractInventory(connectionId: string): Promise<any>
static async runBulkMigration(request: any): Promise<any>
static async getActiveConnections(): Promise<any>
static async getMigrationHistory(): Promise<any>
```

---

## API Configuration (`/src/config/apiConfig.ts`)

```typescript
export const apiConfig = {
  llmAgentEndpoint: '/api/translate-sql',
  databricksSqlEndpoint: '/api/execute-sql',
  defaultCatalog: 'main',
  defaultSchema: 'default',
};

export const getApiEndpoint = (endpoint: string): string => {
  // Returns full URL based on environment
  return endpoint;
};
```

---

## Common UI Patterns

### Loading States
```typescript
{isLoading ? <CircularProgress size={20} /> : <IconComponent />}
```

### Error Handling
```typescript
{error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
```

### Column Selection Chips
```typescript
{columns.map(col => (
  <Chip
    key={col.name}
    label={`${col.name} (${col.type})`}
    onClick={() => toggleColumn(col.name)}
    color={selectedColumns.includes(col.name) ? 'primary' : 'default'}
    size="small"
  />
))}
```

### Metrics Display
```typescript
{metrics && (
  <Box sx={{ mt: 2, p: 1, backgroundColor: '#f0f4ff', borderRadius: 1 }}>
    <Grid container spacing={1}>
      <Grid item xs={6}><Typography variant="caption">Model: {metrics.model_used}</Typography></Grid>
      <Grid item xs={6}><Typography variant="caption">Tokens: {metrics.total_tokens}</Typography></Grid>
      <Grid item xs={6}><Typography variant="caption">Cost: ${metrics.estimated_cost?.toFixed(6)}</Typography></Grid>
      <Grid item xs={6}><Typography variant="caption">Time: {metrics.execution_time_ms}ms</Typography></Grid>
    </Grid>
  </Box>
)}
```

import { apiConfig, getApiEndpoint } from '../config/apiConfig';

export interface TranslateSqlRequest {
  sourceSystem: string;
  sourceSql: string;
  modelId?: string;
}

export interface TranslateSqlResponse {
  success: boolean;
  translatedSql: string;
  error?: string;
  warnings?: string[];
  modelUsed?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  executionTimeMs?: number;
}

export interface ExecuteSqlRequest {
  sql: string;
  catalog?: string;
  schema?: string;
}

export interface ExecuteSqlResponse {
  success: boolean;
  result?: any;
  rowCount?: number;
  executionTime?: number;
  error?: string;
}

export interface ConvertDdlRequest {
  sourceSystem: string;
  sourceDdl: string;
  targetCatalog: string;
  targetSchema: string;
  executeImmediately?: boolean;
}

export interface ConvertDdlResponse {
  success: boolean;
  convertedDdl: string;
  executed?: boolean;
  error?: string;
  warnings?: string[];
}

export interface CatalogSchema {
  catalogs: string[];
  schemas: Record<string, string[]>;
}

export class DatabricksService {
  /**
   * Translate SQL from source system to Databricks SQL using LLM agent
   */
  static async translateSql(request: TranslateSqlRequest): Promise<TranslateSqlResponse> {
    try {
      const response = await fetch(getApiEndpoint(apiConfig.llmAgentEndpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for Databricks auth
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error translating SQL:', error);
      return {
        success: false,
        translatedSql: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Execute SQL in Databricks SQL
   */
  static async executeSql(request: ExecuteSqlRequest): Promise<ExecuteSqlResponse> {
    try {
      // Ensure LIMIT 1 is added if not present
      let sql = request.sql.trim();
      if (!sql.toLowerCase().includes('limit') && sql.toLowerCase().startsWith('select')) {
        sql = `${sql} LIMIT 1`;
      }

      const response = await fetch(getApiEndpoint(apiConfig.databricksSqlEndpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          sql,
          catalog: request.catalog || apiConfig.defaultCatalog,
          schema: request.schema || apiConfig.defaultSchema,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error executing SQL:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Convert DDL from source system to Databricks SQL DDL
   */
  static async convertDdl(request: ConvertDdlRequest): Promise<ConvertDdlResponse> {
    try {
      const response = await fetch(getApiEndpoint('/api/convert-ddl'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error converting DDL:', error);
      return {
        success: false,
        convertedDdl: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Get list of catalogs and schemas from Unity Catalog
   */
  static async getCatalogsAndSchemas(): Promise<CatalogSchema> {
    try {
      const response = await fetch(getApiEndpoint('/api/catalogs-schemas'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching catalogs and schemas:', error);
      return {
        catalogs: [apiConfig.defaultCatalog],
        schemas: { [apiConfig.defaultCatalog]: [apiConfig.defaultSchema] },
      };
    }
  }

  /**
   * Get list of available Foundation Models
   */
  static async listModels(): Promise<{ models: any[] }> {
    try {
      const response = await fetch(getApiEndpoint('/api/models'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching models:', error);
      return { models: [] };
    }
  }

  /**
   * Get SQL warehouse status
   */
  static async getWarehouseStatus(): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/warehouse-status'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching warehouse status:', error);
      return {
        warehouse_id: null,
        warehouse_name: 'Unknown',
        status: 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async listCatalogs(): Promise<{ catalogs: string[] }> {
    try {
      const response = await fetch(getApiEndpoint('/api/catalogs'), { method: 'GET', credentials: 'include' });
      return await response.json();
    } catch (error) {
      return { catalogs: [] };
    }
  }

  static async listSchemas(catalog: string): Promise<{ schemas: string[] }> {
    try {
      const response = await fetch(getApiEndpoint(`/api/catalogs/${catalog}/schemas`), { method: 'GET', credentials: 'include' });
      return await response.json();
    } catch (error) {
      return { schemas: [] };
    }
  }

  static async listTables(catalog: string, schema: string): Promise<{ tables: string[] }> {
    try {
      const response = await fetch(getApiEndpoint(`/api/catalogs/${catalog}/schemas/${schema}/tables`), { method: 'GET', credentials: 'include' });
      return await response.json();
    } catch (error) {
      return { tables: [] };
    }
  }

  static async listColumns(catalog: string, schema: string, table: string): Promise<{ columns: any[] }> {
    try {
      const response = await fetch(getApiEndpoint(`/api/catalogs/${catalog}/schemas/${schema}/tables/${table}/columns`), { method: 'GET', credentials: 'include' });
      return await response.json();
    } catch (error) {
      return { columns: [] };
    }
  }

  static async suggestBusinessLogic(request: any): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/suggest-business-logic'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(request) });
      return await response.json();
    } catch (error) {
      return { suggestions: [] };
    }
  }

  static async generateSql(request: any): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/generate-sql'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(request) });
      return await response.json();
    } catch (error) {
      return { success: false, generated_sql: '', error: 'Request failed' };
    }
  }

  static async suggestJoinConditions(request: any): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/suggest-join-conditions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request)
      });
      return await response.json();
    } catch (error) {
      return { suggestions: [], error: 'Request failed' };
    }
  }

  // Connect and Migrate APIs
  static async testSourceConnection(connection: any): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/connect/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(connection)
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Connection test failed' };
    }
  }

  static async extractInventory(connectionId: string): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/connect/extract-inventory'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connection_id: connectionId })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Inventory extraction failed' };
    }
  }

  static async runBulkMigration(request: any): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/migrate/bulk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request)
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Migration failed' };
    }
  }

  static async getActiveConnections(): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/connect/active-connections'), {
        method: 'GET',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      return { connections: [] };
    }
  }

  static async getMigrationHistory(): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/migrate/history'), {
        method: 'GET',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      return { history: [] };
    }
  }

  // Migration Progress Tracking APIs
  static async startMigration(request: any): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/migrate/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request)
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to start migration' };
    }
  }

  static async getMigrationProgress(jobId: string): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint(`/api/migrate/progress/${jobId}`), {
        method: 'GET',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to get migration progress');
    }
  }

  static async cancelMigration(jobId: string): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint(`/api/migrate/cancel/${jobId}`), {
        method: 'POST',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to cancel migration' };
    }
  }

  static async deleteMigrationJob(jobId: string): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint(`/api/migrate/jobs/${jobId}`), {
        method: 'DELETE',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete migration job' };
    }
  }

  static async listMigrationJobs(): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/migrate/jobs'), {
        method: 'GET',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      return { jobs: [] };
    }
  }

  // Query Testing APIs
  static async testQuery(request: any): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/test/query'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request)
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        query: request.query,
        syntax_valid: false,
        execution_status: 'error',
        error_message: error instanceof Error ? error.message : 'Test failed'
      };
    }
  }

  static async testBatchQueries(request: any): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/test/batch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request)
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Batch test failed'
      };
    }
  }

  static async getTestResults(jobId: string): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint(`/api/test/results/${jobId}`), {
        method: 'GET',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get results'
      };
    }
  }

  static async compareQueryResults(request: any): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/test/compare-results'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request)
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        row_count_match: false,
        data_match: false,
        error_message: error instanceof Error ? error.message : 'Comparison failed'
      };
    }
  }

  // Scheduling APIs
  static async createSchedule(schedule: any): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/schedule/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ schedule })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create schedule' };
    }
  }

  static async listSchedules(): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/schedule/list'), {
        method: 'GET',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      return { success: false, schedules: [], total: 0 };
    }
  }

  static async getSchedule(jobId: string): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint(`/api/schedule/${jobId}`), {
        method: 'GET',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get schedule' };
    }
  }

  static async updateSchedule(jobId: string, updates: any): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint(`/api/schedule/${jobId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates)
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update schedule' };
    }
  }

  static async deleteSchedule(jobId: string): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint(`/api/schedule/${jobId}`), {
        method: 'DELETE',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete schedule' };
    }
  }

  static async runScheduleNow(jobId: string): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint(`/api/schedule/${jobId}/run-now`), {
        method: 'POST',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to run schedule' };
    }
  }

  static async getJobHistory(jobId?: string, limit: number = 50): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (jobId) params.append('job_id', jobId);
      params.append('limit', limit.toString());

      const response = await fetch(getApiEndpoint(`/api/schedule/executions/history?${params}`), {
        method: 'GET',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      return { success: false, executions: [], total: 0 };
    }
  }

  static async getExecutionDetails(executionId: string): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint(`/api/schedule/executions/${executionId}`), {
        method: 'GET',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get execution details' };
    }
  }

  // Schema Comparison APIs
  static async compareSchemas(request: any): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/compare/schemas'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request)
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        source_info: {},
        target_info: {},
        summary: {},
        error: error instanceof Error ? error.message : 'Schema comparison failed'
      };
    }
  }

  static async compareTableStructure(request: any): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint(`/api/compare/tables/${request.source_table}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request)
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Table comparison failed'
      };
    }
  }

  static async getDataTypeMappings(sourceSystem: string): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint(`/api/compare/data-types?source_system=${sourceSystem}`), {
        method: 'GET',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      return { source_system: sourceSystem, mappings: [] };
    }
  }

  // Cost Estimation APIs
  static async estimateMigrationCost(request: any): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/estimate/migration'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request)
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Cost estimation failed' };
    }
  }

  static async estimateStorageCost(dataSizeGb: number, months: number = 12): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint(`/api/estimate/storage?data_size_gb=${dataSizeGb}&months=${months}`), {
        method: 'GET',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Storage cost estimation failed' };
    }
  }

  static async estimateComputeCost(warehouseSize: string, hours: number): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint(`/api/estimate/compute?warehouse_size=${warehouseSize}&hours=${hours}`), {
        method: 'GET',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Compute cost estimation failed' };
    }
  }

  static async compareCosts(request: any): Promise<any> {
    try {
      const response = await fetch(getApiEndpoint('/api/estimate/compare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request)
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Cost comparison failed' };
    }
  }
}

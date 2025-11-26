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
}

export interface ApiConfig {
  llmAgentEndpoint: string;
  databricksSqlEndpoint: string;
  databricksHost: string;
  defaultCatalog: string;
  defaultSchema: string;
}

// Get the current host dynamically
const getCurrentHost = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
};

export const apiConfig: ApiConfig = {
  // LLM Multi-Agent Supervisor Endpoint - Update this with your actual endpoint
  llmAgentEndpoint: process.env.REACT_APP_LLM_ENDPOINT || '/api/translate-sql',

  // Databricks SQL API Endpoint
  databricksSqlEndpoint: process.env.REACT_APP_DATABRICKS_SQL_ENDPOINT || '/api/execute-sql',

  // Databricks Host
  databricksHost: process.env.REACT_APP_DATABRICKS_HOST || 'https://fe-vm-hls-amer.cloud.databricks.com',

  // Default Unity Catalog settings
  defaultCatalog: process.env.REACT_APP_DEFAULT_CATALOG || 'main',
  defaultSchema: process.env.REACT_APP_DEFAULT_SCHEMA || 'default',
};

// Helper function to get API endpoint with dynamic host
export const getApiEndpoint = (path: string): string => {
  const host = getCurrentHost();
  return `${host}${path}`;
};

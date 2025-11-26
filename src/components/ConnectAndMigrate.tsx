import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Box, Grid, Paper, TextField, Button, FormControl, InputLabel, Select, MenuItem,
  Alert, CircularProgress, Chip, Card, CardContent, Stepper, Step, StepLabel, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, LinearProgress, Accordion, AccordionSummary,
  AccordionDetails, Switch, FormControlLabel
} from '@mui/material';
import { motion } from 'framer-motion';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StorageIcon from '@mui/icons-material/Storage';
import InventoryIcon from '@mui/icons-material/Inventory';
import TransformIcon from '@mui/icons-material/Transform';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DownloadIcon from '@mui/icons-material/Download';
import { DatabricksService } from '../services/databricksService';
import MigrationProgress from './MigrationProgress';

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

const ConnectAndMigrate: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [connection, setConnection] = useState<ConnectionConfig>({
    source_type: '',
    host: '',
    port: 1521,
    database: '',
    username: '',
    password: '',
    additional_params: {}
  });
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle');
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [inventoryStats, setInventoryStats] = useState<InventoryStats | null>(null);
  const [inventoryPath, setInventoryPath] = useState<string>('');
  const [isExtractingInventory, setIsExtractingInventory] = useState(false);
  const [catalogs, setCatalogs] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [targetCatalog, setTargetCatalog] = useState('');
  const [targetSchema, setTargetSchema] = useState('');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState('databricks-llama-4-maverick');
  const [dryRun, setDryRun] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResults, setMigrationResults] = useState<any>(null);
  const [migrationJobId, setMigrationJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const steps = ['Connect to Source', 'Extract Inventory', 'Configure Migration', 'Run Migration'];

  useEffect(() => {
    // Load catalogs and models
    Promise.all([
      DatabricksService.listCatalogs().then(r => setCatalogs(r.catalogs || [])),
      DatabricksService.listModels().then(r => setAvailableModels(r.models || []))
    ]).catch(err => {
      console.error('Error loading initial data:', err);
    });
  }, []);

  useEffect(() => {
    if (targetCatalog) {
      DatabricksService.listSchemas(targetCatalog).then(r => setSchemas(r.schemas || []));
    }
  }, [targetCatalog]);

  const handleSourceChange = (sourceType: string) => {
    const source = SOURCE_SYSTEMS.find(s => s.id === sourceType);
    setConnection(prev => ({
      ...prev,
      source_type: sourceType,
      port: source?.defaultPort || 1521
    }));
    setConnectionStatus('idle');
    setConnectionId(null);
  };

  const handleTestConnection = async () => {
    if (!connection.source_type || !connection.host || !connection.database) {
      setError('Please fill in all required connection fields');
      return;
    }

    setConnectionStatus('testing');
    setError(null);
    try {
      const result = await DatabricksService.testSourceConnection(connection);
      if (result.success) {
        setConnectionStatus('connected');
        setConnectionId(result.connection_id);
        setSuccessMessage(`Successfully connected to ${connection.source_type} using ${result.connection_method}`);
        setActiveStep(1);
      } else {
        setConnectionStatus('failed');
        setError(result.error || 'Connection failed');
      }
    } catch (e: any) {
      setConnectionStatus('failed');
      setError(e.message || 'Failed to test connection');
    }
  };

  const handleExtractInventory = async () => {
    if (!connectionId) {
      setError('Please establish a connection first');
      return;
    }

    setIsExtractingInventory(true);
    setError(null);
    try {
      const result = await DatabricksService.extractInventory(connectionId);
      if (result.success) {
        setInventoryStats(result.stats);
        setInventoryPath(result.inventory_path);
        setSuccessMessage(`Inventory extracted successfully! Found ${result.stats.tables} tables, ${result.stats.views} views, ${result.stats.stored_procedures} stored procedures`);
        setActiveStep(2);
      } else {
        setError(result.error || 'Failed to extract inventory');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to extract inventory');
    }
    setIsExtractingInventory(false);
  };

  const handleRunMigration = async () => {
    if (!inventoryPath || !targetCatalog || !targetSchema) {
      setError('Please complete all configuration fields');
      return;
    }

    setIsMigrating(true);
    setError(null);
    setMigrationResults(null);
    setMigrationJobId(null);

    try {
      const result = await DatabricksService.startMigration({
        inventory_path: inventoryPath,
        target_catalog: targetCatalog,
        target_schema: targetSchema,
        source_type: connection.source_type,
        model_id: selectedModel,
        dry_run: dryRun
      });

      if (result.success) {
        setMigrationJobId(result.job_id);
        setSuccessMessage(`Migration started! Job ID: ${result.job_id}`);
        setActiveStep(3);
      } else {
        setError(result.error || 'Failed to start migration');
        setIsMigrating(false);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to start migration');
      setIsMigrating(false);
    }
  };

  const handleMigrationComplete = (success: boolean) => {
    setIsMigrating(false);
    if (success) {
      setSuccessMessage(`Migration ${dryRun ? 'dry run' : ''} completed successfully!`);
    } else {
      setError('Migration failed or was cancelled');
    }
  };

  const handleMigrationCancel = () => {
    setSuccessMessage('Migration cancelled by user');
    setIsMigrating(false);
  };

  const renderConnectionForm = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <StorageIcon /> Source System Connection
        </Typography>

        <Grid container spacing={3}>
          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>Source System</InputLabel>
              <Select
                value={connection.source_type}
                label="Source System"
                onChange={(e) => handleSourceChange(e.target.value)}
              >
                {SOURCE_SYSTEMS.map(source => (
                  <MenuItem key={source.id} value={source.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>{source.icon}</span>
                      {source.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {connection.source_type && (
            <>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Host"
                  value={connection.host}
                  onChange={(e) => setConnection(prev => ({ ...prev, host: e.target.value }))}
                  placeholder="hostname or IP address"
                  required
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="Port"
                  type="number"
                  value={connection.port}
                  onChange={(e) => setConnection(prev => ({ ...prev, port: parseInt(e.target.value) || 0 }))}
                  required
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="Database"
                  value={connection.database}
                  onChange={(e) => setConnection(prev => ({ ...prev, database: e.target.value }))}
                  placeholder={connection.source_type === 'snowflake' ? 'account_identifier' : 'database name'}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Username"
                  value={connection.username}
                  onChange={(e) => setConnection(prev => ({ ...prev, username: e.target.value }))}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Password"
                  type="password"
                  value={connection.password}
                  onChange={(e) => setConnection(prev => ({ ...prev, password: e.target.value }))}
                  required
                />
              </Grid>

              {connection.source_type === 'snowflake' && (
                <>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Warehouse"
                      value={connection.additional_params.warehouse || ''}
                      onChange={(e) => setConnection(prev => ({
                        ...prev,
                        additional_params: { ...prev.additional_params, warehouse: e.target.value }
                      }))}
                      placeholder="COMPUTE_WH"
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Role"
                      value={connection.additional_params.role || ''}
                      onChange={(e) => setConnection(prev => ({
                        ...prev,
                        additional_params: { ...prev.additional_params, role: e.target.value }
                      }))}
                      placeholder="ACCOUNTADMIN"
                    />
                  </Grid>
                </>
              )}

              <Grid item xs={12}>
                <Button
                  variant="contained"
                  onClick={handleTestConnection}
                  disabled={connectionStatus === 'testing'}
                  startIcon={connectionStatus === 'testing' ? <CircularProgress size={20} /> : <CloudSyncIcon />}
                  sx={{ mr: 2 }}
                >
                  {connectionStatus === 'testing' ? 'Testing Connection...' : 'Test Connection'}
                </Button>

                {connectionStatus === 'connected' && (
                  <Chip
                    icon={<CheckCircleIcon />}
                    label="Connected"
                    color="success"
                    sx={{ ml: 1 }}
                  />
                )}
                {connectionStatus === 'failed' && (
                  <Chip
                    icon={<ErrorIcon />}
                    label="Connection Failed"
                    color="error"
                    sx={{ ml: 1 }}
                  />
                )}
              </Grid>
            </>
          )}
        </Grid>
      </CardContent>
    </Card>
  );

  const renderInventorySection = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <InventoryIcon /> Extract Metadata Inventory
        </Typography>

        {connectionStatus !== 'connected' ? (
          <Alert severity="info">Please establish a connection first to extract inventory</Alert>
        ) : (
          <>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Extract database schemas, tables, views, stored procedures, and functions from the source system.
              The inventory will be saved to Unity Catalog volume for migration.
            </Typography>

            <Button
              variant="contained"
              onClick={handleExtractInventory}
              disabled={isExtractingInventory}
              startIcon={isExtractingInventory ? <CircularProgress size={20} /> : <DownloadIcon />}
            >
              {isExtractingInventory ? 'Extracting Inventory...' : 'Extract Inventory'}
            </Button>

            {isExtractingInventory && (
              <Box sx={{ mt: 2 }}>
                <LinearProgress />
                <Typography variant="caption" color="textSecondary">
                  Querying system tables and extracting metadata...
                </Typography>
              </Box>
            )}

            {inventoryStats && (
              <Box sx={{ mt: 3 }}>
                <Alert severity="success" sx={{ mb: 2 }}>
                  Inventory extracted to: {inventoryPath}
                </Alert>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableCell><strong>Object Type</strong></TableCell>
                        <TableCell align="right"><strong>Count</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell>Databases</TableCell>
                        <TableCell align="right">{inventoryStats.databases}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Schemas</TableCell>
                        <TableCell align="right">{inventoryStats.schemas}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Tables</TableCell>
                        <TableCell align="right">{inventoryStats.tables}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Views</TableCell>
                        <TableCell align="right">{inventoryStats.views}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Stored Procedures</TableCell>
                        <TableCell align="right">{inventoryStats.stored_procedures}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Functions</TableCell>
                        <TableCell align="right">{inventoryStats.functions}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );

  const renderMigrationConfig = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TransformIcon /> Migration Configuration
        </Typography>

        {!inventoryStats ? (
          <Alert severity="info">Please extract inventory first</Alert>
        ) : (
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Target Catalog</InputLabel>
                <Select
                  value={targetCatalog}
                  label="Target Catalog"
                  onChange={(e) => setTargetCatalog(e.target.value)}
                >
                  {catalogs.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Target Schema</InputLabel>
                <Select
                  value={targetSchema}
                  label="Target Schema"
                  onChange={(e) => setTargetSchema(e.target.value)}
                  disabled={!targetCatalog}
                >
                  {schemas.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>AI Model</InputLabel>
                <Select
                  value={selectedModel}
                  label="AI Model"
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  {availableModels.map(m => (
                    <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    color="primary"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1">Dry Run Mode</Typography>
                    <Typography variant="caption" color="textSecondary">
                      Test SQL syntax with LIMIT 1 without creating actual objects
                    </Typography>
                  </Box>
                }
              />
            </Grid>
            <Grid item xs={12}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleRunMigration}
                disabled={isMigrating || !targetCatalog || !targetSchema}
                startIcon={isMigrating ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                size="large"
              >
                {isMigrating ? 'Running Migration...' : (dryRun ? 'Run Dry Run' : 'Run Migration')}
              </Button>
            </Grid>
          </Grid>
        )}
      </CardContent>
    </Card>
  );

  const renderMigrationResults = () => {
    if (!migrationJobId) {
      return (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Migration Results</Typography>
            <Alert severity="info">Run a migration to see real-time progress</Alert>
          </CardContent>
        </Card>
      );
    }

    return (
      <MigrationProgress
        jobId={migrationJobId}
        onComplete={handleMigrationComplete}
        onCancel={handleMigrationCancel}
      />
    );
  };

  return (
    <Container maxWidth="lg">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CloudSyncIcon /> Connect & Migrate
          </Typography>
          <Typography variant="body1" color="textSecondary">
            Connect to source databases, extract metadata inventory, and migrate to Databricks SQL
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {successMessage && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        )}

        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label, index) => (
            <Step key={label} completed={index < activeStep}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {renderConnectionForm()}
        {renderInventorySection()}
        {renderMigrationConfig()}
        {renderMigrationResults()}
      </motion.div>
    </Container>
  );
};

export default ConnectAndMigrate;

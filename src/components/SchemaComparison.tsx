import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Box, Grid, Paper, TextField, Button, FormControl, InputLabel, Select, MenuItem,
  Alert, CircularProgress, Chip, Card, CardContent, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tabs, Tab, IconButton, Collapse, TableSortLabel, ToggleButton, ToggleButtonGroup,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip
} from '@mui/material';
import { motion } from 'framer-motion';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import DownloadIcon from '@mui/icons-material/Download';
import FilterListIcon from '@mui/icons-material/FilterList';
import InfoIcon from '@mui/icons-material/Info';
import { DatabricksService } from '../services/databricksService';

interface SchemaComparisonState {
  sourceConnectionId: string;
  sourceCatalog: string;
  sourceSchema: string;
  targetCatalog: string;
  targetSchema: string;
}

interface ColumnDifference {
  column_name: string;
  difference_type: string;
  source_type?: string;
  target_type?: string;
  source_nullable?: boolean;
  target_nullable?: boolean;
}

interface TableComparison {
  table_name: string;
  status: string;
  column_differences: ColumnDifference[];
  source_column_count?: number;
  target_column_count?: number;
}

interface ComparisonResult {
  success: boolean;
  source_info: any;
  target_info: any;
  tables_only_in_source: string[];
  tables_only_in_target: string[];
  tables_in_both: TableComparison[];
  summary: {
    total_source_tables: number;
    total_target_tables: number;
    tables_to_create: number;
    orphaned_tables: number;
    matching_tables: number;
    tables_with_differences: number;
  };
  error?: string;
}

const SchemaComparison: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [config, setConfig] = useState<SchemaComparisonState>({
    sourceConnectionId: '',
    sourceCatalog: '',
    sourceSchema: '',
    targetCatalog: '',
    targetSchema: ''
  });

  const [connections, setConnections] = useState<any[]>([]);
  const [catalogs, setCatalogs] = useState<string[]>([]);
  const [targetSchemas, setTargetSchemas] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableDetailDialog, setTableDetailDialog] = useState(false);
  const [tableDetails, setTableDetails] = useState<any>(null);
  const [dataTypeMappings, setDataTypeMappings] = useState<any[]>([]);

  useEffect(() => {
    // Load active connections and catalogs
    Promise.all([
      DatabricksService.getActiveConnections().then(r => setConnections(r.connections || [])),
      DatabricksService.listCatalogs().then(r => setCatalogs(r.catalogs || []))
    ]).catch(err => console.error('Error loading initial data:', err));
  }, []);

  useEffect(() => {
    if (config.targetCatalog) {
      DatabricksService.listSchemas(config.targetCatalog).then(r => setTargetSchemas(r.schemas || []));
    }
  }, [config.targetCatalog]);

  useEffect(() => {
    if (config.sourceConnectionId) {
      const conn = connections.find(c => c.connection_id === config.sourceConnectionId);
      if (conn) {
        fetch(`/api/compare/data-types?source_system=${conn.source_type}`, {
          credentials: 'include'
        })
          .then(r => r.json())
          .then(data => setDataTypeMappings(data.mappings || []))
          .catch(err => console.error('Error loading data type mappings:', err));
      }
    }
  }, [config.sourceConnectionId, connections]);

  const handleCompare = async () => {
    if (!config.sourceConnectionId || !config.targetCatalog || !config.targetSchema) {
      setError('Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    setError(null);
    setComparisonResult(null);

    try {
      const result = await DatabricksService.compareSchemas({
        source_connection_id: config.sourceConnectionId,
        source_catalog: config.sourceCatalog,
        source_schema: config.sourceSchema,
        target_catalog: config.targetCatalog,
        target_schema: config.targetSchema
      });

      if (result.success) {
        setComparisonResult(result);
        setActiveTab(1); // Switch to results tab
      } else {
        setError(result.error || 'Comparison failed');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to compare schemas');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewTableDetails = async (tableName: string) => {
    setSelectedTable(tableName);
    setTableDetailDialog(true);
    setTableDetails(null);

    try {
      const result = await DatabricksService.compareTableStructure({
        source_connection_id: config.sourceConnectionId,
        source_catalog: config.sourceCatalog || '',
        source_schema: config.sourceSchema || 'public',
        source_table: tableName,
        target_catalog: config.targetCatalog,
        target_schema: config.targetSchema,
        target_table: tableName
      });

      setTableDetails(result);
    } catch (e) {
      console.error('Error loading table details:', e);
    }
  };

  const toggleRowExpand = (tableName: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(tableName)) {
      newExpanded.delete(tableName);
    } else {
      newExpanded.add(tableName);
    }
    setExpandedRows(newExpanded);
  };

  const exportToCSV = () => {
    if (!comparisonResult) return;

    const rows = [
      ['Table Name', 'Status', 'Source Column Count', 'Target Column Count', 'Differences']
    ];

    comparisonResult.tables_only_in_source.forEach(table => {
      rows.push([table, 'Missing in Target', '-', '0', 'Table needs to be created']);
    });

    comparisonResult.tables_only_in_target.forEach(table => {
      rows.push([table, 'Orphaned in Target', '0', '-', 'Table not in source']);
    });

    comparisonResult.tables_in_both.forEach(table => {
      rows.push([
        table.table_name,
        table.status,
        table.source_column_count?.toString() || '0',
        table.target_column_count?.toString() || '0',
        table.column_differences.length > 0 ? `${table.column_differences.length} differences` : 'None'
      ]);
    });

    const csvContent = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schema_comparison_${Date.now()}.csv`;
    a.click();
  };

  const exportToJSON = () => {
    if (!comparisonResult) return;

    const blob = new Blob([JSON.stringify(comparisonResult, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schema_comparison_${Date.now()}.json`;
    a.click();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'match': return 'success';
      case 'different': return 'warning';
      case 'missing_in_target': return 'error';
      case 'missing_in_source': return 'info';
      default: return 'default';
    }
  };

  const getDifferenceTypeColor = (type: string) => {
    switch (type) {
      case 'missing_in_target': return '#f44336';
      case 'missing_in_source': return '#2196f3';
      case 'type_mismatch': return '#ff9800';
      case 'nullability_mismatch': return '#ffc107';
      default: return '#9e9e9e';
    }
  };

  const getDifferenceTypeLabel = (type: string) => {
    switch (type) {
      case 'missing_in_target': return 'Missing in Target';
      case 'missing_in_source': return 'Extra in Target';
      case 'type_mismatch': return 'Type Mismatch';
      case 'nullability_mismatch': return 'Nullability Difference';
      default: return type;
    }
  };

  const filteredTables = comparisonResult ? (() => {
    let tables: any[] = [];

    if (filterType === 'all' || filterType === 'missing') {
      tables = [
        ...tables,
        ...comparisonResult.tables_only_in_source.map(t => ({ table_name: t, status: 'missing_in_target' }))
      ];
    }

    if (filterType === 'all' || filterType === 'orphaned') {
      tables = [
        ...tables,
        ...comparisonResult.tables_only_in_target.map(t => ({ table_name: t, status: 'missing_in_source' }))
      ];
    }

    if (filterType === 'all' || filterType === 'match') {
      tables = [...tables, ...comparisonResult.tables_in_both.filter(t => t.status === 'match')];
    }

    if (filterType === 'all' || filterType === 'different') {
      tables = [...tables, ...comparisonResult.tables_in_both.filter(t => t.status === 'different')];
    }

    return tables;
  })() : [];

  const renderConfigurationTab = () => (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Schema Comparison Configuration</Typography>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, backgroundColor: '#f5f5f5' }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                Source System
              </Typography>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Connection</InputLabel>
                <Select
                  value={config.sourceConnectionId}
                  label="Connection"
                  onChange={(e) => setConfig(prev => ({ ...prev, sourceConnectionId: e.target.value }))}
                >
                  {connections.map(conn => (
                    <MenuItem key={conn.connection_id} value={conn.connection_id}>
                      {conn.source_type} - {conn.host} ({conn.database})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                fullWidth
                label="Source Catalog (Optional)"
                value={config.sourceCatalog}
                onChange={(e) => setConfig(prev => ({ ...prev, sourceCatalog: e.target.value }))}
                sx={{ mb: 2 }}
                placeholder="Leave empty for default"
              />

              <TextField
                fullWidth
                label="Source Schema (Optional)"
                value={config.sourceSchema}
                onChange={(e) => setConfig(prev => ({ ...prev, sourceSchema: e.target.value }))}
                placeholder="Default: public"
              />
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, backgroundColor: '#e8f5e9' }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                Target System (Databricks)
              </Typography>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Target Catalog</InputLabel>
                <Select
                  value={config.targetCatalog}
                  label="Target Catalog"
                  onChange={(e) => setConfig(prev => ({ ...prev, targetCatalog: e.target.value }))}
                >
                  {catalogs.map(cat => (
                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>Target Schema</InputLabel>
                <Select
                  value={config.targetSchema}
                  label="Target Schema"
                  onChange={(e) => setConfig(prev => ({ ...prev, targetSchema: e.target.value }))}
                  disabled={!config.targetCatalog}
                >
                  {targetSchemas.map(schema => (
                    <MenuItem key={schema} value={schema}>{schema}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Button
              variant="contained"
              size="large"
              onClick={handleCompare}
              disabled={isLoading || !config.sourceConnectionId || !config.targetCatalog || !config.targetSchema}
              startIcon={isLoading ? <CircularProgress size={20} /> : <CompareArrowsIcon />}
              fullWidth
            >
              {isLoading ? 'Comparing Schemas...' : 'Compare Schemas'}
            </Button>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );

  const renderSummaryCards = () => {
    if (!comparisonResult) return null;

    const { summary } = comparisonResult;

    return (
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={2}>
          <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#e3f2fd' }}>
            <Typography variant="h4" color="primary">{summary.total_source_tables}</Typography>
            <Typography variant="body2">Source Tables</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={2}>
          <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#e8f5e9' }}>
            <Typography variant="h4" color="success.main">{summary.total_target_tables}</Typography>
            <Typography variant="body2">Target Tables</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={2}>
          <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#ffebee' }}>
            <Typography variant="h4" color="error.main">{summary.tables_to_create}</Typography>
            <Typography variant="body2">To Create</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={2}>
          <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#fff3e0' }}>
            <Typography variant="h4" color="warning.main">{summary.orphaned_tables}</Typography>
            <Typography variant="body2">Orphaned</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={2}>
          <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#e8f5e9' }}>
            <Typography variant="h4" color="success.main">{summary.matching_tables}</Typography>
            <Typography variant="body2">Matching</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={2}>
          <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#fff9c4' }}>
            <Typography variant="h4" color="warning.main">{summary.tables_with_differences}</Typography>
            <Typography variant="body2">With Diffs</Typography>
          </Paper>
        </Grid>
      </Grid>
    );
  };

  const renderResultsTab = () => {
    if (!comparisonResult) {
      return (
        <Alert severity="info">
          Configure and run a schema comparison to see results
        </Alert>
      );
    }

    return (
      <Box>
        {renderSummaryCards()}

        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <FilterListIcon />
            <ToggleButtonGroup
              value={filterType}
              exclusive
              onChange={(e, value) => value && setFilterType(value)}
              size="small"
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="missing">Missing</ToggleButton>
              <ToggleButton value="orphaned">Orphaned</ToggleButton>
              <ToggleButton value="match">Match</ToggleButton>
              <ToggleButton value="different">Different</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              startIcon={<DownloadIcon />}
              variant="outlined"
              size="small"
              onClick={exportToCSV}
            >
              CSV
            </Button>
            <Button
              startIcon={<DownloadIcon />}
              variant="outlined"
              size="small"
              onClick={exportToJSON}
            >
              JSON
            </Button>
          </Box>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell width={50}></TableCell>
                <TableCell><strong>Table Name</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell align="center"><strong>Source Columns</strong></TableCell>
                <TableCell align="center"><strong>Target Columns</strong></TableCell>
                <TableCell align="center"><strong>Differences</strong></TableCell>
                <TableCell align="center"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTables.map((table, index) => (
                <React.Fragment key={index}>
                  <TableRow hover>
                    <TableCell>
                      {table.column_differences && table.column_differences.length > 0 && (
                        <IconButton size="small" onClick={() => toggleRowExpand(table.table_name)}>
                          {expandedRows.has(table.table_name) ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                      )}
                    </TableCell>
                    <TableCell>{table.table_name}</TableCell>
                    <TableCell>
                      <Chip
                        label={table.status === 'missing_in_target' ? 'Missing in Target' :
                               table.status === 'missing_in_source' ? 'Orphaned' : table.status}
                        color={getStatusColor(table.status) as any}
                        size="small"
                        icon={
                          table.status === 'match' ? <CheckCircleIcon /> :
                          table.status === 'different' ? <WarningIcon /> : <ErrorIcon />
                        }
                      />
                    </TableCell>
                    <TableCell align="center">{table.source_column_count || '-'}</TableCell>
                    <TableCell align="center">{table.target_column_count || '-'}</TableCell>
                    <TableCell align="center">
                      {table.column_differences ? table.column_differences.length : '-'}
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleViewTableDetails(table.table_name)}
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>

                  {table.column_differences && table.column_differences.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ py: 0, borderBottom: 0 }}>
                        <Collapse in={expandedRows.has(table.table_name)} timeout="auto" unmountOnExit>
                          <Box sx={{ m: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>Column Differences:</Typography>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell><strong>Column Name</strong></TableCell>
                                  <TableCell><strong>Difference Type</strong></TableCell>
                                  <TableCell><strong>Source Type</strong></TableCell>
                                  <TableCell><strong>Target Type</strong></TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {table.column_differences.map((diff: ColumnDifference, i: number) => (
                                  <TableRow key={i}>
                                    <TableCell>{diff.column_name}</TableCell>
                                    <TableCell>
                                      <Chip
                                        label={getDifferenceTypeLabel(diff.difference_type)}
                                        size="small"
                                        sx={{
                                          backgroundColor: getDifferenceTypeColor(diff.difference_type),
                                          color: 'white'
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell>{diff.source_type || '-'}</TableCell>
                                    <TableCell>{diff.target_type || '-'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  const renderDataTypeMappingsTab = () => (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2">
          Data type mappings from source system to Databricks SQL. These mappings are automatically applied during schema migration.
        </Typography>
      </Alert>

      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
            <TableRow>
              <TableCell><strong>Source Type</strong></TableCell>
              <TableCell><strong>Databricks Type</strong></TableCell>
              <TableCell><strong>Notes</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dataTypeMappings.length > 0 ? (
              dataTypeMappings.map((mapping, index) => (
                <TableRow key={index} hover>
                  <TableCell>
                    <Chip label={mapping.source} color="primary" size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip label={mapping.target} color="success" size="small" />
                  </TableCell>
                  <TableCell>{mapping.notes}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} align="center">
                  <Typography variant="body2" color="textSecondary">
                    Select a source connection to view data type mappings
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  const renderTableDetailDialog = () => (
    <Dialog
      open={tableDetailDialog}
      onClose={() => setTableDetailDialog(false)}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        Table Details: {selectedTable}
      </DialogTitle>
      <DialogContent>
        {!tableDetails ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box>
            {!tableDetails.exists_in_target && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                This table does not exist in the target schema
              </Alert>
            )}

            <Typography variant="subtitle1" gutterBottom sx={{ mt: 2, fontWeight: 'bold' }}>
              Source Columns
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Column Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Nullable</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tableDetails.source_columns?.map((col: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{col.name}</TableCell>
                      <TableCell>{col.type}</TableCell>
                      <TableCell>{col.nullable ? 'Yes' : 'No'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {tableDetails.exists_in_target && (
              <>
                <Typography variant="subtitle1" gutterBottom sx={{ mt: 2, fontWeight: 'bold' }}>
                  Target Columns
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Column Name</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Nullable</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tableDetails.target_columns?.map((col: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell>{col.name}</TableCell>
                          <TableCell>{col.type}</TableCell>
                          <TableCell>{col.nullable ? 'Yes' : 'No'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setTableDetailDialog(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  );

  return (
    <Container maxWidth="xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CompareArrowsIcon fontSize="large" /> Schema Comparison
          </Typography>
          <Typography variant="body1" color="textSecondary">
            Compare source and target schemas to identify migration differences before/after migration
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
            <Tab label="Configuration" />
            <Tab label="Comparison Results" disabled={!comparisonResult} />
            <Tab label="Data Type Mappings" />
          </Tabs>
        </Box>

        <Box sx={{ mt: 2 }}>
          {activeTab === 0 && renderConfigurationTab()}
          {activeTab === 1 && renderResultsTab()}
          {activeTab === 2 && renderDataTypeMappingsTab()}
        </Box>

        {renderTableDetailDialog()}
      </motion.div>
    </Container>
  );
};

export default SchemaComparison;

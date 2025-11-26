import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  Collapse,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Upload as UploadIcon,
  Compare as CompareIcon,
} from '@mui/icons-material';
import { DatabricksService } from '../services/databricksService';

interface TestResult {
  success: boolean;
  query: string;
  syntax_valid: boolean;
  execution_status: string;
  execution_time_ms?: number;
  row_count?: number;
  rows_scanned?: number;
  sample_rows?: any[];
  error_message?: string;
}

const QueryTesting: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [queries, setQueries] = useState('');
  const [catalog, setCatalog] = useState('main');
  const [schema, setSchema] = useState('default');
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [catalogs, setCatalogs] = useState<string[]>(['main']);
  const [schemas, setSchemas] = useState<Record<string, string[]>>({ main: ['default'] });
  const [error, setError] = useState<string | null>(null);

  // Comparison dialog state
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [sourceQuery, setSourceQuery] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [sourceCatalog, setSourceCatalog] = useState('main');
  const [sourceSchema, setSourceSchema] = useState('default');
  const [targetCatalog, setTargetCatalog] = useState('main');
  const [targetSchema, setTargetSchema] = useState('default');
  const [compareResults, setCompareResults] = useState<any>(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    loadCatalogs();
  }, []);

  const loadCatalogs = async () => {
    try {
      const data = await DatabricksService.getCatalogsAndSchemas();
      setCatalogs(data.catalogs);
      setSchemas(data.schemas);
      if (data.catalogs.length > 0) {
        setCatalog(data.catalogs[0]);
        setSourceCatalog(data.catalogs[0]);
        setTargetCatalog(data.catalogs[0]);
        if (data.schemas[data.catalogs[0]]?.length > 0) {
          setSchema(data.schemas[data.catalogs[0]][0]);
          setSourceSchema(data.schemas[data.catalogs[0]][0]);
          setTargetSchema(data.schemas[data.catalogs[0]][0]);
        }
      }
    } catch (err) {
      console.error('Failed to load catalogs:', err);
    }
  };

  const parseQueries = (text: string): string[] => {
    // Split by semicolon and filter out empty queries
    return text
      .split(';')
      .map(q => q.trim())
      .filter(q => q.length > 0);
  };

  const handleTestQueries = async () => {
    setError(null);
    setResults([]);
    setTesting(true);

    const queryList = parseQueries(queries);

    if (queryList.length === 0) {
      setError('Please enter at least one query');
      setTesting(false);
      return;
    }

    try {
      if (queryList.length === 1) {
        // Single query test
        const result = await DatabricksService.testQuery({
          query: queryList[0],
          catalog,
          schema,
          timeout_seconds: timeoutSeconds,
        });
        setResults([result]);
        setTesting(false);
      } else {
        // Batch test
        const response = await DatabricksService.testBatchQueries({
          queries: queryList,
          catalog,
          schema,
          timeout_seconds: timeoutSeconds,
        });

        if (response.success) {
          setJobId(response.job_id);
          setProgress({ completed: 0, total: response.total_queries });
          pollResults(response.job_id);
        } else {
          setError('Failed to start batch test');
          setTesting(false);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Test execution failed');
      setTesting(false);
    }
  };

  const pollResults = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await DatabricksService.getTestResults(id);

        if (response.success) {
          setProgress({ completed: response.completed, total: response.total });
          setResults(response.results);

          if (response.status === 'completed' || response.status === 'failed') {
            clearInterval(interval);
            setTesting(false);
            setJobId(null);
          }
        }
      } catch (err) {
        console.error('Failed to poll results:', err);
        clearInterval(interval);
        setTesting(false);
      }
    }, 1000);
  };

  const handleCompare = async () => {
    setComparing(true);
    setCompareResults(null);

    try {
      const result = await DatabricksService.compareQueryResults({
        source_query: sourceQuery,
        target_query: targetQuery,
        source_catalog: sourceCatalog,
        source_schema: sourceSchema,
        target_catalog: targetCatalog,
        target_schema: targetSchema,
        sample_size: 100,
      });

      setCompareResults(result);
    } catch (err: any) {
      setError(err.message || 'Comparison failed');
    } finally {
      setComparing(false);
    }
  };

  const toggleExpandRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'success';
      case 'error':
        return 'error';
      case 'timeout':
        return 'warning';
      default:
        return 'default';
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setQueries(content);
      };
      reader.readAsText(file);
    }
  };

  const retryFailedTests = () => {
    const failedQueries = results
      .filter(r => r.execution_status === 'error' || r.execution_status === 'timeout')
      .map(r => r.query)
      .join(';\n');
    setQueries(failedQueries);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
        Query Testing
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 3 }}>
          <Tab label="Test Queries" />
          <Tab label="Compare Results" />
        </Tabs>

        {activeTab === 0 && (
          <Box>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Catalog</InputLabel>
                  <Select value={catalog} onChange={(e) => setCatalog(e.target.value)} label="Catalog">
                    {catalogs.map((c) => (
                      <MenuItem key={c} value={c}>
                        {c}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Schema</InputLabel>
                  <Select value={schema} onChange={(e) => setSchema(e.target.value)} label="Schema">
                    {(schemas[catalog] || []).map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Timeout (seconds)"
                  type="number"
                  value={timeoutSeconds}
                  onChange={(e) => setTimeoutSeconds(parseInt(e.target.value))}
                />
              </Grid>
            </Grid>

            <TextField
              fullWidth
              multiline
              rows={12}
              value={queries}
              onChange={(e) => setQueries(e.target.value)}
              placeholder="Enter SQL queries (separate multiple queries with semicolons)&#10;&#10;Example:&#10;SELECT * FROM table1 LIMIT 10;&#10;SELECT COUNT(*) FROM table2;"
              sx={{ mb: 2 }}
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                startIcon={testing ? <StopIcon /> : <PlayArrowIcon />}
                onClick={handleTestQueries}
                disabled={testing || !queries.trim()}
              >
                {testing ? 'Testing...' : 'Run Tests'}
              </Button>
              <Button variant="outlined" component="label" startIcon={<UploadIcon />}>
                Upload SQL File
                <input type="file" hidden accept=".sql,.txt" onChange={handleFileUpload} />
              </Button>
              {results.some(r => r.execution_status !== 'success') && (
                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={retryFailedTests}>
                  Retry Failed
                </Button>
              )}
            </Box>

            {testing && progress.total > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Testing {progress.completed} / {progress.total} queries
                </Typography>
                <LinearProgress variant="determinate" value={(progress.completed / progress.total) * 100} />
              </Box>
            )}

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </Box>
        )}

        {activeTab === 1 && (
          <Box>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Source Query
                </Typography>
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Catalog</InputLabel>
                      <Select value={sourceCatalog} onChange={(e) => setSourceCatalog(e.target.value)} label="Catalog">
                        {catalogs.map((c) => (
                          <MenuItem key={c} value={c}>
                            {c}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Schema</InputLabel>
                      <Select value={sourceSchema} onChange={(e) => setSourceSchema(e.target.value)} label="Schema">
                        {(schemas[sourceCatalog] || []).map((s) => (
                          <MenuItem key={s} value={s}>
                            {s}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
                <TextField
                  fullWidth
                  multiline
                  rows={8}
                  value={sourceQuery}
                  onChange={(e) => setSourceQuery(e.target.value)}
                  placeholder="Enter source query..."
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Target Query
                </Typography>
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Catalog</InputLabel>
                      <Select value={targetCatalog} onChange={(e) => setTargetCatalog(e.target.value)} label="Catalog">
                        {catalogs.map((c) => (
                          <MenuItem key={c} value={c}>
                            {c}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Schema</InputLabel>
                      <Select value={targetSchema} onChange={(e) => setTargetSchema(e.target.value)} label="Schema">
                        {(schemas[targetCatalog] || []).map((s) => (
                          <MenuItem key={s} value={s}>
                            {s}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
                <TextField
                  fullWidth
                  multiline
                  rows={8}
                  value={targetQuery}
                  onChange={(e) => setTargetQuery(e.target.value)}
                  placeholder="Enter target query..."
                />
              </Grid>
            </Grid>

            <Button
              variant="contained"
              startIcon={comparing ? <CircularProgress size={20} /> : <CompareIcon />}
              onClick={handleCompare}
              disabled={comparing || !sourceQuery.trim() || !targetQuery.trim()}
            >
              {comparing ? 'Comparing...' : 'Compare Queries'}
            </Button>

            {compareResults && (
              <Box sx={{ mt: 3 }}>
                <Alert severity={compareResults.row_count_match && compareResults.data_match ? 'success' : 'warning'}>
                  <Typography variant="subtitle1" gutterBottom>
                    Comparison Results
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2">
                        <strong>Source Rows:</strong> {compareResults.source_row_count}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Source Time:</strong> {compareResults.source_execution_time_ms}ms
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2">
                        <strong>Target Rows:</strong> {compareResults.target_row_count}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Target Time:</strong> {compareResults.target_execution_time_ms}ms
                      </Typography>
                    </Grid>
                  </Grid>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    <strong>Row Count Match:</strong> {compareResults.row_count_match ? 'Yes' : 'No'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Data Match:</strong> {compareResults.data_match ? 'Yes' : 'No'}
                  </Typography>
                  {compareResults.discrepancies && compareResults.discrepancies.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2" color="error">
                        <strong>Discrepancies found in {compareResults.discrepancies.length} rows</strong>
                      </Typography>
                    </Box>
                  )}
                </Alert>
              </Box>
            )}
          </Box>
        )}
      </Paper>

      {results.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Test Results ({results.filter((r) => r.execution_status === 'success').length} / {results.length} passed)
          </Typography>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell width="50px"></TableCell>
                  <TableCell>Query</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Execution Time</TableCell>
                  <TableCell>Rows</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map((result, index) => (
                  <React.Fragment key={index}>
                    <TableRow>
                      <TableCell>
                        <IconButton size="small" onClick={() => toggleExpandRow(index)}>
                          {expandedRows.has(index) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {result.query}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={result.execution_status} color={getStatusColor(result.execution_status)} size="small" />
                      </TableCell>
                      <TableCell>{result.execution_time_ms ? `${result.execution_time_ms}ms` : '-'}</TableCell>
                      <TableCell>{result.row_count !== undefined ? result.row_count : '-'}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => setQueries(result.query)}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 0 }}>
                        <Collapse in={expandedRows.has(index)} timeout="auto" unmountOnExit>
                          <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
                            {result.error_message && (
                              <Alert severity="error" sx={{ mb: 2 }}>
                                {result.error_message}
                              </Alert>
                            )}
                            {result.sample_rows && result.sample_rows.length > 0 && (
                              <Box>
                                <Typography variant="subtitle2" gutterBottom>
                                  Sample Data (first {result.sample_rows.length} rows):
                                </Typography>
                                <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow>
                                        {Object.keys(result.sample_rows[0]).map((col) => (
                                          <TableCell key={col}>{col}</TableCell>
                                        ))}
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {result.sample_rows.map((row, idx) => (
                                        <TableRow key={idx}>
                                          {Object.values(row).map((val: any, vidx) => (
                                            <TableCell key={vidx}>{String(val)}</TableCell>
                                          ))}
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </TableContainer>
                              </Box>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default QueryTesting;

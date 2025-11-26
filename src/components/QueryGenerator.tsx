import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Grid, Paper, TextField, Button, FormControl, InputLabel, Select, MenuItem, Alert, CircularProgress, Chip, Card, CardContent, List, ListItem, ListItemButton, ListItemText } from '@mui/material';
import { motion } from 'framer-motion';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { DatabricksService } from '../services/databricksService';

const QueryGenerator: React.FC = () => {
  const [catalogs, setCatalogs] = useState<string[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState('');
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchema, setSelectedSchema] = useState('');
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState<any[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('databricks-llama-4-maverick');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [businessLogic, setBusinessLogic] = useState('');
  const [generatedSql, setGeneratedSql] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      DatabricksService.listCatalogs().then(r => setCatalogs(r.catalogs || [])),
      DatabricksService.listModels().then(r => setAvailableModels(r.models || []))
    ]);
  }, []);

  useEffect(() => { if (selectedCatalog) DatabricksService.listSchemas(selectedCatalog).then(r => setSchemas(r.schemas || [])); }, [selectedCatalog]);
  useEffect(() => { if (selectedCatalog && selectedSchema) DatabricksService.listTables(selectedCatalog, selectedSchema).then(r => setTables(r.tables || [])); }, [selectedCatalog, selectedSchema]);
  useEffect(() => {
    if (selectedCatalog && selectedSchema && selectedTable) {
      DatabricksService.listColumns(selectedCatalog, selectedSchema, selectedTable).then(r => setColumns(r.columns || []));
    }
  }, [selectedCatalog, selectedSchema, selectedTable]);

  const handleGetSuggestions = async () => {
    if (!selectedTable || selectedColumns.length === 0) return;
    setIsLoading(true);
    try {
      const result = await DatabricksService.suggestBusinessLogic({ catalog: selectedCatalog, schema_name: selectedSchema, table: selectedTable, columns: selectedColumns, model_id: selectedModel });
      setSuggestions(result.suggestions || []);
    } catch (e) { setError('Failed to get suggestions'); }
    setIsLoading(false);
  };

  const handleGenerate = async () => {
    if (!businessLogic || selectedColumns.length === 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await DatabricksService.generateSql({ tables: [{ catalog: selectedCatalog, schema_name: selectedSchema, table: selectedTable, columns: selectedColumns }], business_logic: businessLogic, model_id: selectedModel });
      if (result.success) {
        setGeneratedSql(result.generated_sql);
        setMetrics({ model_used: result.model_used, total_tokens: result.total_tokens, estimated_cost: result.estimated_cost, execution_time_ms: result.execution_time_ms });
      } else setError(result.error || 'Generation failed');
    } catch (e) { setError('Failed to generate SQL'); }
    setIsLoading(false);
  };

  const handleExecute = async () => {
    if (!generatedSql) return;
    try {
      const result = await DatabricksService.executeSql({ sql: generatedSql });
      if (result.success) alert(`Success! Rows: ${result.rowCount}`);
      else alert(`Error: ${result.error}`);
    } catch (e) { alert('Execution failed'); }
  };

  return (
    <Container maxWidth="lg">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" gutterBottom>AI Query Generator</Typography>
          <Typography variant="body1" color="textSecondary">Generate SQL queries from natural language using AI</Typography>
        </Box>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Catalog</InputLabel>
                  <Select value={selectedCatalog} label="Catalog" onChange={(e) => setSelectedCatalog(e.target.value)}>
                    {catalogs.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Schema</InputLabel>
                  <Select value={selectedSchema} label="Schema" onChange={(e) => setSelectedSchema(e.target.value)} disabled={!selectedCatalog}>
                    {schemas.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Table</InputLabel>
                  <Select value={selectedTable} label="Table" onChange={(e) => setSelectedTable(e.target.value)} disabled={!selectedSchema}>
                    {tables.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>AI Model</InputLabel>
                  <Select value={selectedModel} label="AI Model" onChange={(e) => setSelectedModel(e.target.value)}>
                    {availableModels.map(m => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            {columns.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>Columns (click to select):</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {columns.map(col => (
                    <Chip
                      key={col.name}
                      label={`${col.name} (${col.type})`}
                      onClick={() => setSelectedColumns(prev => prev.includes(col.name) ? prev.filter(c => c !== col.name) : [...prev, col.name])}
                      color={selectedColumns.includes(col.name) ? 'primary' : 'default'}
                      size="small"
                    />
                  ))}
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Business Logic</Typography>
                <Button size="small" onClick={handleGetSuggestions} disabled={isLoading || selectedColumns.length === 0} startIcon={<AutoFixHighIcon />}>Get AI Suggestions</Button>
              </Box>
              {suggestions.length > 0 && (
                <Paper sx={{ p: 1, mb: 2, backgroundColor: '#f0f7ff' }}>
                  <Typography variant="caption" color="textSecondary">AI Suggestions (click to use):</Typography>
                  <List dense>
                    {suggestions.map((s, i) => (
                      <ListItem key={i} disablePadding>
                        <ListItemButton onClick={() => setBusinessLogic(s)}>
                          <ListItemText primary={s} primaryTypographyProps={{ variant: 'body2' }} />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              )}
              <TextField fullWidth multiline rows={8} value={businessLogic} onChange={(e) => setBusinessLogic(e.target.value)} placeholder="Describe what you want to query..." variant="outlined" />
              <Button variant="contained" onClick={handleGenerate} disabled={isLoading || !businessLogic} startIcon={isLoading ? <CircularProgress size={20} /> : <AutoFixHighIcon />} fullWidth sx={{ mt: 2 }}>
                {isLoading ? 'Generating...' : 'Generate SQL'}
              </Button>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Generated SQL</Typography>
              <TextField fullWidth multiline rows={8} value={generatedSql} variant="outlined" InputProps={{ readOnly: true }} sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace', backgroundColor: '#f5f5f5' } }} />
              <Button variant="contained" color="secondary" onClick={handleExecute} disabled={!generatedSql} startIcon={<PlayArrowIcon />} fullWidth sx={{ mt: 2 }}>Execute in Databricks SQL</Button>
              {metrics && (
                <Box sx={{ mt: 2, p: 1, backgroundColor: '#f0f4ff', borderRadius: 1 }}>
                  <Grid container spacing={1}>
                    <Grid item xs={6}><Typography variant="caption">Model: {availableModels.find(m => m.id === metrics.model_used)?.name}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption">Tokens: {metrics.total_tokens}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption">Cost: ${metrics.estimated_cost?.toFixed(6)}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption">Time: {metrics.execution_time_ms}ms</Typography></Grid>
                  </Grid>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
        {error && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      </motion.div>
    </Container>
  );
};

export default QueryGenerator;

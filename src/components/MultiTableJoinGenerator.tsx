import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Box, Grid, Paper, TextField, Button, FormControl, InputLabel, Select, MenuItem,
  Alert, CircularProgress, Chip, Card, CardContent, List, ListItem, ListItemButton, ListItemText,
  IconButton, Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import { motion } from 'framer-motion';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import JoinInnerIcon from '@mui/icons-material/JoinInner';
import { DatabricksService } from '../services/databricksService';

interface TableSelection {
  id: string;
  catalog: string;
  schema: string;
  table: string;
  columns: any[];
  selectedColumns: string[];
}

const MultiTableJoinGenerator: React.FC = () => {
  const [catalogs, setCatalogs] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState('databricks-llama-4-maverick');
  const [tables, setTables] = useState<TableSelection[]>([
    { id: '1', catalog: '', schema: '', table: '', columns: [], selectedColumns: [] },
    { id: '2', catalog: '', schema: '', table: '', columns: [], selectedColumns: [] }
  ]);
  const [schemasMap, setSchemasMap] = useState<Record<string, string[]>>({});
  const [tablesMap, setTablesMap] = useState<Record<string, string[]>>({});
  const [businessLogic, setBusinessLogic] = useState('');
  const [joinConditions, setJoinConditions] = useState('');
  const [joinSuggestions, setJoinSuggestions] = useState<string[]>([]);
  const [generatedSql, setGeneratedSql] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      DatabricksService.listCatalogs().then(r => setCatalogs(r.catalogs || [])),
      DatabricksService.listModels().then(r => setAvailableModels(r.models || []))
    ]).catch(err => {
      console.error('Error loading initial data:', err);
      setError('Failed to load catalogs. Please check your connection.');
    });
  }, []);

  const loadSchemas = async (catalog: string) => {
    if (!catalog || schemasMap[catalog]) return;
    try {
      const result = await DatabricksService.listSchemas(catalog);
      setSchemasMap(prev => ({ ...prev, [catalog]: result.schemas || [] }));
    } catch (err) {
      console.error('Error loading schemas:', err);
    }
  };

  const loadTables = async (catalog: string, schema: string) => {
    const key = `${catalog}.${schema}`;
    if (!catalog || !schema || tablesMap[key]) return;
    try {
      const result = await DatabricksService.listTables(catalog, schema);
      setTablesMap(prev => ({ ...prev, [key]: result.tables || [] }));
    } catch (err) {
      console.error('Error loading tables:', err);
    }
  };

  const loadColumns = async (tableIndex: number, catalog: string, schema: string, tableName: string) => {
    if (!catalog || !schema || !tableName) return;
    try {
      const result = await DatabricksService.listColumns(catalog, schema, tableName);
      setTables(prev => prev.map((t, i) =>
        i === tableIndex ? { ...t, columns: result.columns || [], selectedColumns: [] } : t
      ));
    } catch (err) {
      console.error('Error loading columns:', err);
    }
  };

  const updateTable = (index: number, field: keyof TableSelection, value: any) => {
    setTables(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      // Clear dependent fields when parent changes
      if (field === 'catalog') {
        updated[index].schema = '';
        updated[index].table = '';
        updated[index].columns = [];
        updated[index].selectedColumns = [];
        loadSchemas(value);
      } else if (field === 'schema') {
        updated[index].table = '';
        updated[index].columns = [];
        updated[index].selectedColumns = [];
        loadTables(updated[index].catalog, value);
      } else if (field === 'table') {
        updated[index].columns = [];
        updated[index].selectedColumns = [];
        loadColumns(index, updated[index].catalog, updated[index].schema, value);
      }

      return updated;
    });
  };

  const toggleColumn = (tableIndex: number, columnName: string) => {
    setTables(prev => prev.map((t, i) =>
      i === tableIndex ? {
        ...t,
        selectedColumns: t.selectedColumns.includes(columnName)
          ? t.selectedColumns.filter(c => c !== columnName)
          : [...t.selectedColumns, columnName]
      } : t
    ));
  };

  const addTable = () => {
    setTables(prev => [
      ...prev,
      { id: String(Date.now()), catalog: '', schema: '', table: '', columns: [], selectedColumns: [] }
    ]);
  };

  const removeTable = (index: number) => {
    if (tables.length <= 2) return;
    setTables(prev => prev.filter((_, i) => i !== index));
  };

  const handleSuggestJoins = async () => {
    const validTables = tables.filter(t => t.table && t.selectedColumns.length > 0);
    if (validTables.length < 2) {
      setError('Please select at least 2 tables with columns');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await DatabricksService.suggestJoinConditions({
        tables: validTables.map(t => ({
          catalog: t.catalog,
          schema_name: t.schema,
          table: t.table,
          columns: t.selectedColumns
        })),
        model_id: selectedModel
      });
      setJoinSuggestions(result.suggestions || []);
      if (result.error) setError(result.error);
    } catch (e) {
      setError('Failed to get join suggestions');
    }
    setIsLoading(false);
  };

  const handleGenerate = async () => {
    const validTables = tables.filter(t => t.table && t.selectedColumns.length > 0);
    if (validTables.length < 2 || !businessLogic) {
      setError('Please select at least 2 tables and enter business logic');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await DatabricksService.generateSql({
        tables: validTables.map(t => ({
          catalog: t.catalog,
          schema_name: t.schema,
          table: t.table,
          columns: t.selectedColumns
        })),
        business_logic: businessLogic,
        model_id: selectedModel,
        join_conditions: joinConditions || undefined
      });

      if (result.success) {
        setGeneratedSql(result.generated_sql);
        setMetrics({
          model_used: result.model_used,
          total_tokens: result.total_tokens,
          estimated_cost: result.estimated_cost,
          execution_time_ms: result.execution_time_ms
        });
      } else {
        setError(result.error || 'Generation failed');
      }
    } catch (e) {
      setError('Failed to generate SQL');
    }
    setIsLoading(false);
  };

  const handleExecute = async () => {
    if (!generatedSql) return;
    try {
      const result = await DatabricksService.executeSql({ sql: generatedSql });
      if (result.success) {
        alert(`Query executed successfully! Rows returned: ${result.rowCount}`);
      } else {
        alert(`Execution error: ${result.error}`);
      }
    } catch (e) {
      alert('Execution failed');
    }
  };

  return (
    <Container maxWidth="xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <JoinInnerIcon /> Multi-Table Join Generator
          </Typography>
          <Typography variant="body1" color="textSecondary">
            Generate complex SQL queries with JOINs across multiple tables using AI
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

        {/* AI Model Selection */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <FormControl fullWidth size="small">
              <InputLabel>AI Model</InputLabel>
              <Select value={selectedModel} label="AI Model" onChange={(e) => setSelectedModel(e.target.value)}>
                {availableModels.map(m => <MenuItem key={m.id} value={m.id}>{m.name} - {m.description}</MenuItem>)}
              </Select>
            </FormControl>
          </CardContent>
        </Card>

        {/* Table Selections */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Select Tables</Typography>
              <Button startIcon={<AddIcon />} onClick={addTable} variant="outlined" size="small">
                Add Table
              </Button>
            </Box>

            {tables.map((tableSelection, index) => (
              <Accordion key={tableSelection.id} defaultExpanded={index < 2}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                    <Typography variant="subtitle1">
                      Table {index + 1}: {tableSelection.table
                        ? `${tableSelection.catalog}.${tableSelection.schema}.${tableSelection.table}`
                        : '(not selected)'}
                    </Typography>
                    {tableSelection.selectedColumns.length > 0 && (
                      <Chip label={`${tableSelection.selectedColumns.length} columns`} size="small" color="primary" />
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Catalog</InputLabel>
                        <Select
                          value={tableSelection.catalog}
                          label="Catalog"
                          onChange={(e) => updateTable(index, 'catalog', e.target.value)}
                        >
                          {catalogs.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Schema</InputLabel>
                        <Select
                          value={tableSelection.schema}
                          label="Schema"
                          onChange={(e) => updateTable(index, 'schema', e.target.value)}
                          disabled={!tableSelection.catalog}
                        >
                          {(schemasMap[tableSelection.catalog] || []).map(s =>
                            <MenuItem key={s} value={s}>{s}</MenuItem>
                          )}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Table</InputLabel>
                        <Select
                          value={tableSelection.table}
                          label="Table"
                          onChange={(e) => updateTable(index, 'table', e.target.value)}
                          disabled={!tableSelection.schema}
                        >
                          {(tablesMap[`${tableSelection.catalog}.${tableSelection.schema}`] || []).map(t =>
                            <MenuItem key={t} value={t}>{t}</MenuItem>
                          )}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      {tables.length > 2 && (
                        <IconButton color="error" onClick={() => removeTable(index)}>
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </Grid>
                  </Grid>

                  {tableSelection.columns.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Select Columns (click to toggle):
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {tableSelection.columns.map(col => (
                          <Chip
                            key={col.name}
                            label={`${col.name} (${col.type})`}
                            onClick={() => toggleColumn(index, col.name)}
                            color={tableSelection.selectedColumns.includes(col.name) ? 'primary' : 'default'}
                            size="small"
                          />
                        ))}
                      </Box>
                    </Box>
                  )}
                </AccordionDetails>
              </Accordion>
            ))}
          </CardContent>
        </Card>

        {/* Join Conditions */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">JOIN Conditions</Typography>
              <Button
                startIcon={isLoading ? <CircularProgress size={20} /> : <AutoFixHighIcon />}
                onClick={handleSuggestJoins}
                disabled={isLoading || tables.filter(t => t.selectedColumns.length > 0).length < 2}
                variant="outlined"
                size="small"
              >
                AI Suggest JOINs
              </Button>
            </Box>

            {joinSuggestions.length > 0 && (
              <Paper sx={{ p: 1, mb: 2, backgroundColor: '#f0f7ff' }}>
                <Typography variant="caption" color="textSecondary">AI Suggested JOINs (click to use):</Typography>
                <List dense>
                  {joinSuggestions.map((s, i) => (
                    <ListItem key={i} disablePadding>
                      <ListItemButton onClick={() => setJoinConditions(prev => prev ? `${prev}\n${s}` : s)}>
                        <ListItemText primary={s} primaryTypographyProps={{ variant: 'body2', fontFamily: 'monospace' }} />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </Paper>
            )}

            <TextField
              fullWidth
              multiline
              rows={3}
              value={joinConditions}
              onChange={(e) => setJoinConditions(e.target.value)}
              placeholder="e.g., orders.customer_id = customers.id AND orders.product_id = products.id"
              variant="outlined"
              helperText="Specify JOIN conditions or let AI suggest them"
            />
          </CardContent>
        </Card>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" gutterBottom>Business Logic</Typography>
              <TextField
                fullWidth
                multiline
                rows={8}
                value={businessLogic}
                onChange={(e) => setBusinessLogic(e.target.value)}
                placeholder="Describe what you want to query across these tables...&#10;&#10;Example: Show total sales by customer with their contact info, ordered by highest sales first"
                variant="outlined"
              />
              <Button
                variant="contained"
                onClick={handleGenerate}
                disabled={isLoading || !businessLogic || tables.filter(t => t.selectedColumns.length > 0).length < 2}
                startIcon={isLoading ? <CircularProgress size={20} /> : <AutoFixHighIcon />}
                fullWidth
                sx={{ mt: 2 }}
              >
                {isLoading ? 'Generating...' : 'Generate SQL with JOINs'}
              </Button>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" gutterBottom>Generated SQL</Typography>
              <TextField
                fullWidth
                multiline
                rows={8}
                value={generatedSql}
                variant="outlined"
                InputProps={{ readOnly: true }}
                sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace', backgroundColor: '#f5f5f5' } }}
              />
              <Button
                variant="contained"
                color="secondary"
                onClick={handleExecute}
                disabled={!generatedSql}
                startIcon={<PlayArrowIcon />}
                fullWidth
                sx={{ mt: 2 }}
              >
                Execute in Databricks SQL
              </Button>

              {metrics && (
                <Box sx={{ mt: 2, p: 1, backgroundColor: '#f0f4ff', borderRadius: 1 }}>
                  <Grid container spacing={1}>
                    <Grid item xs={6}>
                      <Typography variant="caption">Model: {availableModels.find(m => m.id === metrics.model_used)?.name}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption">Tokens: {metrics.total_tokens}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption">Cost: ${metrics.estimated_cost?.toFixed(6)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption">Time: {metrics.execution_time_ms}ms</Typography>
                    </Grid>
                  </Grid>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      </motion.div>
    </Container>
  );
};

export default MultiTableJoinGenerator;

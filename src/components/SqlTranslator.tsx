import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Container,
  Typography,
  Box,
  Grid,
  Paper,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Chip,
  Card,
  CardContent,
  Divider,
} from '@mui/material';
import TranslateIcon from '@mui/icons-material/Translate';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { sourceSystemOptions } from '../data/dataTypeMappings';
import { DatabricksService } from '../services/databricksService';

const SqlTranslator: React.FC = () => {
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedModel, setSelectedModel] = useState('databricks-llama-4-maverick');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [sourceSql, setSourceSql] = useState('');
  const [translatedSql, setTranslatedSql] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [translationMetrics, setTranslationMetrics] = useState<any>(null);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Load available models
  React.useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await DatabricksService.listModels();
        if (response.models) {
          setAvailableModels(response.models);
        }
      } catch (error) {
        console.error('Failed to load models:', error);
      }
    };
    loadModels();
  }, []);

  const handleTranslate = async () => {
    if (!selectedSource || !sourceSql.trim()) {
      setTranslationError('Please select a source system and enter SQL to translate');
      return;
    }

    setIsTranslating(true);
    setTranslationError(null);
    setTranslationMetrics(null);
    setExecutionResult(null);
    setExecutionError(null);

    try {
      const response = await DatabricksService.translateSql({
        sourceSystem: selectedSource,
        sourceSql: sourceSql,
        modelId: selectedModel,
      });

      if (response.success) {
        setTranslatedSql(response.translatedSql);
        setTranslationMetrics({
          modelUsed: response.modelUsed,
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens,
          totalTokens: response.totalTokens,
          estimatedCost: response.estimatedCost,
          executionTimeMs: response.executionTimeMs,
        });
      } else {
        setTranslationError(response.error || 'Translation failed');
      }
    } catch (error) {
      setTranslationError('Failed to translate SQL');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleExecute = async () => {
    if (!translatedSql.trim()) {
      setExecutionError('No SQL to execute. Please translate first.');
      return;
    }

    setIsExecuting(true);
    setExecutionError(null);
    setExecutionResult(null);

    try {
      const response = await DatabricksService.executeSql({
        sql: translatedSql,
      });

      if (response.success) {
        setExecutionResult(response);
      } else {
        setExecutionError(response.error || 'Execution failed');
      }
    } catch (error) {
      setExecutionError('Failed to execute SQL');
    } finally {
      setIsExecuting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Container maxWidth="lg">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" gutterBottom>
            SQL Translator
          </Typography>
          <Typography variant="body1" color="textSecondary">
            Translate SQL queries from source data warehouses to Databricks SQL using AI
          </Typography>
        </Box>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel id="source-select-label">Source Data Warehouse</InputLabel>
                  <Select
                    labelId="source-select-label"
                    value={selectedSource}
                    label="Source Data Warehouse"
                    onChange={(e) => setSelectedSource(e.target.value)}
                  >
                    {sourceSystemOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel id="model-select-label">AI Model</InputLabel>
                  <Select
                    labelId="model-select-label"
                    value={selectedModel}
                    label="AI Model"
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    {availableModels.map((model) => (
                      <MenuItem key={model.id} value={model.id}>
                        <Box>
                          <Typography variant="body1">{model.name}</Typography>
                          <Typography variant="caption" color="textSecondary">
                            {model.description}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Grid container spacing={3}>
          {/* Source SQL Input */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Source SQL</Typography>
                <Chip
                  label={selectedSource || 'Not Selected'}
                  color={selectedSource ? 'primary' : 'default'}
                  size="small"
                />
              </Box>
              <TextField
                fullWidth
                multiline
                rows={15}
                placeholder="Paste your source SQL query here..."
                value={sourceSql}
                onChange={(e) => setSourceSql(e.target.value)}
                variant="outlined"
                sx={{
                  '& .MuiInputBase-root': {
                    fontFamily: 'monospace',
                    fontSize: '0.9rem',
                  },
                }}
              />
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleTranslate}
                  disabled={isTranslating || !selectedSource || !sourceSql.trim()}
                  startIcon={isTranslating ? <CircularProgress size={20} /> : <TranslateIcon />}
                  fullWidth
                >
                  {isTranslating ? 'Translating...' : 'Translate to Databricks SQL'}
                </Button>
              </Box>
            </Paper>
          </Grid>

          {/* Translated SQL Output */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Databricks SQL</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Chip label="Target" color="secondary" size="small" />
                  {translatedSql && (
                    <Button
                      size="small"
                      onClick={() => copyToClipboard(translatedSql)}
                      startIcon={<ContentCopyIcon />}
                    >
                      Copy
                    </Button>
                  )}
                </Box>
              </Box>
              <TextField
                fullWidth
                multiline
                rows={15}
                placeholder="Translated SQL will appear here..."
                value={translatedSql}
                variant="outlined"
                InputProps={{
                  readOnly: true,
                }}
                sx={{
                  '& .MuiInputBase-root': {
                    fontFamily: 'monospace',
                    fontSize: '0.9rem',
                    backgroundColor: '#f5f5f5',
                  },
                }}
              />
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleExecute}
                  disabled={isExecuting || !translatedSql.trim()}
                  startIcon={isExecuting ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                  fullWidth
                >
                  {isExecuting ? 'Executing...' : 'Execute in Databricks SQL'}
                </Button>
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {/* Translation Error */}
        {translationError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Alert severity="error" sx={{ mt: 3 }} onClose={() => setTranslationError(null)}>
              {translationError}
            </Alert>
          </motion.div>
        )}

        {/* Translation Metrics */}
        {translationMetrics && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Paper sx={{ p: 3, mt: 3, backgroundColor: '#f0f4ff' }}>
              <Typography variant="h6" gutterBottom sx={{ color: '#1976d2' }}>
                Translation Metrics
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="body2" color="textSecondary">
                    Model Used
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {availableModels.find(m => m.id === translationMetrics.modelUsed)?.name || translationMetrics.modelUsed}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={2}>
                  <Typography variant="body2" color="textSecondary">
                    Total Tokens
                  </Typography>
                  <Typography variant="h6">{translationMetrics.totalTokens?.toLocaleString() || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={2}>
                  <Typography variant="body2" color="textSecondary">
                    Input Tokens
                  </Typography>
                  <Typography variant="body1">{translationMetrics.promptTokens?.toLocaleString() || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={2}>
                  <Typography variant="body2" color="textSecondary">
                    Output Tokens
                  </Typography>
                  <Typography variant="body1">{translationMetrics.completionTokens?.toLocaleString() || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={2}>
                  <Typography variant="body2" color="textSecondary">
                    Estimated Cost
                  </Typography>
                  <Typography variant="h6" sx={{ color: '#4CAF50' }}>
                    ${translationMetrics.estimatedCost?.toFixed(6) || '0.000000'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={1}>
                  <Typography variant="body2" color="textSecondary">
                    Time (ms)
                  </Typography>
                  <Typography variant="body1">{translationMetrics.executionTimeMs || 'N/A'}</Typography>
                </Grid>
              </Grid>
            </Paper>
          </motion.div>
        )}

        {/* Execution Result */}
        {executionResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Paper sx={{ p: 3, mt: 3, backgroundColor: '#e8f5e9' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <CheckCircleIcon sx={{ color: '#4CAF50', mr: 1 }} />
                <Typography variant="h6" color="success.main">
                  Execution Successful
                </Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <Typography variant="body2" color="textSecondary">
                    Rows Returned
                  </Typography>
                  <Typography variant="h6">{executionResult.rowCount || 0}</Typography>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Typography variant="body2" color="textSecondary">
                    Execution Time
                  </Typography>
                  <Typography variant="h6">{executionResult.executionTime || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Typography variant="body2" color="textSecondary">
                    Status
                  </Typography>
                  <Typography variant="h6" color="success.main">
                    SUCCESS
                  </Typography>
                </Grid>
              </Grid>
              {executionResult.result && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="textSecondary" gutterBottom>
                    Result Preview:
                  </Typography>
                  <Paper sx={{ p: 2, backgroundColor: 'white' }}>
                    <pre style={{ margin: 0, fontSize: '0.85rem', overflow: 'auto' }}>
                      {JSON.stringify(executionResult.result, null, 2)}
                    </pre>
                  </Paper>
                </Box>
              )}
            </Paper>
          </motion.div>
        )}

        {/* Execution Error */}
        {executionError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Alert
              severity="error"
              sx={{ mt: 3 }}
              onClose={() => setExecutionError(null)}
              icon={<ErrorIcon />}
            >
              {executionError}
            </Alert>
          </motion.div>
        )}
      </motion.div>
    </Container>
  );
};

export default SqlTranslator;

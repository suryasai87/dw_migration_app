import React, { useState, useEffect } from 'react';
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
  Switch,
  FormControlLabel,
} from '@mui/material';
import BuildIcon from '@mui/icons-material/Build';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import { sourceSystemOptions } from '../data/dataTypeMappings';
import { DatabricksService } from '../services/databricksService';
import { apiConfig } from '../config/apiConfig';

const DdlConverter: React.FC = () => {
  const [selectedSource, setSelectedSource] = useState('');
  const [sourceDdl, setSourceDdl] = useState('');
  const [convertedDdl, setConvertedDdl] = useState('');
  const [selectedCatalog, setSelectedCatalog] = useState(apiConfig.defaultCatalog);
  const [selectedSchema, setSelectedSchema] = useState(apiConfig.defaultSchema);
  const [catalogs, setCatalogs] = useState<string[]>([apiConfig.defaultCatalog]);
  const [schemas, setSchemas] = useState<string[]>([apiConfig.defaultSchema]);
  const [executeImmediately, setExecuteImmediately] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [executionSuccess, setExecutionSuccess] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    loadCatalogsAndSchemas();
  }, []);

  const loadCatalogsAndSchemas = async () => {
    try {
      const data = await DatabricksService.getCatalogsAndSchemas();
      setCatalogs(data.catalogs);
      if (data.catalogs.length > 0) {
        const firstCatalog = data.catalogs[0];
        setSelectedCatalog(firstCatalog);
        setSchemas(data.schemas[firstCatalog] || []);
        if (data.schemas[firstCatalog]?.length > 0) {
          setSelectedSchema(data.schemas[firstCatalog][0]);
        }
      }
    } catch (error) {
      console.error('Error loading catalogs and schemas:', error);
    }
  };

  const handleCatalogChange = (catalog: string) => {
    setSelectedCatalog(catalog);
    // In a real implementation, this would fetch schemas for the selected catalog
    setSchemas([apiConfig.defaultSchema]);
    setSelectedSchema(apiConfig.defaultSchema);
  };

  const handleConvert = async () => {
    if (!selectedSource || !sourceDdl.trim()) {
      setConversionError('Please select a source system and enter DDL to convert');
      return;
    }

    setIsConverting(true);
    setConversionError(null);
    setExecutionSuccess(false);
    setWarnings([]);

    try {
      const response = await DatabricksService.convertDdl({
        sourceSystem: selectedSource,
        sourceDdl: sourceDdl,
        targetCatalog: selectedCatalog,
        targetSchema: selectedSchema,
        executeImmediately: executeImmediately,
      });

      if (response.success) {
        setConvertedDdl(response.convertedDdl);
        if (response.executed) {
          setExecutionSuccess(true);
        }
        if (response.warnings && response.warnings.length > 0) {
          setWarnings(response.warnings);
        }
      } else {
        setConversionError(response.error || 'Conversion failed');
      }
    } catch (error) {
      setConversionError('Failed to convert DDL');
    } finally {
      setIsConverting(false);
    }
  };

  const handleExecute = async () => {
    if (!convertedDdl.trim()) {
      setConversionError('No DDL to execute. Please convert first.');
      return;
    }

    setIsExecuting(true);
    setConversionError(null);
    setExecutionSuccess(false);

    try {
      const response = await DatabricksService.executeSql({
        sql: convertedDdl,
        catalog: selectedCatalog,
        schema: selectedSchema,
      });

      if (response.success) {
        setExecutionSuccess(true);
      } else {
        setConversionError(response.error || 'Execution failed');
      }
    } catch (error) {
      setConversionError('Failed to execute DDL');
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
            DDL Converter
          </Typography>
          <Typography variant="body1" color="textSecondary">
            Convert DDL statements from source data warehouses to Databricks SQL Unity Catalog
          </Typography>
        </Box>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel id="source-select-label">Source System</InputLabel>
                  <Select
                    labelId="source-select-label"
                    value={selectedSource}
                    label="Source System"
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
              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel id="catalog-select-label">Unity Catalog</InputLabel>
                  <Select
                    labelId="catalog-select-label"
                    value={selectedCatalog}
                    label="Unity Catalog"
                    onChange={(e) => handleCatalogChange(e.target.value)}
                  >
                    {catalogs.map((catalog) => (
                      <MenuItem key={catalog} value={catalog}>
                        {catalog}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel id="schema-select-label">Schema</InputLabel>
                  <Select
                    labelId="schema-select-label"
                    value={selectedSchema}
                    label="Schema"
                    onChange={(e) => setSelectedSchema(e.target.value)}
                  >
                    {schemas.map((schema) => (
                      <MenuItem key={schema} value={schema}>
                        {schema}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={executeImmediately}
                        onChange={(e) => setExecuteImmediately(e.target.checked)}
                      />
                    }
                    label="Execute Immediately"
                  />
                </Box>
              </Grid>
            </Grid>
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label={`${selectedCatalog}.${selectedSchema}`} color="secondary" size="small" />
              <Typography variant="caption" color="textSecondary">
                DDL will be created in this location
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Grid container spacing={3}>
          {/* Source DDL Input */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Source DDL</Typography>
                <Chip
                  label={selectedSource || 'Not Selected'}
                  color={selectedSource ? 'primary' : 'default'}
                  size="small"
                />
              </Box>
              <TextField
                fullWidth
                multiline
                rows={18}
                placeholder="Paste your source DDL statement here...&#10;&#10;Example:&#10;CREATE TABLE employees (&#10;  id NUMBER(10),&#10;  name VARCHAR2(100),&#10;  hire_date DATE&#10;);"
                value={sourceDdl}
                onChange={(e) => setSourceDdl(e.target.value)}
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
                  onClick={handleConvert}
                  disabled={isConverting || !selectedSource || !sourceDdl.trim()}
                  startIcon={isConverting ? <CircularProgress size={20} /> : <BuildIcon />}
                  fullWidth
                >
                  {isConverting
                    ? 'Converting...'
                    : executeImmediately
                    ? 'Convert & Execute DDL'
                    : 'Convert DDL'}
                </Button>
              </Box>
            </Paper>
          </Grid>

          {/* Converted DDL Output */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Databricks SQL DDL</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Chip label="Unity Catalog" color="secondary" size="small" />
                  {convertedDdl && (
                    <Button
                      size="small"
                      onClick={() => copyToClipboard(convertedDdl)}
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
                rows={18}
                placeholder="Converted DDL will appear here..."
                value={convertedDdl}
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
                  disabled={isExecuting || !convertedDdl.trim() || executeImmediately}
                  startIcon={isExecuting ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                  fullWidth
                >
                  {isExecuting ? 'Executing...' : 'Execute DDL'}
                </Button>
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {/* Warnings */}
        {warnings.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Alert severity="warning" sx={{ mt: 3 }} icon={<WarningIcon />}>
              <Typography variant="subtitle2" gutterBottom>
                Conversion Warnings:
              </Typography>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {warnings.map((warning, index) => (
                  <li key={index}>
                    <Typography variant="body2">{warning}</Typography>
                  </li>
                ))}
              </ul>
            </Alert>
          </motion.div>
        )}

        {/* Conversion Error */}
        {conversionError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Alert severity="error" sx={{ mt: 3 }} onClose={() => setConversionError(null)}>
              {conversionError}
            </Alert>
          </motion.div>
        )}

        {/* Execution Success */}
        {executionSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Paper sx={{ p: 3, mt: 3, backgroundColor: '#e8f5e9' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <CheckCircleIcon sx={{ color: '#4CAF50', mr: 1 }} />
                <Typography variant="h6" color="success.main">
                  DDL Executed Successfully
                </Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="body2">
                The DDL has been successfully executed in Unity Catalog:
              </Typography>
              <Box sx={{ mt: 1 }}>
                <Chip
                  label={`${selectedCatalog}.${selectedSchema}`}
                  color="secondary"
                  sx={{ fontFamily: 'monospace' }}
                />
              </Box>
            </Paper>
          </motion.div>
        )}
      </motion.div>
    </Container>
  );
};

export default DdlConverter;

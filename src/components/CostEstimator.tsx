import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  MenuItem,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import CalculateIcon from '@mui/icons-material/Calculate';
import { DatabricksService } from '../services/databricksService';
import CostBreakdown from './CostBreakdown';
import CostComparison from './CostComparison';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`cost-tabpanel-${index}`}
      aria-labelledby={`cost-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const CostEstimator: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<any[]>([]);

  // Estimate form state
  const [numTables, setNumTables] = useState<number>(10);
  const [numViews, setNumViews] = useState<number>(5);
  const [numProcedures, setNumProcedures] = useState<number>(3);
  const [totalRows, setTotalRows] = useState<number>(1000000);
  const [dataSizeGb, setDataSizeGb] = useState<number>(50);
  const [modelId, setModelId] = useState<string>('databricks-llama-4-maverick');
  const [complexity, setComplexity] = useState<string>('medium');
  const [sourceType, setSourceType] = useState<string>('oracle');
  const [computeHoursMonthly, setComputeHoursMonthly] = useState<number>(100);
  const [storageMonths, setStorageMonths] = useState<number>(12);

  // Results state
  const [estimateResult, setEstimateResult] = useState<any>(null);
  const [comparisonResult, setComparisonResult] = useState<any>(null);

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const response = await DatabricksService.listModels();
      setModels(response.models || []);
      if (response.models && response.models.length > 0) {
        setModelId(response.models[0].id);
      }
    } catch (error) {
      console.error('Error loading models:', error);
    }
  };

  const handleEstimate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/estimate/migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          num_tables: numTables,
          num_views: numViews,
          num_procedures: numProcedures,
          total_rows: totalRows,
          data_size_gb: dataSizeGb,
          model_id: modelId,
          avg_sql_complexity: complexity,
          source_type: sourceType,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setEstimateResult(data);
      } else {
        setError(data.error || 'Failed to estimate costs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/estimate/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          migration_request: {
            num_tables: numTables,
            num_views: numViews,
            num_procedures: numProcedures,
            total_rows: totalRows,
            data_size_gb: dataSizeGb,
            model_id: modelId,
            avg_sql_complexity: complexity,
            source_type: sourceType,
          },
          storage_months: storageMonths,
          compute_hours_monthly: computeHoursMonthly,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setComparisonResult(data);
        setEstimateResult(data.base_estimate);
      } else {
        setError(data.error || 'Failed to compare costs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Migration Cost Estimator
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Estimate the total cost of migrating your data warehouse to Databricks, including LLM
        translation costs, compute, storage, and network transfer.
      </Typography>

      <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} sx={{ mb: 3 }}>
        <Tab label="Quick Estimate" />
        <Tab label="Detailed Comparison" />
      </Tabs>

      <TabPanel value={tabValue} index={0}>
        <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Migration Parameters
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Number of Tables"
                type="number"
                value={numTables}
                onChange={(e) => setNumTables(Number(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Number of Views"
                type="number"
                value={numViews}
                onChange={(e) => setNumViews(Number(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Number of Stored Procedures"
                type="number"
                value={numProcedures}
                onChange={(e) => setNumProcedures(Number(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Total Rows"
                type="number"
                value={totalRows}
                onChange={(e) => setTotalRows(Number(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Data Size (GB)"
                type="number"
                value={dataSizeGb}
                onChange={(e) => setDataSizeGb(Number(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Source System</InputLabel>
                <Select
                  value={sourceType}
                  label="Source System"
                  onChange={(e) => setSourceType(e.target.value)}
                >
                  <MenuItem value="oracle">Oracle</MenuItem>
                  <MenuItem value="snowflake">Snowflake</MenuItem>
                  <MenuItem value="sqlserver">SQL Server</MenuItem>
                  <MenuItem value="teradata">Teradata</MenuItem>
                  <MenuItem value="netezza">Netezza</MenuItem>
                  <MenuItem value="synapse">Synapse</MenuItem>
                  <MenuItem value="redshift">Redshift</MenuItem>
                  <MenuItem value="mysql">MySQL</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>LLM Model</InputLabel>
                <Select
                  value={modelId}
                  label="LLM Model"
                  onChange={(e) => setModelId(e.target.value)}
                >
                  {models.map((model) => (
                    <MenuItem key={model.id} value={model.id}>
                      {model.name} - ${model.pricing.input}/${model.pricing.output} per M
                      tokens
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>SQL Complexity</InputLabel>
                <Select
                  value={complexity}
                  label="SQL Complexity"
                  onChange={(e) => setComplexity(e.target.value)}
                >
                  <MenuItem value="low">Low - Simple queries</MenuItem>
                  <MenuItem value="medium">Medium - Moderate complexity</MenuItem>
                  <MenuItem value="high">High - Complex queries</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={20} /> : <CalculateIcon />}
              onClick={handleEstimate}
              disabled={loading}
              size="large"
            >
              {loading ? 'Calculating...' : 'Estimate Costs'}
            </Button>
          </Box>
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {estimateResult && estimateResult.breakdown && (
          <CostBreakdown
            breakdown={estimateResult.breakdown}
            details={estimateResult.details}
            estimatedDurationHours={estimateResult.estimated_duration_hours}
          />
        )}
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Comparison Parameters
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Number of Tables"
                type="number"
                value={numTables}
                onChange={(e) => setNumTables(Number(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Number of Views"
                type="number"
                value={numViews}
                onChange={(e) => setNumViews(Number(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Number of Stored Procedures"
                type="number"
                value={numProcedures}
                onChange={(e) => setNumProcedures(Number(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Data Size (GB)"
                type="number"
                value={dataSizeGb}
                onChange={(e) => setDataSizeGb(Number(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Monthly Compute Hours"
                type="number"
                value={computeHoursMonthly}
                onChange={(e) => setComputeHoursMonthly(Number(e.target.value))}
                helperText="Estimated SQL Warehouse usage per month"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Source System</InputLabel>
                <Select
                  value={sourceType}
                  label="Source System"
                  onChange={(e) => setSourceType(e.target.value)}
                >
                  <MenuItem value="oracle">Oracle</MenuItem>
                  <MenuItem value="snowflake">Snowflake</MenuItem>
                  <MenuItem value="sqlserver">SQL Server</MenuItem>
                  <MenuItem value="teradata">Teradata</MenuItem>
                  <MenuItem value="netezza">Netezza</MenuItem>
                  <MenuItem value="synapse">Synapse</MenuItem>
                  <MenuItem value="redshift">Redshift</MenuItem>
                  <MenuItem value="mysql">MySQL</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>SQL Complexity</InputLabel>
                <Select
                  value={complexity}
                  label="SQL Complexity"
                  onChange={(e) => setComplexity(e.target.value)}
                >
                  <MenuItem value="low">Low - Simple queries</MenuItem>
                  <MenuItem value="medium">Medium - Moderate complexity</MenuItem>
                  <MenuItem value="high">High - Complex queries</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <Box sx={{ mt: 3 }}>
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={20} /> : <CalculateIcon />}
              onClick={handleCompare}
              disabled={loading}
              size="large"
            >
              {loading ? 'Analyzing...' : 'Compare Costs'}
            </Button>
          </Box>
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {comparisonResult && <CostComparison comparisonData={comparisonResult} />}
      </TabPanel>
    </Box>
  );
};

export default CostEstimator;

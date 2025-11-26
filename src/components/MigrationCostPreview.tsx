import React, { useEffect, useState } from 'react';
import {
  Paper,
  Typography,
  Grid,
  Box,
  Chip,
  CircularProgress,
  Alert,
  Button,
} from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import InfoIcon from '@mui/icons-material/Info';
import { DatabricksService } from '../services/databricksService';

interface MigrationCostPreviewProps {
  numTables: number;
  numViews: number;
  numProcedures: number;
  dataSizeGb: number;
  sourceType: string;
  modelId?: string;
  complexity?: string;
}

const MigrationCostPreview: React.FC<MigrationCostPreviewProps> = ({
  numTables,
  numViews,
  numProcedures,
  dataSizeGb,
  sourceType,
  modelId = 'databricks-llama-4-maverick',
  complexity = 'medium',
}) => {
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (numTables > 0 || numViews > 0 || numProcedures > 0) {
      fetchEstimate();
    }
  }, [numTables, numViews, numProcedures, dataSizeGb, sourceType, modelId, complexity]);

  const fetchEstimate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await DatabricksService.estimateMigrationCost({
        num_tables: numTables,
        num_views: numViews,
        num_procedures: numProcedures,
        total_rows: 0,
        data_size_gb: dataSizeGb,
        model_id: modelId,
        avg_sql_complexity: complexity,
        source_type: sourceType,
      });

      if (result.success) {
        setEstimate(result);
      } else {
        setError(result.error || 'Failed to estimate costs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Paper elevation={2} sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress size={30} />
        <Typography variant="body2" sx={{ mt: 2 }}>
          Calculating migration costs...
        </Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        Could not estimate costs: {error}
      </Alert>
    );
  }

  if (!estimate || !estimate.breakdown) {
    return null;
  }

  const { breakdown, estimated_duration_hours } = estimate;
  const totalObjects = numTables + numViews + numProcedures;

  return (
    <Paper elevation={3} sx={{ p: 3, backgroundColor: '#f9f9f9' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <AttachMoneyIcon color="primary" sx={{ mr: 1 }} />
        <Typography variant="h6">Estimated Migration Cost</Typography>
      </Box>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={6}>
          <Chip
            icon={<AttachMoneyIcon />}
            label={`Total: $${breakdown.total.toFixed(2)}`}
            color="primary"
            sx={{ fontSize: '1rem', py: 2.5, px: 2, width: '100%' }}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <Chip
            label={`Duration: ~${estimated_duration_hours.toFixed(1)} hours`}
            sx={{ fontSize: '0.9rem', py: 2.5, px: 2, width: '100%' }}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <Box sx={{ textAlign: 'center', p: 1, borderRadius: 1, bgcolor: 'white' }}>
            <Typography variant="caption" color="text.secondary">
              LLM Translation
            </Typography>
            <Typography variant="body1" fontWeight="bold" color="primary">
              ${breakdown.llm_translation.toFixed(2)}
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={6} md={3}>
          <Box sx={{ textAlign: 'center', p: 1, borderRadius: 1, bgcolor: 'white' }}>
            <Typography variant="caption" color="text.secondary">
              Compute
            </Typography>
            <Typography variant="body1" fontWeight="bold" color="primary">
              ${breakdown.compute_migration.toFixed(2)}
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={6} md={3}>
          <Box sx={{ textAlign: 'center', p: 1, borderRadius: 1, bgcolor: 'white' }}>
            <Typography variant="caption" color="text.secondary">
              Storage (Annual)
            </Typography>
            <Typography variant="body1" fontWeight="bold" color="primary">
              ${breakdown.storage_annual.toFixed(2)}
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={6} md={3}>
          <Box sx={{ textAlign: 'center', p: 1, borderRadius: 1, bgcolor: 'white' }}>
            <Typography variant="caption" color="text.secondary">
              Network Transfer
            </Typography>
            <Typography variant="body1" fontWeight="bold" color="primary">
              ${breakdown.network_transfer.toFixed(2)}
            </Typography>
          </Box>
        </Grid>
      </Grid>

      <Alert severity="info" icon={<InfoIcon />} sx={{ mt: 2 }}>
        Estimated cost for migrating {totalObjects} objects ({numTables} tables, {numViews}{' '}
        views, {numProcedures} procedures) with {dataSizeGb} GB of data.
      </Alert>

      <Box sx={{ mt: 2, textAlign: 'right' }}>
        <Button size="small" onClick={fetchEstimate}>
          Refresh Estimate
        </Button>
      </Box>
    </Paper>
  );
};

export default MigrationCostPreview;

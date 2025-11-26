import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import CostChart from './CostChart';

interface CostComparisonProps {
  comparisonData: {
    monthly_costs: {
      storage: number;
      compute: number;
      total: number;
    };
    yearly_costs: {
      year_1: number;
      year_2_onwards: number;
    };
    model_comparisons: Array<{
      model_name: string;
      model_id: string;
      llm_cost: number;
      total_migration_cost: number;
    }>;
    cost_breakdown_3_years: {
      migration_one_time: number;
      storage_3_years: number;
      compute_3_years: number;
      total_3_years: number;
    };
  };
}

const CostComparison: React.FC<CostComparisonProps> = ({ comparisonData }) => {
  const { monthly_costs, yearly_costs, model_comparisons, cost_breakdown_3_years } =
    comparisonData;

  // Prepare data for yearly costs chart
  const yearlyChartData = [
    { name: 'Year 1', value: yearly_costs.year_1 },
    { name: 'Year 2', value: yearly_costs.year_2_onwards },
    { name: 'Year 3', value: yearly_costs.year_2_onwards },
  ];

  // Prepare data for 3-year breakdown pie chart
  const threeYearBreakdown = [
    { name: 'Migration (One-time)', value: cost_breakdown_3_years.migration_one_time },
    { name: 'Storage (3 Years)', value: cost_breakdown_3_years.storage_3_years },
    { name: 'Compute (3 Years)', value: cost_breakdown_3_years.compute_3_years },
  ];

  // Get cheapest and most expensive models
  const cheapestModel = model_comparisons[0];
  const mostExpensiveModel = model_comparisons[model_comparisons.length - 1];
  const costDifference = mostExpensiveModel.llm_cost - cheapestModel.llm_cost;

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
        <CompareArrowsIcon sx={{ mr: 1 }} />
        Cost Comparison & Analysis
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        Compare different migration approaches and models to optimize your costs. Choose the
        model that best balances cost and translation quality for your needs.
      </Alert>

      {/* Monthly Costs */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Monthly Ongoing Costs
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Chip
              label={`Storage: $${monthly_costs.storage.toFixed(2)}/month`}
              color="primary"
              sx={{ width: '100%', py: 2 }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Chip
              label={`Compute: $${monthly_costs.compute.toFixed(2)}/month`}
              color="secondary"
              sx={{ width: '100%', py: 2 }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Chip
              label={`Total: $${monthly_costs.total.toFixed(2)}/month`}
              sx={{
                width: '100%',
                py: 2,
                backgroundColor: '#1A936F',
                color: 'white',
                fontWeight: 'bold',
              }}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Model Comparison */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          LLM Model Comparison
        </Typography>
        <Alert severity="success" sx={{ mb: 2 }}>
          Potential savings: ${costDifference.toFixed(2)} by choosing{' '}
          <strong>{cheapestModel.model_name}</strong> over{' '}
          <strong>{mostExpensiveModel.model_name}</strong>
        </Alert>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <strong>Model</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>LLM Cost</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>Total Migration Cost</strong>
                </TableCell>
                <TableCell align="center">
                  <strong>Recommendation</strong>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {model_comparisons.map((model, index) => (
                <TableRow key={index} hover>
                  <TableCell>{model.model_name}</TableCell>
                  <TableCell align="right">${model.llm_cost.toFixed(2)}</TableCell>
                  <TableCell align="right">
                    ${model.total_migration_cost.toFixed(2)}
                  </TableCell>
                  <TableCell align="center">
                    {index === 0 && (
                      <Chip label="Most Cost-Effective" color="success" size="small" />
                    )}
                    {index === Math.floor(model_comparisons.length / 2) && (
                      <Chip label="Balanced" color="primary" size="small" />
                    )}
                    {index === model_comparisons.length - 1 && (
                      <Chip label="Premium" color="warning" size="small" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Yearly Costs Chart */}
      <CostChart
        type="bar"
        data={yearlyChartData}
        title="Yearly Cost Projection"
        dataKey="value"
        nameKey="name"
      />

      {/* 3-Year Cost Breakdown */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <CostChart
            type="pie"
            data={threeYearBreakdown}
            title="3-Year Cost Breakdown"
            dataKey="value"
            nameKey="name"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <TrendingUpIcon sx={{ mr: 1 }} />
              3-Year Total Cost Analysis
            </Typography>
            <Box sx={{ mt: 3 }}>
              <Typography variant="h4" color="primary" gutterBottom>
                ${cost_breakdown_3_years.total_3_years.toFixed(2)}
              </Typography>
              <Typography variant="body1" color="text.secondary" paragraph>
                Total cost over 3 years including migration and ongoing operations
              </Typography>
              <Grid container spacing={2} sx={{ mt: 2 }}>
                <Grid item xs={12}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #eee',
                      pb: 1,
                      mb: 1,
                    }}
                  >
                    <Typography variant="body2">One-time Migration:</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      ${cost_breakdown_3_years.migration_one_time.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #eee',
                      pb: 1,
                      mb: 1,
                    }}
                  >
                    <Typography variant="body2">Storage (36 months):</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      ${cost_breakdown_3_years.storage_3_years.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #eee',
                      pb: 1,
                    }}
                  >
                    <Typography variant="body2">Compute (36 months):</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      ${cost_breakdown_3_years.compute_3_years.toFixed(2)}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default CostComparison;

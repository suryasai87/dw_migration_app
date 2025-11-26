import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Chip,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import StorageIcon from '@mui/icons-material/Storage';
import CloudIcon from '@mui/icons-material/Cloud';
import TransformIcon from '@mui/icons-material/Transform';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';

interface CostBreakdownProps {
  breakdown: {
    llm_translation: number;
    compute_migration: number;
    storage_annual: number;
    network_transfer: number;
    total: number;
  };
  details?: any;
  estimatedDurationHours?: number;
}

const CostBreakdown: React.FC<CostBreakdownProps> = ({
  breakdown,
  details,
  estimatedDurationHours,
}) => {
  const costItems = [
    {
      label: 'LLM Translation',
      value: breakdown.llm_translation,
      icon: <TransformIcon />,
      color: '#FF6B35',
      description: 'AI model costs for SQL translation',
    },
    {
      label: 'Compute (Migration)',
      value: breakdown.compute_migration,
      icon: <CloudIcon />,
      color: '#004E89',
      description: 'SQL Warehouse costs during migration',
    },
    {
      label: 'Storage (Annual)',
      value: breakdown.storage_annual,
      icon: <StorageIcon />,
      color: '#1A936F',
      description: 'Delta Lake storage costs per year',
    },
    {
      label: 'Network Transfer',
      value: breakdown.network_transfer,
      icon: <NetworkCheckIcon />,
      color: '#F77F00',
      description: 'Data transfer costs',
    },
  ];

  return (
    <Paper elevation={3} sx={{ p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Cost Breakdown
        </Typography>
        <Chip
          icon={<AttachMoneyIcon />}
          label={`Total: $${breakdown.total.toFixed(2)}`}
          color="primary"
          sx={{ fontSize: '1.1rem', py: 2.5, px: 1 }}
        />
        {estimatedDurationHours && (
          <Chip
            label={`Duration: ${estimatedDurationHours.toFixed(2)} hours`}
            sx={{ ml: 2, fontSize: '0.9rem', py: 2, px: 1 }}
          />
        )}
      </Box>

      <Divider sx={{ my: 3 }} />

      <Grid container spacing={3}>
        {costItems.map((item, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Paper
              elevation={1}
              sx={{
                p: 2,
                textAlign: 'center',
                borderTop: `4px solid ${item.color}`,
              }}
            >
              <Box sx={{ color: item.color, mb: 1 }}>{item.icon}</Box>
              <Typography variant="h6" sx={{ color: item.color, fontWeight: 'bold' }}>
                ${item.value.toFixed(2)}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {item.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {item.description}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {details && (
        <>
          <Divider sx={{ my: 3 }} />
          <Typography variant="h6" gutterBottom>
            Estimation Details
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    <strong>Parameter</strong>
                  </TableCell>
                  <TableCell>
                    <strong>Value</strong>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {details.num_objects && (
                  <TableRow>
                    <TableCell>Total Objects</TableCell>
                    <TableCell>{details.num_objects}</TableCell>
                  </TableRow>
                )}
                {details.llm_model && (
                  <TableRow>
                    <TableCell>LLM Model</TableCell>
                    <TableCell>{details.llm_model}</TableCell>
                  </TableRow>
                )}
                {details.source_type && (
                  <TableRow>
                    <TableCell>Source System</TableCell>
                    <TableCell>{details.source_type.toUpperCase()}</TableCell>
                  </TableRow>
                )}
                {details.data_size_gb !== undefined && (
                  <TableRow>
                    <TableCell>Data Size</TableCell>
                    <TableCell>{details.data_size_gb} GB</TableCell>
                  </TableRow>
                )}
                {details.total_rows && (
                  <TableRow>
                    <TableCell>Total Rows</TableCell>
                    <TableCell>{details.total_rows.toLocaleString()}</TableCell>
                  </TableRow>
                )}
                {details.complexity && (
                  <TableRow>
                    <TableCell>SQL Complexity</TableCell>
                    <TableCell>{details.complexity.toUpperCase()}</TableCell>
                  </TableRow>
                )}
                {details.warehouse_size && (
                  <TableRow>
                    <TableCell>Warehouse Size</TableCell>
                    <TableCell>{details.warehouse_size}</TableCell>
                  </TableRow>
                )}
                {details.warehouse_dbus && (
                  <TableRow>
                    <TableCell>DBUs per Hour</TableCell>
                    <TableCell>{details.warehouse_dbus}</TableCell>
                  </TableRow>
                )}
                {details.token_estimate && (
                  <TableRow>
                    <TableCell>Estimated Tokens</TableCell>
                    <TableCell>
                      {details.token_estimate.total_tokens.toLocaleString()}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Paper>
  );
};

export default CostBreakdown;

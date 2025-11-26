import React, { useState, useEffect } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Typography,
  Box,
  IconButton,
  Collapse,
  Alert,
  CircularProgress,
  TextField,
  InputAdornment,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PendingIcon from '@mui/icons-material/Pending';
import CancelIcon from '@mui/icons-material/Cancel';
import SearchIcon from '@mui/icons-material/Search';
import { DatabricksService } from '../services/databricksService';

interface JobExecutionRowProps {
  execution: any;
}

const JobExecutionRow: React.FC<JobExecutionRowProps> = ({ execution }) => {
  const [open, setOpen] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'success';
      case 'running':
        return 'primary';
      case 'failed':
        return 'error';
      case 'pending':
        return 'warning';
      case 'cancelled':
        return 'default';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <CheckCircleIcon fontSize="small" />;
      case 'failed':
        return <ErrorIcon fontSize="small" />;
      case 'pending':
        return <PendingIcon fontSize="small" />;
      case 'cancelled':
        return <CancelIcon fontSize="small" />;
      default:
        return undefined;
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return 'N/A';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <>
      <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
        <TableCell>
          <IconButton size="small" onClick={() => setOpen(!open)}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell>{execution.job_name}</TableCell>
        <TableCell>
          <Chip
            label={execution.status}
            color={getStatusColor(execution.status)}
            size="small"
            icon={getStatusIcon(execution.status)}
          />
        </TableCell>
        <TableCell>{formatDateTime(execution.started_at)}</TableCell>
        <TableCell>{formatDuration(execution.duration_seconds)}</TableCell>
        <TableCell align="center">
          {execution.objects_migrated !== null ? execution.objects_migrated : '-'}
        </TableCell>
        <TableCell align="center">
          {execution.objects_failed !== null ? execution.objects_failed : '-'}
        </TableCell>
        <TableCell>
          <Chip label={execution.triggered_by} size="small" variant="outlined" />
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 2 }}>
              <Typography variant="h6" gutterBottom component="div">
                Execution Details
              </Typography>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell component="th" scope="row">
                      <strong>Execution ID:</strong>
                    </TableCell>
                    <TableCell>{execution.execution_id}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell component="th" scope="row">
                      <strong>Job ID:</strong>
                    </TableCell>
                    <TableCell>{execution.job_id}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell component="th" scope="row">
                      <strong>Started At:</strong>
                    </TableCell>
                    <TableCell>{formatDateTime(execution.started_at)}</TableCell>
                  </TableRow>
                  {execution.completed_at && (
                    <TableRow>
                      <TableCell component="th" scope="row">
                        <strong>Completed At:</strong>
                      </TableCell>
                      <TableCell>{formatDateTime(execution.completed_at)}</TableCell>
                    </TableRow>
                  )}
                  {execution.error_message && (
                    <TableRow>
                      <TableCell component="th" scope="row">
                        <strong>Error Message:</strong>
                      </TableCell>
                      <TableCell>
                        <Alert severity="error" sx={{ mt: 1 }}>
                          {execution.error_message}
                        </Alert>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const JobHistory: React.FC = () => {
  const [executions, setExecutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await DatabricksService.getJobHistory();
      if (response.success) {
        setExecutions(response.executions);
      } else {
        setError('Failed to load job history');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job history');
    } finally {
      setLoading(false);
    }
  };

  const filteredExecutions = executions.filter((execution) =>
    execution.job_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    execution.execution_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    execution.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Paper elevation={2}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Job Execution History</Typography>
          <TextField
            size="small"
            placeholder="Search executions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ width: 300 }}
          />
        </Box>
      </Box>

      {filteredExecutions.length === 0 ? (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            {searchTerm ? 'No executions match your search' : 'No job executions yet'}
          </Typography>
        </Box>
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>
                  <strong>Job Name</strong>
                </TableCell>
                <TableCell>
                  <strong>Status</strong>
                </TableCell>
                <TableCell>
                  <strong>Started At</strong>
                </TableCell>
                <TableCell>
                  <strong>Duration</strong>
                </TableCell>
                <TableCell align="center">
                  <strong>Migrated</strong>
                </TableCell>
                <TableCell align="center">
                  <strong>Failed</strong>
                </TableCell>
                <TableCell>
                  <strong>Triggered By</strong>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredExecutions.map((execution) => (
                <JobExecutionRow key={execution.execution_id} execution={execution} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
};

export default JobHistory;

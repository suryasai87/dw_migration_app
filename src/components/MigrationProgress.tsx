import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, LinearProgress, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Alert, IconButton, Button,
  Card, CardContent, Grid, Collapse, List, ListItem, ListItemText, Divider
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import CancelIcon from '@mui/icons-material/Cancel';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import { DatabricksService } from '../services/databricksService';

interface MigrationProgressProps {
  jobId: string;
  onComplete?: (success: boolean) => void;
  onCancel?: () => void;
}

interface MigrationJob {
  job_id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progress_percentage: number;
  total_objects: number;
  completed_objects: number;
  failed_objects: number;
  current_object: string | null;
  estimated_time_remaining: number | null;
  start_time: string;
  end_time: string | null;
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
}

interface ObjectResult {
  object_name: string;
  object_type: string;
  status: 'success' | 'error' | 'skipped';
  error?: string;
  execution_time_ms?: number;
  timestamp: string;
}

const MigrationProgress: React.FC<MigrationProgressProps> = ({ jobId, onComplete, onCancel }) => {
  const [job, setJob] = useState<MigrationJob | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [results, setResults] = useState<ObjectResult[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const scrollToBottomLogs = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottomLogs();
  }, [logs]);

  useEffect(() => {
    if (!jobId) return;

    // Start SSE connection for real-time updates
    const startStreaming = () => {
      setIsStreaming(true);
      const eventSource = new EventSource(`/api/migrate/stream/${jobId}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.error) {
            setError(data.error);
            eventSource.close();
            setIsStreaming(false);
            return;
          }

          // Update job state
          setJob({
            job_id: data.job_id,
            status: data.status,
            progress_percentage: data.progress_percentage,
            total_objects: data.total_objects,
            completed_objects: data.completed_objects,
            failed_objects: data.failed_objects,
            current_object: data.current_object,
            estimated_time_remaining: data.estimated_time_remaining,
            start_time: data.start_time || '',
            end_time: data.end_time || null
          });

          // Append new logs
          if (data.new_logs && data.new_logs.length > 0) {
            setLogs(prev => [...prev, ...data.new_logs]);
          }

          // Append new results
          if (data.new_results && data.new_results.length > 0) {
            setResults(prev => [...prev, ...data.new_results]);
          }

          // Check if complete
          if (data.complete || data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
            eventSource.close();
            setIsStreaming(false);
            if (onComplete) {
              onComplete(data.status === 'completed');
            }
          }
        } catch (e) {
          console.error('Error parsing SSE data:', e);
        }
      };

      eventSource.onerror = (err) => {
        console.error('SSE error:', err);
        setIsStreaming(false);
        eventSource.close();
        setError('Lost connection to migration job. You can refresh to check status.');
      };
    };

    startStreaming();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [jobId, onComplete]);

  const handleCancel = async () => {
    try {
      await DatabricksService.cancelMigration(jobId);
      if (onCancel) {
        onCancel();
      }
    } catch (e: any) {
      setError(e.message || 'Failed to cancel migration');
    }
  };

  const handleRefresh = async () => {
    try {
      const jobData = await DatabricksService.getMigrationProgress(jobId);
      setJob(jobData);
    } catch (e: any) {
      setError(e.message || 'Failed to refresh job status');
    }
  };

  const formatTime = (seconds: number | null) => {
    if (!seconds) return 'Calculating...';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'success';
      case 'error': return 'error';
      case 'skipped': return 'warning';
      default: return 'default';
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'error': return '#ffebee';
      case 'warning': return '#fff3e0';
      case 'info': return '#e3f2fd';
      default: return '#f5f5f5';
    }
  };

  if (!job) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <LinearProgress sx={{ flex: 1 }} />
        <Typography variant="body2" color="textSecondary">
          Connecting to migration job...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 3 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Migration Progress
              {job.status === 'running' && (
                <Chip
                  label="In Progress"
                  color="primary"
                  size="small"
                  sx={{ ml: 2 }}
                />
              )}
              {job.status === 'completed' && (
                <Chip
                  icon={<CheckCircleIcon />}
                  label="Completed"
                  color="success"
                  size="small"
                  sx={{ ml: 2 }}
                />
              )}
              {job.status === 'failed' && (
                <Chip
                  icon={<ErrorIcon />}
                  label="Failed"
                  color="error"
                  size="small"
                  sx={{ ml: 2 }}
                />
              )}
              {job.status === 'cancelled' && (
                <Chip
                  icon={<CancelIcon />}
                  label="Cancelled"
                  color="warning"
                  size="small"
                  sx={{ ml: 2 }}
                />
              )}
            </Typography>

            <Box>
              {!isStreaming && job.status === 'running' && (
                <IconButton onClick={handleRefresh} size="small" sx={{ mr: 1 }}>
                  <RefreshIcon />
                </IconButton>
              )}
              {job.status === 'running' && (
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  startIcon={<CancelIcon />}
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              )}
            </Box>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="textSecondary">
                {job.progress_percentage}% Complete
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {job.completed_objects + job.failed_objects} / {job.total_objects} objects
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={job.progress_percentage}
              sx={{ height: 10, borderRadius: 5 }}
            />
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#e8f5e9' }}>
                <Typography variant="h4" color="success.main">{job.completed_objects}</Typography>
                <Typography variant="body2">Completed</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#ffebee' }}>
                <Typography variant="h4" color="error.main">{job.failed_objects}</Typography>
                <Typography variant="body2">Failed</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#e3f2fd' }}>
                <Typography variant="h4" color="primary.main">{job.total_objects}</Typography>
                <Typography variant="body2">Total</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#f3e5f5' }}>
                <Typography variant="h4" color="secondary.main">
                  {job.estimated_time_remaining ? formatTime(job.estimated_time_remaining) : '--'}
                </Typography>
                <Typography variant="body2">ETA</Typography>
              </Paper>
            </Grid>
          </Grid>

          {job.current_object && job.status === 'running' && (
            <Box sx={{ mt: 2, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="body2" color="textSecondary">
                Currently processing:
              </Typography>
              <Typography variant="body1" fontWeight="bold">
                {job.current_object}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6">Live Logs ({logs.length})</Typography>
            <IconButton onClick={() => setShowLogs(!showLogs)} size="small">
              {showLogs ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>

          <Collapse in={showLogs}>
            <Paper
              variant="outlined"
              sx={{
                maxHeight: 300,
                overflowY: 'auto',
                p: 2,
                backgroundColor: '#1e1e1e',
                color: '#ffffff',
                fontFamily: 'monospace',
                fontSize: '0.875rem'
              }}
            >
              <List dense>
                <AnimatePresence>
                  {logs.map((log, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ListItem
                        sx={{
                          py: 0.5,
                          backgroundColor: getLogLevelColor(log.level),
                          mb: 0.5,
                          borderRadius: 0.5,
                          color: '#000000'
                        }}
                      >
                        <ListItemText
                          primary={
                            <Typography variant="caption" component="span">
                              <strong>[{new Date(log.timestamp).toLocaleTimeString()}]</strong>{' '}
                              <Chip
                                label={log.level.toUpperCase()}
                                size="small"
                                sx={{
                                  height: 16,
                                  fontSize: '0.65rem',
                                  ml: 0.5,
                                  mr: 0.5
                                }}
                                color={log.level === 'error' ? 'error' : log.level === 'warning' ? 'warning' : 'info'}
                              />{' '}
                              {log.message}
                            </Typography>
                          }
                        />
                      </ListItem>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={logsEndRef} />
              </List>
            </Paper>
          </Collapse>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6">Object Migration Results ({results.length})</Typography>
            <IconButton onClick={() => setShowResults(!showResults)} size="small">
              {showResults ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>

          <Collapse in={showResults}>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Object Name</strong></TableCell>
                    <TableCell><strong>Type</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                    <TableCell><strong>Time (ms)</strong></TableCell>
                    <TableCell><strong>Error</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.map((result, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{result.object_name}</TableCell>
                      <TableCell>
                        <Chip label={result.object_type} size="small" />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={result.status}
                          color={getStatusColor(result.status)}
                          icon={
                            result.status === 'success' ? <CheckCircleIcon /> :
                            result.status === 'error' ? <ErrorIcon /> :
                            <SkipNextIcon />
                          }
                        />
                      </TableCell>
                      <TableCell>{result.execution_time_ms || '-'}</TableCell>
                      <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {result.error || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Collapse>
        </CardContent>
      </Card>
    </Box>
  );
};

export default MigrationProgress;

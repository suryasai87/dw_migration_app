import React, { useState } from 'react';
import {
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  Box,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { DatabricksService } from '../services/databricksService';

interface ScheduleCalendarProps {
  schedules: any[];
  onEditSchedule: (schedule: any) => void;
  onDeleteSchedule: (jobId: string) => void;
  onRefresh: () => void;
}

const ScheduleCalendar: React.FC<ScheduleCalendarProps> = ({
  schedules,
  onEditSchedule,
  onDeleteSchedule,
  onRefresh,
}) => {
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);

  const getFrequencyColor = (frequency: string) => {
    switch (frequency) {
      case 'once':
        return 'default';
      case 'daily':
        return 'primary';
      case 'weekly':
        return 'secondary';
      case 'monthly':
        return 'success';
      case 'cron':
        return 'warning';
      default:
        return 'default';
    }
  };

  const handleRunNow = (schedule: any) => {
    setSelectedSchedule(schedule);
    setRunDialogOpen(true);
    setRunResult(null);
  };

  const confirmRunNow = async () => {
    if (!selectedSchedule) return;

    setRunning(true);
    try {
      const response = await DatabricksService.runScheduleNow(selectedSchedule.job_id);
      setRunResult(response);
      if (response.success) {
        setTimeout(() => {
          onRefresh();
        }, 2000);
      }
    } catch (err) {
      setRunResult({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to run job',
      });
    } finally {
      setRunning(false);
    }
  };

  const handleCloseRunDialog = () => {
    setRunDialogOpen(false);
    setSelectedSchedule(null);
    setRunResult(null);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <>
      {schedules.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <ScheduleIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No scheduled jobs yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Click "New Schedule" to create your first migration schedule
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {schedules.map((schedule) => (
            <Grid item xs={12} md={6} lg={4} key={schedule.job_id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                    <Typography variant="h6" component="div">
                      {schedule.job_name}
                    </Typography>
                    <Chip
                      label={schedule.enabled ? 'Enabled' : 'Disabled'}
                      color={schedule.enabled ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>

                  {schedule.description && (
                    <Typography variant="body2" color="text.secondary" paragraph>
                      {schedule.description}
                    </Typography>
                  )}

                  <Box sx={{ mb: 2 }}>
                    <Chip
                      label={schedule.frequency.toUpperCase()}
                      color={getFrequencyColor(schedule.frequency)}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip
                      label={schedule.source_type.toUpperCase()}
                      variant="outlined"
                      size="small"
                    />
                  </Box>

                  <Typography variant="body2" color="text.secondary">
                    <strong>Target:</strong> {schedule.target_catalog}.{schedule.target_schema}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Start:</strong> {formatDate(schedule.start_date)}
                  </Typography>
                  {schedule.end_date && (
                    <Typography variant="body2" color="text.secondary">
                      <strong>End:</strong> {formatDate(schedule.end_date)}
                    </Typography>
                  )}

                  {schedule.dependencies && schedule.dependencies.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Dependencies: {schedule.dependencies.length} job(s)
                      </Typography>
                    </Box>
                  )}
                </CardContent>

                <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                  <Box>
                    <Tooltip title="Run Now">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleRunNow(schedule)}
                        disabled={!schedule.enabled}
                      >
                        <PlayArrowIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onEditSchedule(schedule)}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Are you sure you want to delete "${schedule.job_name}"?`
                          )
                        ) {
                          onDeleteSchedule(schedule.job_id);
                        }
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={runDialogOpen} onClose={handleCloseRunDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Run Migration Job Now</DialogTitle>
        <DialogContent>
          {!runResult ? (
            <Typography>
              Are you sure you want to run "{selectedSchedule?.job_name}" immediately?
            </Typography>
          ) : (
            <>
              {runResult.success ? (
                <Alert severity="success">
                  Job started successfully!
                  {runResult.execution && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2">
                        <strong>Execution ID:</strong> {runResult.execution.execution_id}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Status:</strong> {runResult.execution.status}
                      </Typography>
                      {runResult.execution.objects_migrated !== undefined && (
                        <Typography variant="body2">
                          <strong>Objects Migrated:</strong>{' '}
                          {runResult.execution.objects_migrated}
                        </Typography>
                      )}
                    </Box>
                  )}
                </Alert>
              ) : (
                <Alert severity="error">
                  Failed to run job: {runResult.error || 'Unknown error'}
                </Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          {!runResult ? (
            <>
              <Button onClick={handleCloseRunDialog}>Cancel</Button>
              <Button
                onClick={confirmRunNow}
                variant="contained"
                disabled={running}
                sx={{ backgroundColor: '#FF6B35' }}
              >
                {running ? 'Running...' : 'Run Now'}
              </Button>
            </>
          ) : (
            <Button onClick={handleCloseRunDialog} variant="contained">
              Close
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ScheduleCalendar;

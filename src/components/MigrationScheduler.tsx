import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Tabs,
  Tab,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ScheduleForm from './ScheduleForm';
import ScheduleCalendar from './ScheduleCalendar';
import JobHistory from './JobHistory';
import { DatabricksService } from '../services/databricksService';

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
      id={`scheduler-tabpanel-${index}`}
      aria-labelledby={`scheduler-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const MigrationScheduler: React.FC = () => {
  const [currentTab, setCurrentTab] = useState(0);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSchedules = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await DatabricksService.listSchedules();
      if (response.success) {
        setSchedules(response.schedules);
      } else {
        setError(response.error || 'Failed to load schedules');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const handleCreateSchedule = () => {
    setSelectedSchedule(null);
    setShowScheduleForm(true);
  };

  const handleEditSchedule = (schedule: any) => {
    setSelectedSchedule(schedule);
    setShowScheduleForm(true);
  };

  const handleFormClose = () => {
    setShowScheduleForm(false);
    setSelectedSchedule(null);
    loadSchedules();
  };

  const handleDeleteSchedule = async (jobId: string) => {
    try {
      await DatabricksService.deleteSchedule(jobId);
      loadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete schedule');
    }
  };

  return (
    <Box>
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h4" component="h1" gutterBottom>
            Migration Scheduler
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateSchedule}
            sx={{ backgroundColor: '#FF6B35' }}
          >
            New Schedule
          </Button>
        </Box>

        <Typography variant="body1" color="text.secondary" paragraph>
          Schedule and manage automated data warehouse migrations. Create one-time or recurring
          migration jobs, set up dependencies, and monitor execution history.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Tabs value={currentTab} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Calendar View" />
          <Tab label="Job History" />
        </Tabs>
      </Paper>

      <TabPanel value={currentTab} index={0}>
        <ScheduleCalendar
          schedules={schedules}
          onEditSchedule={handleEditSchedule}
          onDeleteSchedule={handleDeleteSchedule}
          onRefresh={loadSchedules}
        />
      </TabPanel>

      <TabPanel value={currentTab} index={1}>
        <JobHistory />
      </TabPanel>

      {showScheduleForm && (
        <ScheduleForm
          open={showScheduleForm}
          schedule={selectedSchedule}
          onClose={handleFormClose}
        />
      )}
    </Box>
  );
};

export default MigrationScheduler;

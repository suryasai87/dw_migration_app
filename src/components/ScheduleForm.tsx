import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Box,
  Chip,
  Alert,
  FormControlLabel,
  Switch,
  Autocomplete,
} from '@mui/material';
import { DatabricksService } from '../services/databricksService';

interface ScheduleFormProps {
  open: boolean;
  schedule: any | null;
  onClose: () => void;
}

const ScheduleForm: React.FC<ScheduleFormProps> = ({ open, schedule, onClose }) => {
  const [formData, setFormData] = useState({
    job_name: '',
    description: '',
    source_type: 'oracle',
    target_catalog: 'main',
    target_schema: 'default',
    model_id: 'databricks-llama-4-maverick',
    frequency: 'once',
    cron_expression: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    enabled: true,
    dependencies: [] as string[],
    notification_emails: [] as string[],
    inventory_path: '',
  });

  const [catalogs, setCatalogs] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [availableSchedules, setAvailableSchedules] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (schedule) {
      setFormData({
        job_name: schedule.job_name || '',
        description: schedule.description || '',
        source_type: schedule.source_type || 'oracle',
        target_catalog: schedule.target_catalog || 'main',
        target_schema: schedule.target_schema || 'default',
        model_id: schedule.model_id || 'databricks-llama-4-maverick',
        frequency: schedule.frequency || 'once',
        cron_expression: schedule.cron_expression || '',
        start_date: schedule.start_date?.split('T')[0] || new Date().toISOString().split('T')[0],
        end_date: schedule.end_date?.split('T')[0] || '',
        enabled: schedule.enabled !== undefined ? schedule.enabled : true,
        dependencies: schedule.dependencies || [],
        notification_emails: schedule.notification_emails || [],
        inventory_path: schedule.inventory_path || '',
      });
    }
  }, [schedule]);

  const loadInitialData = async () => {
    try {
      const [catalogsData, modelsData, schedulesData] = await Promise.all([
        DatabricksService.listCatalogs(),
        DatabricksService.listModels(),
        DatabricksService.listSchedules(),
      ]);

      if (catalogsData.catalogs) setCatalogs(catalogsData.catalogs);
      if (modelsData.models) setModels(modelsData.models);
      if (schedulesData.success && schedulesData.schedules) {
        setAvailableSchedules(schedulesData.schedules);
      }

      if (catalogsData.catalogs && catalogsData.catalogs.length > 0) {
        const schemasData = await DatabricksService.listSchemas(catalogsData.catalogs[0]);
        if (schemasData.schemas) setSchemas(schemasData.schemas);
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  };

  const handleCatalogChange = async (catalog: string) => {
    setFormData({ ...formData, target_catalog: catalog });
    try {
      const schemasData = await DatabricksService.listSchemas(catalog);
      if (schemasData.schemas) {
        setSchemas(schemasData.schemas);
      }
    } catch (err) {
      console.error('Failed to load schemas:', err);
    }
  };

  const handleAddEmail = () => {
    if (emailInput && emailInput.includes('@')) {
      setFormData({
        ...formData,
        notification_emails: [...formData.notification_emails, emailInput],
      });
      setEmailInput('');
    }
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setFormData({
      ...formData,
      notification_emails: formData.notification_emails.filter((e) => e !== emailToRemove),
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const scheduleData = {
        ...formData,
        start_date: formData.start_date + 'T00:00:00',
        end_date: formData.end_date ? formData.end_date + 'T23:59:59' : null,
      };

      if (schedule?.job_id) {
        // Update existing schedule
        await DatabricksService.updateSchedule(schedule.job_id, scheduleData);
      } else {
        // Create new schedule
        await DatabricksService.createSchedule(scheduleData);
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setLoading(false);
    }
  };

  const sourceTypes = [
    { id: 'oracle', name: 'Oracle Database' },
    { id: 'snowflake', name: 'Snowflake' },
    { id: 'sqlserver', name: 'Microsoft SQL Server' },
    { id: 'teradata', name: 'Teradata' },
    { id: 'netezza', name: 'IBM Netezza' },
    { id: 'synapse', name: 'Azure Synapse Analytics' },
    { id: 'redshift', name: 'Amazon Redshift' },
    { id: 'mysql', name: 'MySQL' },
  ];

  const frequencies = [
    { value: 'once', label: 'One-time' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'cron', label: 'Custom (Cron)' },
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {schedule ? 'Edit Migration Schedule' : 'Create Migration Schedule'}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Job Name"
              value={formData.job_name}
              onChange={(e) => setFormData({ ...formData, job_name: e.target.value })}
              required
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              multiline
              rows={2}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Source System</InputLabel>
              <Select
                value={formData.source_type}
                onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
                label="Source System"
              >
                {sourceTypes.map((type) => (
                  <MenuItem key={type.id} value={type.id}>
                    {type.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Inventory Path (Optional)"
              value={formData.inventory_path}
              onChange={(e) => setFormData({ ...formData, inventory_path: e.target.value })}
              placeholder="/Volumes/catalog/schema/..."
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Target Catalog</InputLabel>
              <Select
                value={formData.target_catalog}
                onChange={(e) => handleCatalogChange(e.target.value)}
                label="Target Catalog"
              >
                {catalogs.map((catalog) => (
                  <MenuItem key={catalog} value={catalog}>
                    {catalog}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Target Schema</InputLabel>
              <Select
                value={formData.target_schema}
                onChange={(e) => setFormData({ ...formData, target_schema: e.target.value })}
                label="Target Schema"
              >
                {schemas.map((schema) => (
                  <MenuItem key={schema} value={schema}>
                    {schema}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>AI Model</InputLabel>
              <Select
                value={formData.model_id}
                onChange={(e) => setFormData({ ...formData, model_id: e.target.value })}
                label="AI Model"
              >
                {models.map((model) => (
                  <MenuItem key={model.id} value={model.id}>
                    {model.name} - ${model.pricing.input}/M in, ${model.pricing.output}/M out
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Frequency</InputLabel>
              <Select
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                label="Frequency"
              >
                {frequencies.map((freq) => (
                  <MenuItem key={freq.value} value={freq.value}>
                    {freq.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {formData.frequency === 'cron' && (
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Cron Expression"
                value={formData.cron_expression}
                onChange={(e) => setFormData({ ...formData, cron_expression: e.target.value })}
                placeholder="0 0 * * *"
                helperText="e.g., 0 0 * * * (daily at midnight)"
              />
            </Grid>
          )}

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="date"
              label="Start Date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="date"
              label="End Date (Optional)"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12}>
            <Autocomplete
              multiple
              options={availableSchedules.filter((s) => s.job_id !== schedule?.job_id)}
              getOptionLabel={(option) => option.job_name}
              value={availableSchedules.filter((s) =>
                formData.dependencies.includes(s.job_id)
              )}
              onChange={(e, newValue) => {
                setFormData({
                  ...formData,
                  dependencies: newValue.map((s) => s.job_id),
                });
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Dependencies (Jobs that must complete first)"
                  placeholder="Select jobs"
                />
              )}
            />
          </Grid>

          <Grid item xs={12}>
            <Box>
              <TextField
                fullWidth
                label="Notification Emails"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEmail();
                  }
                }}
                placeholder="Enter email and press Enter"
                helperText="Add email addresses for notifications"
              />
              <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {formData.notification_emails.map((email) => (
                  <Chip
                    key={email}
                    label={email}
                    onDelete={() => handleRemoveEmail(email)}
                    color="primary"
                  />
                ))}
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                />
              }
              label="Enable Schedule"
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || !formData.job_name}
          sx={{ backgroundColor: '#FF6B35' }}
        >
          {loading ? 'Saving...' : schedule ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ScheduleForm;

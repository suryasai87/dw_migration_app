import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Checkbox,
  Tabs,
  Tab,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestoreIcon from '@mui/icons-material/Restore';
import SnapshotList from './SnapshotList';
import RollbackConfirmation from './RollbackConfirmation';
import DiffViewer from './DiffViewer';
import { getApiEndpoint } from '../config/apiConfig';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const RollbackManager: React.FC = () => {
  const [currentTab, setCurrentTab] = useState(0);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create snapshot dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [catalogName, setCatalogName] = useState('main');
  const [schemaName, setSchemaName] = useState('default');
  const [description, setDescription] = useState('');
  const [includeData, setIncludeData] = useState(false);
  const [creating, setCreating] = useState(false);

  // Rollback dialog
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(null);
  const [validationData, setValidationData] = useState<any>(null);

  // Diff viewer
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [diffData, setDiffData] = useState<any>(null);

  useEffect(() => {
    loadSnapshots();
  }, []);

  const loadSnapshots = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(getApiEndpoint('/api/rollback/snapshots'), {
        method: 'GET',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setSnapshots(data.snapshots);
      } else {
        setError(data.error || 'Failed to load snapshots');
      }
    } catch (err) {
      setError('Error loading snapshots: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSnapshot = async () => {
    if (!description.trim()) {
      setError('Please enter a description for the snapshot');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await fetch(getApiEndpoint('/api/rollback/snapshot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          catalog: catalogName,
          schema_name: schemaName,
          description,
          include_data: includeData,
          auto_snapshot: false,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`Snapshot created successfully: ${data.num_objects} objects`);
        setCreateDialogOpen(false);
        setCatalogName('main');
        setSchemaName('default');
        setDescription('');
        setIncludeData(false);
        loadSnapshots();
      } else {
        setError(data.error || 'Failed to create snapshot');
      }
    } catch (err) {
      setError('Error creating snapshot: ' + (err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleViewDiff = async (snapshot: any) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(getApiEndpoint(`/api/rollback/diff/${snapshot.snapshot_id}`), {
        method: 'GET',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setDiffData(data);
        setDiffDialogOpen(true);
      } else {
        setError(data.error || 'Failed to compute diff');
      }
    } catch (err) {
      setError('Error computing diff: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateRollback = async (snapshot: any) => {
    setLoading(true);
    setError(null);

    try {
      // First validate the rollback
      const response = await fetch(getApiEndpoint('/api/rollback/validate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          snapshot_id: snapshot.snapshot_id,
          catalog: snapshot.catalog,
          schema_name: snapshot.schema_name,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setValidationData(data);
        setSelectedSnapshot(snapshot);
        setRollbackDialogOpen(true);
      } else {
        setError(data.error || 'Failed to validate rollback');
      }
    } catch (err) {
      setError('Error validating rollback: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRollback = async (dryRun: boolean) => {
    if (!selectedSnapshot) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        getApiEndpoint(`/api/rollback/restore/${selectedSnapshot.snapshot_id}`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            snapshot_id: selectedSnapshot.snapshot_id,
            catalog: selectedSnapshot.catalog,
            schema_name: selectedSnapshot.schema_name,
            drop_existing: true,
            restore_data: selectedSnapshot.include_data,
            dry_run: dryRun,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        const message = dryRun
          ? `Dry run completed: ${data.successful} would succeed, ${data.failed} would fail`
          : `Rollback completed: ${data.successful} succeeded, ${data.failed} failed`;
        setSuccess(message);
        setRollbackDialogOpen(false);
        setSelectedSnapshot(null);
        setValidationData(null);
        if (!dryRun) {
          loadSnapshots();
        }
      } else {
        setError(data.error || 'Rollback failed');
      }
    } catch (err) {
      setError('Error during rollback: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!window.confirm('Are you sure you want to delete this snapshot?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(getApiEndpoint(`/api/rollback/snapshot/${snapshotId}`), {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Snapshot deleted successfully');
        loadSnapshots();
      } else {
        setError(data.error || 'Failed to delete snapshot');
      }
    } catch (err) {
      setError('Error deleting snapshot: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Rollback Manager
        </Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadSnapshots}
            sx={{ mr: 2 }}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            disabled={loading}
          >
            Create Snapshot
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Tabs value={currentTab} onChange={(_, v) => setCurrentTab(v)}>
            <Tab label="Snapshots" />
            <Tab label="About Rollback" />
          </Tabs>

          <TabPanel value={currentTab} index={0}>
            {loading && snapshots.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <SnapshotList
                snapshots={snapshots}
                onViewDiff={handleViewDiff}
                onRollback={handleInitiateRollback}
                onDelete={handleDeleteSnapshot}
              />
            )}
          </TabPanel>

          <TabPanel value={currentTab} index={1}>
            <Typography variant="h6" gutterBottom>
              About Rollback Capabilities
            </Typography>
            <Typography paragraph>
              The Rollback Manager allows you to create snapshots of your database schema before
              performing migrations, and restore to a previous state if needed.
            </Typography>

            <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
              Features:
            </Typography>
            <ul>
              <li>
                <strong>DDL Snapshots:</strong> Capture table and view structures before migration
              </li>
              <li>
                <strong>Data Snapshots:</strong> Use Delta Lake time travel to snapshot data state
                (optional)
              </li>
              <li>
                <strong>Diff View:</strong> Compare current state with snapshot to see changes
              </li>
              <li>
                <strong>Validation:</strong> Check for dependencies and potential issues before
                rollback
              </li>
              <li>
                <strong>Dry Run:</strong> Test rollback without making changes
              </li>
              <li>
                <strong>Partial Rollback:</strong> Restore specific tables instead of entire schema
              </li>
            </ul>

            <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
              Best Practices:
            </Typography>
            <ul>
              <li>Always create a snapshot before performing any migration</li>
              <li>Use descriptive names to identify snapshots easily</li>
              <li>Run validation and dry run before actual rollback</li>
              <li>Delete old snapshots to save storage space</li>
              <li>Enable data snapshots for critical migrations</li>
            </ul>
          </TabPanel>
        </CardContent>
      </Card>

      {/* Create Snapshot Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Database Snapshot</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Catalog"
                value={catalogName}
                onChange={(e) => setCatalogName(e.target.value)}
                placeholder="main"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Schema"
                value={schemaName}
                onChange={(e) => setSchemaName(e.target.value)}
                placeholder="default"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Before Oracle migration"
                multiline
                rows={3}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox checked={includeData} onChange={(e) => setIncludeData(e.target.checked)} />
                }
                label="Include Data Snapshot (uses Delta Lake time travel)"
              />
              <Typography variant="caption" display="block" color="text.secondary">
                Warning: Data snapshots require Delta tables and may take longer
              </Typography>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateSnapshot}
            variant="contained"
            disabled={creating || !description.trim()}
          >
            {creating ? <CircularProgress size={24} /> : 'Create Snapshot'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rollback Confirmation Dialog */}
      {rollbackDialogOpen && selectedSnapshot && validationData && (
        <RollbackConfirmation
          open={rollbackDialogOpen}
          snapshot={selectedSnapshot}
          validationData={validationData}
          onClose={() => {
            setRollbackDialogOpen(false);
            setSelectedSnapshot(null);
            setValidationData(null);
          }}
          onConfirm={handleConfirmRollback}
          loading={loading}
        />
      )}

      {/* Diff Viewer Dialog */}
      {diffDialogOpen && diffData && (
        <DiffViewer
          open={diffDialogOpen}
          diffData={diffData}
          onClose={() => {
            setDiffDialogOpen(false);
            setDiffData(null);
          }}
        />
      )}
    </Box>
  );
};

export default RollbackManager;

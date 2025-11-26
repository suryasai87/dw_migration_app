import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Tabs,
  Tab,
  Chip,
  List,
  ListItem,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

interface DiffViewerProps {
  open: boolean;
  diffData: any;
  onClose: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

const DiffViewer: React.FC<DiffViewerProps> = ({ open, diffData, onClose }) => {
  const [currentTab, setCurrentTab] = useState(0);

  const getChangeTypeIcon = (changeType: string) => {
    switch (changeType) {
      case 'CREATED':
        return <AddCircleIcon color="success" />;
      case 'DELETED':
        return <RemoveCircleIcon color="error" />;
      case 'MODIFIED':
        return <EditIcon color="warning" />;
      case 'UNCHANGED':
        return <CheckCircleIcon color="info" />;
      default:
        return null;
    }
  };

  const getChangeTypeColor = (changeType: string): 'success' | 'error' | 'warning' | 'info' | 'default' => {
    switch (changeType) {
      case 'CREATED':
        return 'success';
      case 'DELETED':
        return 'error';
      case 'MODIFIED':
        return 'warning';
      case 'UNCHANGED':
        return 'info';
      default:
        return 'default';
    }
  };

  const filterChanges = (changeType: string) => {
    if (!diffData.changes) return [];
    return diffData.changes.filter((c: any) => c.change_type === changeType);
  };

  const createdChanges = filterChanges('CREATED');
  const deletedChanges = filterChanges('DELETED');
  const modifiedChanges = filterChanges('MODIFIED');
  const unchangedChanges = filterChanges('UNCHANGED');

  const renderChangesList = (changes: any[], showDDL: boolean = false) => {
    if (changes.length === 0) {
      return (
        <Alert severity="info" sx={{ mt: 2 }}>
          No changes in this category
        </Alert>
      );
    }

    return (
      <List sx={{ mt: 2 }}>
        {changes.map((change: any, index: number) => (
          <React.Fragment key={index}>
            {showDDL ? (
              <Accordion sx={{ mb: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                    {getChangeTypeIcon(change.change_type)}
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="subtitle1">
                        {change.object_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {change.diff_summary}
                      </Typography>
                    </Box>
                    <Chip
                      label={change.object_type}
                      size="small"
                      color="default"
                    />
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {change.snapshot_ddl && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" color="error" gutterBottom>
                        Snapshot DDL (Before):
                      </Typography>
                      <Box
                        sx={{
                          p: 2,
                          bgcolor: '#fff3e0',
                          borderRadius: 1,
                          border: '1px solid #ffb74d',
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          overflow: 'auto',
                          maxHeight: 200,
                        }}
                      >
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                          {change.snapshot_ddl}
                        </pre>
                      </Box>
                    </Box>
                  )}
                  {change.current_ddl && (
                    <Box>
                      <Typography variant="subtitle2" color="success.main" gutterBottom>
                        Current DDL (After):
                      </Typography>
                      <Box
                        sx={{
                          p: 2,
                          bgcolor: '#e8f5e9',
                          borderRadius: 1,
                          border: '1px solid #66bb6a',
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          overflow: 'auto',
                          maxHeight: 200,
                        }}
                      >
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                          {change.current_ddl}
                        </pre>
                      </Box>
                    </Box>
                  )}
                </AccordionDetails>
              </Accordion>
            ) : (
              <ListItem sx={{ bgcolor: '#f5f5f5', mb: 1, borderRadius: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
                  {getChangeTypeIcon(change.change_type)}
                </Box>
                <ListItemText
                  primary={change.object_name}
                  secondary={change.diff_summary}
                />
                <Chip
                  label={change.object_type}
                  size="small"
                  color={getChangeTypeColor(change.change_type)}
                />
              </ListItem>
            )}
            {!showDDL && index < changes.length - 1 && <Divider />}
          </React.Fragment>
        ))}
      </List>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Typography variant="h6">Snapshot Difference Analysis</Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Snapshot ID: {diffData.snapshot_id}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2 }}>
            <Chip
              label={`${diffData.total_objects} Total Objects`}
              color="primary"
            />
            <Chip
              label={`${diffData.created_count} Created`}
              color="success"
              variant="outlined"
              icon={<AddCircleIcon />}
            />
            <Chip
              label={`${diffData.modified_count} Modified`}
              color="warning"
              variant="outlined"
              icon={<EditIcon />}
            />
            <Chip
              label={`${diffData.deleted_count} Deleted`}
              color="error"
              variant="outlined"
              icon={<RemoveCircleIcon />}
            />
            <Chip
              label={`${diffData.unchanged_count} Unchanged`}
              color="info"
              variant="outlined"
              icon={<CheckCircleIcon />}
            />
          </Box>
        </Box>

        <Tabs value={currentTab} onChange={(_, v) => setCurrentTab(v)}>
          <Tab label={`Created (${diffData.created_count})`} />
          <Tab label={`Modified (${diffData.modified_count})`} />
          <Tab label={`Deleted (${diffData.deleted_count})`} />
          <Tab label={`Unchanged (${diffData.unchanged_count})`} />
          <Tab label="All Changes" />
        </Tabs>

        <TabPanel value={currentTab} index={0}>
          <Alert severity="success" sx={{ mb: 2 }}>
            These objects were created after the snapshot was taken.
          </Alert>
          {renderChangesList(createdChanges, true)}
        </TabPanel>

        <TabPanel value={currentTab} index={1}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            These objects have been modified since the snapshot was taken.
          </Alert>
          {renderChangesList(modifiedChanges, true)}
        </TabPanel>

        <TabPanel value={currentTab} index={2}>
          <Alert severity="error" sx={{ mb: 2 }}>
            These objects existed in the snapshot but have been deleted.
          </Alert>
          {renderChangesList(deletedChanges, true)}
        </TabPanel>

        <TabPanel value={currentTab} index={3}>
          <Alert severity="info" sx={{ mb: 2 }}>
            These objects have not changed since the snapshot was taken.
          </Alert>
          {renderChangesList(unchangedChanges, false)}
        </TabPanel>

        <TabPanel value={currentTab} index={4}>
          {diffData.changes && diffData.changes.length > 0 ? (
            renderChangesList(diffData.changes, true)
          ) : (
            <Alert severity="info" sx={{ mt: 2 }}>
              No changes detected
            </Alert>
          )}
        </TabPanel>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DiffViewer;

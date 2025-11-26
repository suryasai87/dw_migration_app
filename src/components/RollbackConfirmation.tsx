import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Divider,
  CircularProgress,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

interface RollbackConfirmationProps {
  open: boolean;
  snapshot: any;
  validationData: any;
  onClose: () => void;
  onConfirm: (dryRun: boolean) => void;
  loading: boolean;
}

const RollbackConfirmation: React.FC<RollbackConfirmationProps> = ({
  open,
  snapshot,
  validationData,
  onClose,
  onConfirm,
  loading,
}) => {
  const [confirmChecked, setConfirmChecked] = useState(false);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'ERROR':
        return <ErrorIcon color="error" />;
      case 'WARNING':
        return <WarningIcon color="warning" />;
      case 'INFO':
        return <InfoIcon color="info" />;
      default:
        return <InfoIcon color="info" />;
    }
  };

  const getSeverityColor = (severity: string): 'error' | 'warning' | 'info' | 'success' => {
    switch (severity) {
      case 'ERROR':
        return 'error';
      case 'WARNING':
        return 'warning';
      case 'INFO':
        return 'info';
      default:
        return 'info';
    }
  };

  const handleDryRun = () => {
    onConfirm(true);
  };

  const handleConfirm = () => {
    if (confirmChecked) {
      onConfirm(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="warning" />
          <Typography variant="h6">Confirm Rollback</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Snapshot: {snapshot.description}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Target: {snapshot.catalog}.{snapshot.schema_name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Created: {new Date(snapshot.created_at).toLocaleString()}
          </Typography>
        </Box>

        {!validationData.can_rollback && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Rollback cannot proceed due to {validationData.errors_count} critical error(s).
            Please resolve the issues before attempting rollback.
          </Alert>
        )}

        {validationData.can_rollback && validationData.warnings_count > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {validationData.warnings_count} warning(s) detected. Review carefully before proceeding.
          </Alert>
        )}

        {validationData.can_rollback && validationData.warnings_count === 0 && (
          <Alert severity="success" sx={{ mb: 2 }} icon={<CheckCircleIcon />}>
            Validation passed. Rollback is safe to proceed.
          </Alert>
        )}

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            <strong>Impact Analysis:</strong>
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <Chip
              label={`${validationData.affected_objects} Objects Affected`}
              color="primary"
              variant="outlined"
            />
            <Chip
              label={`${validationData.warnings_count} Warnings`}
              color="warning"
              variant="outlined"
            />
            <Chip
              label={`${validationData.errors_count} Errors`}
              color="error"
              variant="outlined"
            />
          </Box>
        </Box>

        {validationData.issues && validationData.issues.length > 0 && (
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              <strong>Issues:</strong>
            </Typography>
            <List dense sx={{ maxHeight: 300, overflow: 'auto', bgcolor: '#f5f5f5', borderRadius: 1 }}>
              {validationData.issues.map((issue: any, index: number) => (
                <React.Fragment key={index}>
                  <ListItem>
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      {getSeverityIcon(issue.severity)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" fontWeight="bold">
                            {issue.object_name}
                          </Typography>
                          <Chip
                            label={issue.severity}
                            color={getSeverityColor(issue.severity)}
                            size="small"
                          />
                        </Box>
                      }
                      secondary={issue.message}
                    />
                  </ListItem>
                  {index < validationData.issues.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </Box>
        )}

        {validationData.can_rollback && (
          <Box sx={{ mt: 3 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              <strong>What will happen:</strong>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                <li>All tables in the snapshot will be recreated from saved DDL</li>
                <li>Existing tables not in snapshot will be DROPPED</li>
                {snapshot.include_data && (
                  <li>Data will be restored using Delta Lake time travel</li>
                )}
                <li>This action cannot be easily undone without another snapshot</li>
              </ul>
            </Alert>

            <FormControlLabel
              control={
                <Checkbox
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  color="error"
                />
              }
              label={
                <Typography variant="body2">
                  <strong>
                    I understand that this will modify the database and may result in data loss.
                  </strong>
                </Typography>
              }
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        {validationData.can_rollback && (
          <>
            <Button
              onClick={handleDryRun}
              variant="outlined"
              disabled={loading}
            >
              Dry Run
            </Button>
            <Button
              onClick={handleConfirm}
              variant="contained"
              color="warning"
              disabled={loading || !confirmChecked}
              startIcon={loading ? <CircularProgress size={20} /> : null}
            >
              {loading ? 'Rolling Back...' : 'Confirm Rollback'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default RollbackConfirmation;

import React from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Typography,
  Tooltip,
  Card,
  CardContent,
} from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import DeleteIcon from '@mui/icons-material/Delete';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import StorageIcon from '@mui/icons-material/Storage';
import TableChartIcon from '@mui/icons-material/TableChart';

interface SnapshotListProps {
  snapshots: any[];
  onViewDiff: (snapshot: any) => void;
  onRollback: (snapshot: any) => void;
  onDelete: (snapshotId: string) => void;
}

const SnapshotList: React.FC<SnapshotListProps> = ({
  snapshots,
  onViewDiff,
  onRollback,
  onDelete,
}) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (snapshots.length === 0) {
    return (
      <Card sx={{ mt: 2, bgcolor: '#f5f5f5' }}>
        <CardContent>
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <StorageIcon sx={{ fontSize: 64, color: '#ccc', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Snapshots Available
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Create a snapshot to capture the current state of your database before performing
              migrations. This allows you to rollback changes if needed.
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <TableContainer component={Paper} sx={{ mt: 2 }}>
      <Table>
        <TableHead>
          <TableRow sx={{ bgcolor: '#f5f5f5' }}>
            <TableCell><strong>Description</strong></TableCell>
            <TableCell><strong>Catalog.Schema</strong></TableCell>
            <TableCell align="center"><strong>Objects</strong></TableCell>
            <TableCell align="center"><strong>Data Snapshot</strong></TableCell>
            <TableCell><strong>Created</strong></TableCell>
            <TableCell align="right"><strong>Actions</strong></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {snapshots.map((snapshot) => (
            <TableRow
              key={snapshot.snapshot_id}
              sx={{ '&:hover': { bgcolor: '#fafafa' } }}
            >
              <TableCell>
                <Box>
                  <Typography variant="body1">{snapshot.description}</Typography>
                  {snapshot.auto_snapshot && (
                    <Chip
                      label="Auto"
                      size="small"
                      color="primary"
                      sx={{ mt: 0.5 }}
                    />
                  )}
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <TableChartIcon fontSize="small" color="action" />
                  <Typography variant="body2">
                    {snapshot.catalog}.{snapshot.schema_name}
                  </Typography>
                </Box>
              </TableCell>
              <TableCell align="center">
                <Chip label={snapshot.num_objects} color="default" size="small" />
              </TableCell>
              <TableCell align="center">
                {snapshot.include_data ? (
                  <Chip label="Yes" color="success" size="small" />
                ) : (
                  <Chip label="No" color="default" size="small" variant="outlined" />
                )}
              </TableCell>
              <TableCell>
                <Typography variant="body2">{formatDate(snapshot.created_at)}</Typography>
              </TableCell>
              <TableCell align="right">
                <Tooltip title="View Diff">
                  <IconButton
                    size="small"
                    onClick={() => onViewDiff(snapshot)}
                    color="primary"
                  >
                    <CompareArrowsIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Rollback to Snapshot">
                  <IconButton
                    size="small"
                    onClick={() => onRollback(snapshot)}
                    color="warning"
                  >
                    <RestoreIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete Snapshot">
                  <IconButton
                    size="small"
                    onClick={() => onDelete(snapshot.snapshot_id)}
                    color="error"
                  >
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default SnapshotList;

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Container,
  Typography,
  Box,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip,
  Divider,
  IconButton,
  Alert,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

interface QueryHistoryItem {
  id: number;
  timestamp: string;
  sourceSystem: string;
  targetSystem: string;
  status: 'success' | 'error';
  dataTypesConverted: number;
}

const QueryHistory: React.FC = () => {
  const [historyItems] = useState<QueryHistoryItem[]>([
    {
      id: 1,
      timestamp: new Date().toLocaleString(),
      sourceSystem: 'Oracle',
      targetSystem: 'Databricks SQL',
      status: 'success',
      dataTypesConverted: 24,
    },
    {
      id: 2,
      timestamp: new Date(Date.now() - 3600000).toLocaleString(),
      sourceSystem: 'Snowflake',
      targetSystem: 'Databricks SQL',
      status: 'success',
      dataTypesConverted: 33,
    },
    {
      id: 3,
      timestamp: new Date(Date.now() - 7200000).toLocaleString(),
      sourceSystem: 'SQL Server',
      targetSystem: 'Databricks SQL',
      status: 'success',
      dataTypesConverted: 35,
    },
  ]);

  const copyToClipboard = (item: QueryHistoryItem) => {
    const text = `Migration: ${item.sourceSystem} → ${item.targetSystem}\nTimestamp: ${item.timestamp}\nData Types: ${item.dataTypesConverted}\nStatus: ${item.status}`;
    navigator.clipboard.writeText(text);
  };

  return (
    <Container maxWidth="lg">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" gutterBottom>
            Migration History
          </Typography>
          <Typography variant="body1" color="textSecondary">
            View your past data type mapping queries and migration activities
          </Typography>
        </Box>

        {historyItems.length === 0 ? (
          <Alert severity="info">
            No migration history available. Start by exploring data type mappings.
          </Alert>
        ) : (
          <Paper elevation={2}>
            <List>
              {historyItems.map((item, index) => (
                <React.Fragment key={item.id}>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1, duration: 0.4 }}
                  >
                    <ListItem
                      sx={{
                        '&:hover': {
                          backgroundColor: '#f5f5f5',
                        },
                      }}
                      secondaryAction={
                        <IconButton
                          edge="end"
                          aria-label="copy"
                          onClick={() => copyToClipboard(item)}
                        >
                          <ContentCopyIcon />
                        </IconButton>
                      }
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Chip
                              label={item.sourceSystem}
                              size="small"
                              color="primary"
                            />
                            <Typography variant="body2">→</Typography>
                            <Chip
                              label={item.targetSystem}
                              size="small"
                              color="secondary"
                            />
                            {item.status === 'success' ? (
                              <CheckCircleIcon
                                sx={{ color: '#4CAF50', ml: 1 }}
                                fontSize="small"
                              />
                            ) : (
                              <ErrorIcon
                                sx={{ color: '#f44336', ml: 1 }}
                                fontSize="small"
                              />
                            )}
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" color="textSecondary">
                              {item.timestamp}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                              Data types converted: {item.dataTypesConverted}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  </motion.div>
                  {index < historyItems.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        )}
      </motion.div>
    </Container>
  );
};

export default QueryHistory;

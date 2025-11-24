import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Container,
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  Alert,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SearchIcon from '@mui/icons-material/Search';
import {
  dataWarehouseMappings,
  sourceSystemOptions,
} from '../data/dataTypeMappings';

const DataTypeMappings: React.FC = () => {
  const [selectedSource, setSelectedSource] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const handleSourceChange = (event: any) => {
    setSelectedSource(event.target.value);
    setSearchTerm('');
  };

  const filteredMappings =
    selectedSource && dataWarehouseMappings[selectedSource]
      ? dataWarehouseMappings[selectedSource].mappings.filter(
          (mapping) =>
            mapping.sourceType.toLowerCase().includes(searchTerm.toLowerCase()) ||
            mapping.targetType.toLowerCase().includes(searchTerm.toLowerCase()) ||
            mapping.notes.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : [];

  return (
    <Container maxWidth="lg">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" gutterBottom>
            Data Type Mappings
          </Typography>
          <Typography variant="body1" color="textSecondary">
            Select your source data warehouse to view data type conversions to Databricks SQL
          </Typography>
        </Box>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel id="source-select-label">Source Data Warehouse</InputLabel>
                  <Select
                    labelId="source-select-label"
                    id="source-select"
                    value={selectedSource}
                    label="Source Data Warehouse"
                    onChange={handleSourceChange}
                  >
                    {sourceSystemOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip
                    label={selectedSource ? dataWarehouseMappings[selectedSource]?.name : 'Not Selected'}
                    color={selectedSource ? 'primary' : 'default'}
                    sx={{ fontWeight: 'bold' }}
                  />
                  <ArrowForwardIcon color="action" />
                  <Chip
                    label="Databricks SQL"
                    color="secondary"
                    sx={{ fontWeight: 'bold' }}
                  />
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {!selectedSource && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Alert severity="info" sx={{ mb: 3 }}>
              Please select a source data warehouse platform from the dropdown above to view data type mappings.
            </Alert>
          </motion.div>
        )}

        {selectedSource && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <Paper sx={{ p: 2, mb: 3 }}>
              <TextField
                fullWidth
                variant="outlined"
                placeholder="Search data types..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                }}
              />
            </Paper>

            <Paper sx={{ mb: 3 }}>
              <Box sx={{ p: 2, backgroundColor: '#f5f5f5' }}>
                <Typography variant="h6">
                  {dataWarehouseMappings[selectedSource]?.name} to Databricks SQL
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Total mappings: {filteredMappings.length}
                  {searchTerm && ` (filtered from ${dataWarehouseMappings[selectedSource]?.mappings.length})`}
                </Typography>
              </Box>
              <TableContainer sx={{ maxHeight: 600 }}>
                <Table stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#FF6B35', color: 'white' }}>
                        Source Data Type ({dataWarehouseMappings[selectedSource]?.name})
                      </TableCell>
                      <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#004E89', color: 'white' }}>
                        Target Data Type (Databricks SQL)
                      </TableCell>
                      <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                        Migration Notes
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredMappings.map((mapping, index) => (
                      <motion.tr
                        key={index}
                        component={TableRow}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02, duration: 0.3 }}
                        sx={{
                          '&:hover': {
                            backgroundColor: '#f5f5f5',
                          },
                        }}
                      >
                        <TableCell>
                          <Chip
                            label={mapping.sourceType}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={mapping.targetType}
                            size="small"
                            color="secondary"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="textSecondary">
                            {mapping.notes}
                          </Typography>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </motion.div>
        )}
      </motion.div>
    </Container>
  );
};

export default DataTypeMappings;

import React from 'react';
import { motion } from 'framer-motion';
import {
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Box,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import StorageIcon from '@mui/icons-material/Storage';
import SpeedIcon from '@mui/icons-material/Speed';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const Dashboard: React.FC = () => {
  const stats = [
    {
      title: 'Supported Sources',
      value: '7',
      icon: <StorageIcon sx={{ fontSize: 40, color: '#FF6B35' }} />,
    },
    {
      title: 'Data Types Mapped',
      value: '200+',
      icon: <CheckCircleIcon sx={{ fontSize: 40, color: '#4CAF50' }} />,
    },
    {
      title: 'Migration Success Rate',
      value: '99.9%',
      icon: <SpeedIcon sx={{ fontSize: 40, color: '#2196F3' }} />,
    },
  ];

  return (
    <Container maxWidth="lg">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" gutterBottom>
            Data Warehouse Migration Dashboard
          </Typography>
          <Typography variant="body1" color="textSecondary">
            Simplify your migration from various data warehouses to Databricks SQL
          </Typography>
        </Box>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <Accordion defaultExpanded sx={{ mb: 3 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <InfoIcon color="primary" />
                <Typography variant="h6">
                  About DW Migration Assistant
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                  <Typography variant="h6" gutterBottom>
                    Why Migrate to Databricks?
                  </Typography>
                  <Typography variant="body2" paragraph>
                    Databricks SQL provides a unified analytics platform with best-in-class performance, scalability, and cost efficiency.
                  </Typography>
                  <Typography variant="body2">
                    Eliminate data silos and enable your organization to work with data at any scale.
                  </Typography>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Typography variant="h6" gutterBottom>
                    How It Works
                  </Typography>
                  <Typography variant="body2" paragraph>
                    1. <strong>Select your source</strong> data warehouse platform
                  </Typography>
                  <Typography variant="body2" paragraph>
                    2. <strong>View data type mappings</strong> for seamless migration
                  </Typography>
                  <Typography variant="body2" paragraph>
                    3. <strong>Execute migrations</strong> with confidence
                  </Typography>
                  <Typography variant="body2">
                    4. <strong>Track and analyze</strong> migration progress
                  </Typography>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Typography variant="h6" gutterBottom>
                    Supported Platforms
                  </Typography>
                  <Typography variant="body2" paragraph>
                    • <strong>Oracle</strong> Data Warehouse
                  </Typography>
                  <Typography variant="body2" paragraph>
                    • <strong>Snowflake</strong>
                  </Typography>
                  <Typography variant="body2" paragraph>
                    • <strong>Microsoft SQL Server</strong>
                  </Typography>
                  <Typography variant="body2" paragraph>
                    • <strong>Teradata</strong>
                  </Typography>
                  <Typography variant="body2" paragraph>
                    • <strong>IBM Netezza</strong>
                  </Typography>
                  <Typography variant="body2" paragraph>
                    • <strong>Azure Synapse</strong>
                  </Typography>
                  <Typography variant="body2">
                    • <strong>Amazon Redshift</strong>
                  </Typography>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </motion.div>

        <Grid container spacing={3}>
          {stats.map((stat, index) => (
            <Grid item xs={12} md={4} key={stat.title}>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + index * 0.1, duration: 0.4 }}
              >
                <Card elevation={2}>
                  <CardContent>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Box>
                        <Typography variant="body2" color="textSecondary">
                          {stat.title}
                        </Typography>
                        <Typography variant="h4" sx={{ mt: 1 }}>
                          {stat.value}
                        </Typography>
                      </Box>
                      {stat.icon}
                    </Box>
                  </CardContent>
                </Card>
              </motion.div>
            </Grid>
          ))}
        </Grid>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
        >
          <Paper sx={{ p: 3, mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              <InfoIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
              Getting Started
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body1">
                    Step 1: Navigate to Data Type Mappings
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body1">
                    Step 2: Select your source system
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body1">
                    Step 3: Review the data type conversions
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body1">
                    Step 4: Use the mappings in your migration
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </motion.div>
      </motion.div>
    </Container>
  );
};

export default Dashboard;

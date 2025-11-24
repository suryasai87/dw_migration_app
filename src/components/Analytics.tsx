import React from 'react';
import { motion } from 'framer-motion';
import {
  Container,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  Paper,
  LinearProgress,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import DataUsageIcon from '@mui/icons-material/DataUsage';
import AssessmentIcon from '@mui/icons-material/Assessment';

const Analytics: React.FC = () => {
  const analyticsData = [
    {
      title: 'Total Migrations',
      value: '127',
      trend: '+12% this month',
      color: '#FF6B35',
    },
    {
      title: 'Most Used Source',
      value: 'Snowflake',
      trend: '45% of migrations',
      color: '#004E89',
    },
    {
      title: 'Average Data Types',
      value: '28',
      trend: 'per migration',
      color: '#4CAF50',
    },
  ];

  const platformStats = [
    { name: 'Snowflake', percentage: 45 },
    { name: 'Oracle', percentage: 25 },
    { name: 'SQL Server', percentage: 15 },
    { name: 'Teradata', percentage: 10 },
    { name: 'Others', percentage: 5 },
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
            Migration Analytics
          </Typography>
          <Typography variant="body1" color="textSecondary">
            Insights and statistics about your data warehouse migrations
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {analyticsData.map((item, index) => (
            <Grid item xs={12} md={4} key={item.title}>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
              >
                <Card elevation={2}>
                  <CardContent>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <Box>
                        <Typography variant="body2" color="textSecondary">
                          {item.title}
                        </Typography>
                        <Typography variant="h4" sx={{ mt: 1, color: item.color }}>
                          {item.value}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {item.trend}
                        </Typography>
                      </Box>
                      <TrendingUpIcon sx={{ color: item.color, fontSize: 40 }} />
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
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <Paper sx={{ p: 3, mt: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <DataUsageIcon sx={{ mr: 1, color: '#FF6B35' }} />
              <Typography variant="h6">Platform Usage Distribution</Typography>
            </Box>
            <Grid container spacing={2}>
              {platformStats.map((platform, index) => (
                <Grid item xs={12} key={platform.name}>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + index * 0.1, duration: 0.3 }}
                  >
                    <Box sx={{ mb: 1 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          mb: 0.5,
                        }}
                      >
                        <Typography variant="body2">{platform.name}</Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {platform.percentage}%
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={platform.percentage}
                        sx={{
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: '#e0e0e0',
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: '#FF6B35',
                          },
                        }}
                      />
                    </Box>
                  </motion.div>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
        >
          <Paper sx={{ p: 3, mt: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <AssessmentIcon sx={{ mr: 1, color: '#004E89' }} />
              <Typography variant="h6">Key Insights</Typography>
            </Box>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" paragraph>
                  <strong>Most Complex Migration:</strong> Teradata to Databricks SQL
                  with 45 unique data type conversions
                </Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" paragraph>
                  <strong>Fastest Migration:</strong> Snowflake to Databricks SQL
                  averaging 2.3 minutes
                </Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" paragraph>
                  <strong>Success Rate:</strong> 99.9% across all platform migrations
                </Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" paragraph>
                  <strong>Peak Usage:</strong> Tuesdays and Thursdays between 2-4 PM
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </motion.div>
      </motion.div>
    </Container>
  );
};

export default Analytics;

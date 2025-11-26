import React, { useState } from 'react';
import {
  Box,
  CssBaseline,
  ThemeProvider,
  createTheme,
} from '@mui/material';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import DataTypeMappings from './components/DataTypeMappings';
import SqlTranslator from './components/SqlTranslator';
import DdlConverter from './components/DdlConverter';
import QueryGenerator from './components/QueryGenerator';
import MultiTableJoinGenerator from './components/MultiTableJoinGenerator';
import ConnectAndMigrate from './components/ConnectAndMigrate';
import MigrationScheduler from './components/MigrationScheduler';
import QueryHistory from './components/QueryHistory';
import Analytics from './components/Analytics';
import QueryTesting from './components/QueryTesting';
import SchemaComparison from './components/SchemaComparison';
import RollbackManager from './components/RollbackManager';
import CostEstimator from './components/CostEstimator';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#FF6B35',
    },
    secondary: {
      main: '#004E89',
    },
  },
});

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [drawerOpen, setDrawerOpen] = useState(true);

  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'dataTypeMappings':
        return <DataTypeMappings />;
      case 'sqlTranslator':
        return <SqlTranslator />;
      case 'ddlConverter':
        return <DdlConverter />;
      case 'queryGenerator':
        return <QueryGenerator />;
      case 'multiTableJoin':
        return <MultiTableJoinGenerator />;
      case 'connectAndMigrate':
        return <ConnectAndMigrate />;
      case 'costEstimator':
        return <CostEstimator />;
      case 'schemaComparison':
        return <SchemaComparison />;
      case 'queryTesting':
        return <QueryTesting />;
      case 'scheduler':
        return <MigrationScheduler />;
      case 'queryHistory':
        return <QueryHistory />;
      case 'analytics':
        return <Analytics />;
      case 'rollback':
        return <RollbackManager />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <Header drawerOpen={drawerOpen} toggleDrawer={toggleDrawer} />
        <Sidebar
          drawerOpen={drawerOpen}
          currentView={currentView}
          setCurrentView={setCurrentView}
        />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            mt: 8,
            backgroundColor: '#f5f5f5',
          }}
        >
          {renderView()}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;

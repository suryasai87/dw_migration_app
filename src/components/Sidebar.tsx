import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Box,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TransformIcon from '@mui/icons-material/Transform';
import HistoryIcon from '@mui/icons-material/History';
import AnalyticsIcon from '@mui/icons-material/Analytics';

interface SidebarProps {
  drawerOpen: boolean;
  currentView: string;
  setCurrentView: (view: string) => void;
}

const drawerWidth = 260;

const Sidebar: React.FC<SidebarProps> = ({
  drawerOpen,
  currentView,
  setCurrentView,
}) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
    {
      id: 'dataTypeMappings',
      label: 'Data Type Mappings',
      icon: <TransformIcon />,
    },
    { id: 'queryHistory', label: 'Query History', icon: <HistoryIcon /> },
    { id: 'analytics', label: 'Analytics', icon: <AnalyticsIcon /> },
  ];

  return (
    <Drawer
      variant="persistent"
      open={drawerOpen}
      sx={{
        width: drawerOpen ? drawerWidth : 0,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          backgroundColor: '#ffffff',
          borderRight: '1px solid rgba(0, 0, 0, 0.12)',
        },
      }}
    >
      <Toolbar />
      <Box sx={{ overflow: 'auto', mt: 2 }}>
        <List>
          {menuItems.map((item) => (
            <ListItem key={item.id} disablePadding>
              <ListItemButton
                selected={currentView === item.id}
                onClick={() => setCurrentView(item.id)}
                sx={{
                  '&.Mui-selected': {
                    backgroundColor: 'rgba(255, 107, 53, 0.08)',
                    borderRight: '4px solid #FF6B35',
                    '& .MuiListItemIcon-root': {
                      color: '#FF6B35',
                    },
                  },
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>
    </Drawer>
  );
};

export default Sidebar;

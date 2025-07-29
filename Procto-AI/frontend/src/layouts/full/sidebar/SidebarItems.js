import React from 'react';
import Menuitems from './MenuItems';
import { useLocation } from 'react-router';
import { Box, List } from '@mui/material';
import NavItem from './NavItem';
import NavGroup from './NavGroup/NavGroup';
import { useSelector } from 'react-redux';

const SidebarItems = () => {
  const { userInfo } = useSelector((state) => state.auth);
  const { pathname } = useLocation();
  const pathDirect = pathname;

  return (
    <Box sx={{ px: 3 }}>
      <List sx={{ pt: 0 }} className="sidebarNav">
        {Menuitems.map((item) => {
          // Hide teacher items and subheader for students
          if (
            userInfo?.role === 'student' &&
            (['Create Exam', 'Add Questions', 'Exam Logs'].includes(item.title) || item.subheader === 'Teacher')
          ) {
            return null;
          }
          // Hide student items and subheader for teachers
          if (
            userInfo?.role === 'teacher' &&
            (['Exams', 'Result'].includes(item.title) || item.subheader === 'Student')
          ) {
            return null;
          }
          // Render subheaders
          if (item.subheader) {
            return <NavGroup item={item} key={item.subheader} />;
          } else {
            return <NavItem item={item} key={item.id} pathDirect={pathDirect} />;
          }
        })}
      </List>
    </Box>
  );
};
export default SidebarItems;

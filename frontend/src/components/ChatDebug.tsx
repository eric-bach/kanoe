import React from 'react';
import { Box, Typography } from '@mui/material';
import ReactJson from '@microlink/react-json-view';

interface ChatDebugProps {
  debug: any;
}

const ChatDebug: React.FC<ChatDebugProps> = ({ debug }) => {
  return (
    <Box sx={{ mt: '90px', mr: '20px', mb: '20px', ml: '20px' }}>
      <Typography variant='h5' sx={{ pb: '15px' }}>
        Debug Trace
      </Typography>

      {debug.map((trace: any, i: any) => (
        <ReactJson key={i} src={trace} />
      ))}
    </Box>
  );
};

export default ChatDebug;

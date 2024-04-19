import React from 'react';
import { Typography } from '@mui/material';
import ReactJson from '@microlink/react-json-view';

interface ChatDebugProps {
  debug: any;
}

const ChatDebug: React.FC<ChatDebugProps> = ({ debug }) => {
  return (
    <>
      <Typography variant='h5' sx={{ pb: '15px' }}>
        Debug Trace
      </Typography>

      {debug.map((trace: any, i: any) => (
        <ReactJson src={trace} />
      ))}
    </>
  );
};

export default ChatDebug;

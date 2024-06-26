import DoubleArrowIcon from '@mui/icons-material/DoubleArrow';
import CircularProgress from '@mui/material/CircularProgress';
import { Box, Button, Drawer, TextField, IconButton, List, Typography } from '@mui/material';
import { Conversation } from '../common/types';
import React from 'react';
import ChatDebug from './ChatDebug';
import { STATUS } from '../routes/Chat';

interface ChatMessagesProps {
  prompt: string;
  status: STATUS;
  conversation: Conversation[] | undefined;
  handlePromptChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleKeyPress: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  submitMessage: (event: any) => Promise<void>;
}

const ChatMessages: React.FC<ChatMessagesProps> = ({ prompt, status, conversation, submitMessage, handlePromptChange, handleKeyPress }) => {
  const [showDebug, setShowDebug] = React.useState<number>(0);
  const [open, setOpen] = React.useState<boolean>(false);
  const [debug, setDebug] = React.useState<any[]>([]);

  const toggleDrawer = (i: number, open: boolean) => (event: React.KeyboardEvent | React.MouseEvent) => {
    if (i === showDebug) {
      setShowDebug(0);
      setDebug([]);
    } else {
      setShowDebug(i);
      setDebug(conversation ? conversation[i]?.traces : []);
    }

    setOpen(open);
  };

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '5px' }}>
        <List>
          {conversation?.map((message, i) => (
            <div key={i}>
              {message.type !== 'agent' ? (
                <Typography
                  align='right'
                  sx={{
                    backgroundColor: '#f5f5f5',
                    borderTopLeftRadius: 30,
                    borderBottomLeftRadius: 30,
                    borderTopRightRadius: 30,
                    borderBottomRightRadius: 5,
                    padding: 2,
                    width: '75%',
                    textAlign: 'right',
                    marginLeft: 'auto',
                    marginBottom: 2,
                  }}
                >
                  {message.message}
                </Typography>
              ) : (
                <Typography
                  align='left'
                  sx={{
                    color: 'white',
                    backgroundColor: '#de4f11',
                    borderTopLeftRadius: 30,
                    borderBottomLeftRadius: 5,
                    borderTopRightRadius: 30,
                    borderBottomRightRadius: 30,
                    padding: 2,
                    width: '75%',
                    textAlign: 'left',
                    marginBottom: 2,
                  }}
                >
                  {message.message.replace('<<REDACTED>>', '').replace('</<REDACTED>>', '')}
                  <br />
                  <Button sx={{ color: 'white' }} disableRipple onClick={toggleDrawer(i, true)}>
                    Toggle Trace
                  </Button>
                </Typography>
              )}
            </div>
          ))}
          {status !== STATUS.READY && <CircularProgress size={40} sx={{ mt: 2 }} />}
        </List>
        <Box display='flex' alignItems='center'>
          <TextField
            disabled={status !== STATUS.READY}
            type='text'
            id='prompt'
            value={prompt}
            onChange={handlePromptChange}
            onKeyDown={handleKeyPress}
            placeholder={'How can I help you book a flight...'}
            sx={{ width: '100%', mb: 4 }}
            InputProps={{
              endAdornment: (
                <IconButton type='submit' onClick={(e) => submitMessage(e)}>
                  <DoubleArrowIcon />
                </IconButton>
              ),
            }}
          />
        </Box>
      </Box>

      <Drawer anchor='right' open={open} onClose={toggleDrawer(showDebug, false)}>
        <Box sx={{ width: '800px' }} role='presentation'>
          <ChatDebug debug={debug} />
        </Box>
      </Drawer>
    </>
  );
};

export default ChatMessages;

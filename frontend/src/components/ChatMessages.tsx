import DoubleArrowIcon from '@mui/icons-material/DoubleArrow';
import CircularProgress from '@mui/material/CircularProgress';
import {
  Box,
  Button,
  Drawer,
  TextField,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
} from '@mui/material';
import InboxIcon from '@mui/icons-material/MoveToInbox';
import MailIcon from '@mui/icons-material/Mail';
import { Conversation } from '../common/types';
import React from 'react';
import ChatDebug from './ChatDebug';

interface ChatMessagesProps {
  prompt: string;
  conversation: Conversation | undefined;
  isLoadingMessage: boolean;
  handlePromptChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleKeyPress: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  submitMessage: (event: any) => Promise<void>;
}

const ChatMessages: React.FC<ChatMessagesProps> = ({ prompt, conversation, isLoadingMessage, submitMessage, handlePromptChange, handleKeyPress }) => {
  const [showDebug, setShowDebug] = React.useState<number>(0);
  const [open, setOpen] = React.useState<boolean>(false);
  const [debug, setDebug] = React.useState<any[]>([]);

  const toggleDrawer = (i: number, open: boolean) => (event: React.KeyboardEvent | React.MouseEvent) => {
    if (i === showDebug) {
      setShowDebug(0);
      setDebug([]);
    } else {
      setShowDebug(i);
      setDebug(conversation?.messages[i].debug);
    }

    setOpen(open);
  };

  return (
    <>
      <Grid item={true} md={2} />
      <Grid item={true} md={8} sx={{ pr: '30px' }}>
        <Typography variant='h5' sx={{ pb: '15px' }}>
          Conversation
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '5px' }}>
          <List>
            {conversation?.messages.map((message, i) => (
              <div key={i}>
                {message.type === 'agent' ? (
                  <Typography
                    align='right'
                    sx={{
                      backgroundColor: '#1976d2',
                      borderTopLeftRadius: 30,
                      borderBottomLeftRadius: 30,
                      borderTopRightRadius: 30,
                      borderBottomRightRadius: 5,
                      padding: 2,
                      color: 'white',
                      width: '75%',
                      textAlign: 'right',
                      marginLeft: 'auto',
                      marginBottom: 2,
                    }}
                  >
                    {message.content}
                    <br />
                    <Button sx={{ color: 'white' }} disableRipple onClick={toggleDrawer(i, true)}>
                      Toggle Trace
                    </Button>
                  </Typography>
                ) : (
                  <Typography
                    align='left'
                    sx={{
                      backgroundColor: '#f5f5f5',
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
                    {message.content}
                  </Typography>
                )}
              </div>
            ))}
            {isLoadingMessage && <CircularProgress size={40} sx={{ mt: 2 }} />}
          </List>
          <Box display='flex' alignItems='center'>
            <TextField
              disabled={isLoadingMessage}
              type='text'
              id='prompt'
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={handleKeyPress}
              placeholder={'Ask anything...'}
              sx={{ width: '100%' }}
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
      </Grid>
      <Grid item={true} md={2} />

      <Drawer anchor='right' open={open} onClose={toggleDrawer(showDebug, false)}>
        <Box sx={{ width: '800px' }} role='presentation' onClick={toggleDrawer(showDebug, false)}>
          <ChatDebug debug={debug} />
        </Box>
      </Drawer>
    </>
  );
};

export default ChatMessages;

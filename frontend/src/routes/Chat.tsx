import { Auth } from 'aws-amplify';
import React, { useEffect, useState, KeyboardEvent } from 'react';
import ChatMessages from '../components/ChatMessages';
import { Conversation } from '../common/types';
import { Chip, Grid, MenuItem, Select, SelectChangeEvent, Typography } from '@mui/material';

export enum STATUS {
  DISCONNECTED,
  THINKING,
  PREPARING,
  READY,
}

const Chat: React.FC = () => {
  const [status, setStatus] = useState<STATUS>(STATUS.DISCONNECTED);

  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [conversation, setConversation] = React.useState<Conversation[] | undefined>();
  const [prompt, setPrompt] = useState('');
  const [foundationModel, setFoundationModel] = useState<string>('anthropic.claude-3-haiku-20240307-v1:0');

  const [client, setClient] = useState<WebSocket>();

  const initializeClient = async () => {
    console.log('Initializing WebSocket client');

    const idToken = (await Auth.currentSession()).getIdToken().getJwtToken();
    const client = new WebSocket(`${import.meta.env.VITE_API_WEBSOCKET_ENDPOINT}?idToken=${idToken}`);

    client.onopen = (e) => {
      setStatus(STATUS.READY);
      console.log('WebSocket connection established.');
    };

    client.onerror = (e: any) => {
      console.error(e);
      setStatus(STATUS.DISCONNECTED);

      setTimeout(async () => {
        console.log('Error. Reconnecting...');
        await initializeClient();
      });
    };

    client.onclose = () => {
      if (!closed) {
        setTimeout(async () => {
          // console.log('Timeout. Reconnecting...');
          // await initializeClient();
        });
      } else {
        setStatus(STATUS.DISCONNECTED);
        console.log('WebSocket connection closed.');
      }
    };

    // https://stackoverflow.com/questions/60588745/websocket-in-reactjs-is-setting-state-with-empty-array
    client.onmessage = async (message: any) => {
      const event = JSON.parse(message.data);

      console.log('Received message', event);

      if (event.message !== 'Endpoint request timed out') {
        if (event.message == 'Internal server error') {
          // TODO Handle error
          return;
        } else if (event.message !== 'updated agent') {
          setSessionId(event.sessionId);
          setConversation((conversation) => [...(conversation || []), event.data]);
        }

        setPrompt('');
        setStatus(STATUS.READY);
      }
    };

    setClient(client);
  };

  useEffect(() => {
    initializeClient();
  }, []);

  const handleKeyPress = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key == 'Enter') {
      submitMessage(event);
    }
  };

  const handlePromptChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPrompt(event.target.value);
  };

  const handleAgentChange = async (event: SelectChangeEvent<string>) => {
    console.log('Prompt selected', event.target.value);
    setFoundationModel(event.target.value);

    await setAgent(event.target.value);
  };

  const submitMessage = async (event: any) => {
    setStatus(STATUS.THINKING);

    setConversation((conversation) => [...(conversation || []), { type: 'user', message: event.target.value, traces: [] }]);

    const user = await Auth.currentAuthenticatedUser();

    if (event.key !== 'Enter') {
      return;
    }

    const data = {
      action: 'SendMessage',
      userId: user.attributes.sub,
      sessionId: sessionId,
      prompt: prompt,
      token: (await Auth.currentSession()).getIdToken().getJwtToken(),
    };

    console.log('Sending message', data);

    client?.send(JSON.stringify(data));
  };

  const setAgent = async (fm: string) => {
    setStatus(STATUS.PREPARING);

    setConversation(undefined);
    setPrompt('');

    const data = {
      action: 'SetAgent',
      foundationModel: fm,
      token: (await Auth.currentSession()).getIdToken().getJwtToken(),
    };

    console.log('Setting agent', data);

    client?.send(JSON.stringify(data));
  };

  return (
    <Grid container columns={12}>
      <Grid item={true} md={2} />
      <Grid item={true} md={8} sx={{ pr: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant='h5' sx={{ pb: '15px', display: 'flex' }}>
            Conversation
            {status === STATUS.READY ? (
              <Chip label='Ready' color='success' sx={{ ml: '0.5em' }} />
            ) : (
              <Chip
                label={STATUS[status].charAt(0).toUpperCase() + STATUS[status].slice(1).toLowerCase()}
                color='error'
                variant='outlined'
                sx={{ ml: '0.5em' }}
              />
            )}
          </Typography>
          <Select value={foundationModel} onChange={(e) => handleAgentChange(e)} sx={{ mt: '-0.5em', ml: 'auto' }}>
            <MenuItem value='anthropic.claude-v2:1'>Anthropic Claude v2.1</MenuItem>
            <MenuItem value='anthropic.claude-3-sonnet-20240229-v1:0'>Anthropic Claude v3 Haiku</MenuItem>
            <MenuItem value='anthropic.claude-3-haiku-20240307-v1:0'>Anthropic Claude v3 Sonnet</MenuItem>
          </Select>
        </div>
        <ChatMessages
          prompt={prompt}
          conversation={conversation}
          status={status}
          submitMessage={(e: any) => submitMessage(e)}
          handleKeyPress={handleKeyPress}
          handlePromptChange={handlePromptChange}
        />
      </Grid>
      <Grid item={true} md={2} />
    </Grid>
  );
};

export default Chat;

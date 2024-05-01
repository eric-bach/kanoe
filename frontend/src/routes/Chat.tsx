import { Auth } from 'aws-amplify';
import React, { useEffect, useState, KeyboardEvent } from 'react';
import ChatMessages from '../components/ChatMessages';
import { Conversation } from '../common/types';
import { Grid } from '@mui/material';

const Chat: React.FC = () => {
  const [isLoadingMessage, setLoadingMessage] = useState<boolean>(false);

  const [conversation, setConversation] = React.useState<Conversation>({ messages: [], sessionId: '' });
  const [prompt, setPrompt] = useState('');

  const [client, setClient] = useState<WebSocket>();

  const initializeClient = async () => {
    console.log('Initializing WebSocket client');

    const idToken = (await Auth.currentSession()).getIdToken().getJwtToken();
    const client = new WebSocket(`${import.meta.env.VITE_API_WEBSOCKET_ENDPOINT}?idToken=${idToken}`);

    client.onopen = (e) => {
      console.log('WebSocket connection established.');
    };

    client.onerror = (e: any) => {
      //setStatus("error (reconnecting...)");
      console.error(e);

      setTimeout(async () => {
        await initializeClient();
      });
    };

    client.onclose = () => {
      if (!closed) {
        setTimeout(async () => {
          await initializeClient();
        });
      } else {
        console.log('WebSocket connection closed.');
      }
    };

    // https://stackoverflow.com/questions/60588745/websocket-in-reactjs-is-setting-state-with-empty-array
    client.onmessage = async (message: any) => {
      const event = JSON.parse(message.data);
      console.log('Received message', event);

      setPrompt('');
      setConversation({ messages: [...event.messages], sessionId: event.sessionId });

      setLoadingMessage(false);
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

  const submitMessage = async (event: any) => {
    setLoadingMessage(true);

    console.log('Submitting ', prompt);

    const user = await Auth.currentAuthenticatedUser();

    if (event.key !== 'Enter') {
      return;
    }

    client?.send(
      JSON.stringify({
        action: 'SendMessage',
        userId: user.attributes.sub,
        prompt: prompt,
        conversation: conversation,
        token: (await Auth.currentSession()).getIdToken().getJwtToken(),
      })
    );
  };

  return (
    <Grid container columns={12}>
      <ChatMessages
        prompt={prompt}
        conversation={conversation}
        isLoadingMessage={isLoadingMessage}
        submitMessage={(e: any) => submitMessage(e)}
        handleKeyPress={handleKeyPress}
        handlePromptChange={handlePromptChange}
      />
    </Grid>
  );
};

export default Chat;

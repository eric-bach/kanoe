import { Auth } from 'aws-amplify';
import React, { useEffect, useState } from 'react';

const Chat: React.FC = () => {
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

    client.onmessage = async (message: any) => {
      const event = JSON.parse(message.data);
      console.log('Received message', event);

      // setPrompt('');
      // fetchData(conversation?.conversationId);
      // setLoadingMessage(false);
    };

    setClient(client);
  };

  useEffect(() => {
    initializeClient();

    //fetchData();
  }, []);

  return <>Chat</>;
};

export default Chat;

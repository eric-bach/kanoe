import { Amplify, Auth } from 'aws-amplify';
import { Authenticator, Theme, ThemeProvider, View } from '@aws-amplify/ui-react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Typography } from '@mui/material';

import Layout from './routes/Layout';
import Chat from './routes/Chat';

import './index.css';

Amplify.configure({
  Auth: {
    userPoolId: import.meta.env.VITE_USER_POOL_ID,
    userPoolWebClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
    region: import.meta.env.VITE_REGION,
  },
  API: {
    endpoints: [
      {
        name: 'travel-agent-api',
        endpoint: import.meta.env.VITE_API_ENDPOINT,
        region: import.meta.env.VITE_REGION,
        custom_header: async () => {
          return {
            Authorization: `Bearer ${(await Auth.currentSession()).getIdToken().getJwtToken()}`,
          };
        },
      },
    ],
  },
});

const theme: Theme = {
  name: 'Theme',
  tokens: {
    colors: {
      brand: {
        primary: {
          '10': '#ff690f',
          '20': '#ff690f',
          '40': '#ff690f',
          '60': '#ff690f',
          '80': '#ff690f',
          '90': '#ff690f',
          '100': '#ff690f',
        },
      },
    },
  },
};

const formFields = {
  signIn: {
    username: {
      label: 'Email',
      placeholder: 'Enter your email',
    },
  },
  signUp: {
    username: {
      label: 'Email',
      placeholder: 'Enter your email',
      order: 1,
    },
    password: {
      order: 2,
    },
    confirm_password: {
      order: 3,
    },
  },
};

const components = {
  SignIn: {
    Header() {
      return (
        <>
          <Typography variant='h5' align='center' sx={{ pt: 1 }}>
            KANOE
          </Typography>
          <Typography variant='body1' align='center'>
            Sign into your account
          </Typography>
        </>
      );
    },
  },
};

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        Component: Chat,
      },
    ],
  },
]);

function App() {
  return (
    <ThemeProvider theme={theme}>
      <View paddingTop='6em'>
        <Authenticator formFields={formFields} components={components} hideSignUp={false}>
          <RouterProvider router={router} />
        </Authenticator>
      </View>
    </ThemeProvider>
  );
}

export default App;

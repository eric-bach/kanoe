import { Typography } from '@mui/material';

const logo: string[] = ['K', 'A', 'N', 'O', 'E'];

export default function Logo() {
  return (
    <div style={{ display: 'flex' }}>
      {logo.map((letter, index) => (
        <Typography
          key={index}
          variant='h5'
          noWrap
          component='a'
          href='/'
          sx={{
            display: 'inline-block',
            fontWeight: 700,
            letterSpacing: 'normal',
            fontSize: '16px', // Adjust the font size to make letters shorter
            color: 'white',
            backgroundColor: '#ff690f',
            padding: '2px 7px 0px 5px',
            marginRight: '2px', // Add margin to create space between letters
            textDecoration: 'none',
          }}
        >
          {letter}
        </Typography>
      ))}
    </div>
  );
}

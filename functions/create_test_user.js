const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

const app = initializeApp({ projectId: 'oer-agenda' });

getAuth(app).createUser({
  email: 'romaoboris@gmail.com',
  password: 'OER@2026',
  displayName: 'Boris Romao (Test)'
})
.then((userRecord) => {
  console.log('Successfully created new user:', userRecord.uid);
  process.exit(0);
})
.catch((error) => {
  console.log('Error creating new user:', error);
  process.exit(1);
});

import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
// You need to set FIREBASE_SERVICE_ACCOUNT_KEY environment variable
// with the JSON string of your Firebase service account key

const getFirebaseApp = () => {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountKey) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. ' +
      'Please set it to your Firebase service account JSON string.'
    );
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountKey);
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    throw new Error(
      'Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY. ' +
      'Make sure it contains valid JSON.'
    );
  }
};

export const getFirestore = () => {
  const app = getFirebaseApp();
  return admin.firestore(app);
};

export const COLLECTIONS = {
  STORES: 'shopify_stores',
} as const;

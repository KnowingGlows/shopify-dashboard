import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
// You need to set FIREBASE_SERVICE_ACCOUNT_KEY environment variable
// with the JSON string of your Firebase service account key

let firebaseInitialized = false;
let firebaseError: string | null = null;

const initializeFirebase = () => {
  if (admin.apps.length > 0) {
    firebaseInitialized = true;
    return admin.apps[0]!;
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountKey) {
    firebaseError = 'FIREBASE_SERVICE_ACCOUNT_KEY not set - using in-memory storage only';
    console.warn(firebaseError);
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountKey);
    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firebaseInitialized = true;
    console.log('Firebase initialized successfully');
    return app;
  } catch (error) {
    firebaseError = 'Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY - using in-memory storage only';
    console.warn(firebaseError);
    return null;
  }
};

export const isFirebaseAvailable = () => {
  if (!firebaseInitialized && !firebaseError) {
    initializeFirebase();
  }
  return firebaseInitialized && admin.apps.length > 0;
};

export const getFirestore = () => {
  if (!isFirebaseAvailable()) {
    return null;
  }
  return admin.firestore(admin.apps[0]!);
};

export const COLLECTIONS = {
  STORES: 'shopify_stores',
} as const;

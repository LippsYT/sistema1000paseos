// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getStorage } from "firebase/storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  "projectId": "studio-4928542414-9e787",
  "appId": "1:817860602299:web:625ed10314ccbed0a97c9e",
  "storageBucket": "studio-4928542414-9e787.appspot.com",
  "apiKey": "AIzaSyAoNBRBA3Fsm-zdCCdskvtrR2_alwI1WMg",
  "authDomain": "studio-4928542414-9e787.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "817860602299"
};


// Initialize Firebase
export const firebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const storage = getStorage(firebaseApp);

let analytics;
if (typeof window !== 'undefined' && isSupported()) {
  analytics = getAnalytics(firebaseApp);
}

export { analytics };

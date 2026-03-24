// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyD-ZVROybS5c3O6kJhe8LVcXNZ0KbYTmvg",
  authDomain: "recipes-83727.firebaseapp.com",
  projectId: "recipes-83727",
  storageBucket: "recipes-83727.appspot.com",
  messagingSenderId: "97445031584",
  appId: "1:97445031584:web:a463b119a272531f51a3c5",
  measurementId: "G-4LERX7EWB7"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Make Firestore globally available
const db = firebase.firestore();
window.db = db;

// Importa os SDKs necessários
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Configuração do Firebase (a sua)
const firebaseConfig = {
  apiKey: "AIzaSyCyCnlYITfYUJxVMl6eYf-tS6FCuZZckG8",
  authDomain: "posto-de-saude-f909a.firebaseapp.com",
  projectId: "posto-de-saude-f909a",
  storageBucket: "posto-de-saude-f909a.firebasestorage.app",
  messagingSenderId: "174308089289",
  appId: "1:174308089289:web:86c21059e431b987fd5c18",
  measurementId: "G-4QSM5E9GMR"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta o Firestore para usar em app.js
export const db = getFirestore(app);

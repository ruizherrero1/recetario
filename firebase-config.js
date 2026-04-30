window.RECETARIO_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBADC7lRWcvD_42hqskKkXXNiiNnMd4gvE",
  authDomain: "recetas-15610.firebaseapp.com",
  projectId: "recetas-15610",
  storageBucket: "recetas-15610.firebasestorage.app",
  messagingSenderId: "137712549509",
  appId: "1:137712549509:web:4c13d8eb6825ae650633ec",
  measurementId: "G-PD9MHMKKEM"
};

window.addEventListener("DOMContentLoaded", () => {
  window.setTimeout(() => {
    const savedCookbook = localStorage.getItem("recetario:lastCookbookCode");
    const unlockButton = document.querySelector("#unlockButton");
    const lockScreen = document.querySelector("#lockScreen");

    if (savedCookbook && unlockButton && lockScreen && !lockScreen.classList.contains("hidden")) {
      unlockButton.click();
    }
  }, 0);
});

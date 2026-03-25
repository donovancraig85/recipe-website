/****************************************************
 * CONFIG — SAFE TEMPLATE (NO KEYS)
 * Copy this file to app.js locally and insert your Azure key there.
 ****************************************************/
const AZURE_ENDPOINT = "https://recipes-ocr-service.cognitiveservices.azure.com/";
const AZURE_KEY = DK9sLgW8eV3EHkd6xLRaK2VWr9p81H68lA9gVF4hYh8b9FwVB0mjJQQJ99CCACYeBjFXJ3w3AAAFACOGC0Hm

/****************************************************
 * FIREBASE INIT
 ****************************************************/
const firebaseConfig = {
  apiKey: "AIzaSyD-ZVROybS5c306kJhe8BLVcXNZOKbYTMw",
  authDomain: "recipes-83727.firebaseapp.com",
  projectId: "recipes-83727",
  storageBucket: "recipes-83727.appspot.com",
  messagingSenderId: "97445031584",
  appId: "1:97445031584:web:a463b119a272531f51a3c5",
  measurementId: "G-4LERX7EWB7"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/****************************************************
 * AZURE OCR — IMAGE/PDF PROCESSOR
 ****************************************************/
async function callAzureOCR(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const base64 = reader.result.split(",")[1];
        const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

        const response = await fetch(
          AZURE_ENDPOINT + "vision/v3.2/ocr?language=en&detectOrientation=true",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
              "Ocp-Apim-Subscription-Key": AZURE_KEY
            },
            body: binary
          }
        );

        const data = await response.json();

        let text = "";
        if (data.regions) {
          data.regions.forEach(region => {
            region.lines.forEach(line => {
              text += line.words.map(w => w.text).join(" ") + "\n";
            });
          });
        }

        resolve(text.trim());
      } catch (err) {
        console.error("Azure OCR error:", err);
        reject(err);
      }
    };

    reader.readAsDataURL(file);
  });
}

/****************************************************
 * FILE READERS
 ****************************************************/

// TXT
function readTXT(file, name, category) {
  const reader = new FileReader();
  reader.onload = () => processRecipeText(reader.result, name, category);
  reader.readAsText(file);
}

// HTML
function readHTML(file, name, category) {
  const reader = new FileReader();
  reader.onload = () => {
    const doc = new DOMParser().parseFromString(reader.result, "text/html");
    processRecipeText(doc.body.innerText || "", name, category);
  };
  reader.readAsText(file);
}

// DOCX (requires mammoth.js)
async function readDOCX(file, name, category) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  processRecipeText(result.value || "", name, category);
}

// PDF → PNG → Azure OCR
async function readPDF(file, name, category) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    const imageFile = new File([blob], `page-${i}.png`, { type: "image/png" });

    const text = await callAzureOCR(imageFile);
    fullText += text + "\n";
  }

  processRecipeText(fullText, name, category);
}

// IMAGE → Azure OCR
function readImageOCR(file, name, category) {
  callAzureOCR(file).then(text => {
    processRecipeText(text, name, category);
  });
}

/****************************************************
 * MAIN UPLOAD HANDLER
 ****************************************************/
function handleFileUpload(file, name, category) {
  const ext = file.name.toLowerCase().split(".").pop();

  if (ext === "txt") return readTXT(file, name, category);
  if (ext === "html" || ext === "htm") return readHTML(file, name, category);
  if (ext === "docx") return readDOCX(file, name, category);
  if (ext === "pdf") return readPDF(file, name, category);
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext))
    return readImageOCR(file, name, category);

  alert("Unsupported file type: " + ext);
}

/****************************************************
 * RECIPE PARSER (simple version)
 ****************************************************/
function processRecipeText(rawText, name, category) {
  const cleaned = rawText.replace(/\r/g, "").trim();

  const recipe = {
    name: name || "Untitled Recipe",
    category: category || "Uncategorized",
    rawText: cleaned,
    createdAt: new Date().toISOString()
  };

  saveRecipeToFirestore(recipe);
}

/****************************************************
 * FIRESTORE SAVE
 ****************************************************/
function saveRecipeToFirestore(recipe) {
  db.collection("recipes")
    .add(recipe)
    .then(() => {
      alert("Recipe saved: " + recipe.name);
    })
    .catch(err => {
      console.error("Error saving recipe:", err);
      alert("Error saving recipe.");
    });
}

/****************************************************
 * UI HOOKUP
 ****************************************************/
document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("fileInput");
  const nameInput = document.getElementById("recipeName");
  const categoryInput = document.getElementById("recipeCategory");
  const uploadBtn = document.getElementById("uploadBtn");

  uploadBtn.addEventListener("click", () => {
    const file = fileInput.files[0];
    if (!file) return alert("Choose a file first.");

    handleFileUpload(
      file,
      nameInput.value.trim(),
      categoryInput.value.trim()
    );
  });
});

// -----------------------------
// GLOBALS
// -----------------------------
let recipes = [];

// -----------------------------
// UNIVERSAL TEXT CLEANER
// -----------------------------
function cleanText(raw) {
  return raw
    .replace(/\r/g, "\n")
    .replace(/[|=~”“‘’•·]/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\t+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// -----------------------------
// LOAD RECIPES FROM FIRESTORE
// -----------------------------
function loadRecipes() {
  db.collection("recipes").get().then(snapshot => {
    recipes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    recipes = recipes.map(r => ({
      ...r,
      name: typeof r.name === "string" ? r.name : ""
    }));

    renderRecipes(recipes);
  });
}

function renderRecipes(list) {
  const container = document.getElementById("recipe-list");
  if (!container) return;

  container.innerHTML = "";
  list.sort((a, b) => a.name.localeCompare(b.name));

  list.forEach(recipe => {
    const card = document.createElement("div");
    card.className = "recipe-card";

    const link = document.createElement("a");
    link.textContent = recipe.name;
    link.href = `recipe.html?id=${encodeURIComponent(recipe.id)}`;

    if (recipe.category) {
      const catDiv = document.createElement("div");
      catDiv.className = "category-preview";
      catDiv.textContent = recipe.category;
      card.appendChild(catDiv);
    }

    card.appendChild(link);
    container.appendChild(card);
  });
}

loadRecipes();

// -----------------------------
// OCR.space ONLINE OCR
// -----------------------------
async function onlineOCR(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("language", "eng");
  formData.append("OCREngine", "2");

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: formData
  });

  const data = await response.json();
  return data.ParsedResults?.[0]?.ParsedText || "";
}

// -----------------------------
// FILE UPLOAD HANDLER
// -----------------------------
const fileInput = document.getElementById("recipe-file");
const uploadbtn = document.getElementById("upload-btn");
const uploadName = document.getElementById("upload-name");
const uploadCategory = document.getElementById("upload-category");

if (uploadbtn) {
  uploadbtn.addEventListener("click", () => {
    const file = fileInput.files[0];
    const name = uploadName.value.trim();
    const category = uploadCategory.value.trim();

    if (!name) return alert("Please enter a recipe name.");
    if (!category) return alert("Please select a category.");
    if (!file) return alert("Please select a file first.");

    const ext = file.name.toLowerCase().split(".").pop();

    if (ext === "txt") return readTextFile(file, name, category);
    if (ext.includes("pdf")) return readPDF(file, name, category);
    if (ext.includes("docx")) return readDocx(file, name, category);
    if (ext.includes("html") || ext.includes("htm")) return readHTML(file, name, category);
    if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext))
      return readImageOCR(file, name, category);

    alert("Unsupported file type.");
  });
}

// -----------------------------
// TEXT FILE
// -----------------------------
function readTextFile(file, name, category) {
  const reader = new FileReader();
  reader.onload = () => processRecipeText(reader.result, name, category);
  reader.readAsText(file);
}

// -----------------------------
// PDF → IMAGE → OCR.space
// -----------------------------
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

    const text = await onlineOCR(imageFile);
    fullText += text + "\n";
  }

  processRecipeText(fullText, name, category);
}

// -----------------------------
// DOCX FILE
// -----------------------------
function readDocx(file, name, category) {
  const reader = new FileReader();
  reader.onload = async () => {
    const result = await mammoth.extractRawText({ arrayBuffer: reader.result });
    processRecipeText(result.value, name, category);
  };
  reader.readAsArrayBuffer(file);
}

// -----------------------------
// HTML FILE
// -----------------------------
function readHTML(file, name, category) {
  const reader = new FileReader();
  reader.onload = () => {
    const div = document.createElement("div");
    div.innerHTML = reader.result;
    processRecipeText(div.innerText, name, category);
  };
  reader.readAsText(file);
}

// -----------------------------
// IMAGE OCR → OCR.space
// -----------------------------
function readImageOCR(file, name, category) {
  onlineOCR(file).then(text => {
    processRecipeText(text, name, category);
  });
}

// -----------------------------
// OCR CLEANUP + PARSER
// -----------------------------
function processRecipeText(rawText, name, category) {
  let text = rawText
    .replace(/\r/g, "\n")
    .replace(/[|=~”“‘’•·]/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\t+/g, " ")
    .trim();

  text = text
    .replace(/THREE GUYS FROM MIAMI COOK CUBAN/gi, "")
    .replace(/DESSERTS/gi, "")
    .replace(/\bPage\s?\d+\b/gi, "")
    .replace(/\b\d{3}\b/g, "");

  text = text.replace(/^[A-Za-zÁÉÍÓÚÜÑ]+:/gm, "");
  text = text.replace(/-\s*\n\s*/g, "");

  text = text
    .split("\n")
    .filter(l => l.trim().length > 3)
    .filter(l => !/^[^a-zA-Z0-9]+$/.test(l))
    .join("\n");

  text = text.replace(/([a-z])\s+([a-z])/gi, "$1$2");

  let lines = text
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const isHeader = (line, word) =>
    line.replace(/\s+/g, "").toLowerCase().includes(word);

  let narrative = [];
  let ingredients = [];
  let directions = [];

  let mode = "narrative";

  for (let line of lines) {
    const clean = line.trim();

    if (isHeader(clean, "ingredient")) {
      mode = "ingredients";
      continue;
    }
    if (isHeader(clean, "direction") || isHeader(clean, "instruction")) {
      mode = "directions";
      continue;
    }

    const ingredientPattern =
      /^(\d+|\d+\s?\/\s?\d+|\d+\.\d+)?\s*(cup|teaspoon|tablespoon|tbsp|tsp|oz|ounce|can|egg|eggs|ml|g|kg|lb|pound|stick|clove|pinch|dash)/i;

    if (mode === "ingredients" && ingredientPattern.test(clean)) {
      ingredients.push(clean);
      continue;
    }

    const stepPattern = /^(\d+[\).]|step\s?\d+)/i;

    if (mode === "directions" && (stepPattern.test(clean) || clean.length > 20)) {
      directions.push(clean);
      continue;
    }

    narrative.push(clean);
  }

  const recipe = {
    name,
    category,
    narrative,
    ingredients,
    directions,
    servings: "",
    prepTime: "",
    cookTime: "",
    totalTime: "",
    createdAt: new Date()
  };

  db.collection("recipes").add(recipe).then(() => {
    alert("Recipe uploaded!");
  });
}

// -----------------------------
// CATEGORY FILTERING
// -----------------------------
function enableCategoryFiltering() {
  const items = document.querySelectorAll("#category-list li");
  if (!items) return;

  items.forEach(li => {
    li.addEventListener("click", () => {
      items.forEach(i => i.classList.remove("active"));
      li.classList.add("active");

      const category = li.dataset.cat;

      const filtered = recipes.filter(r =>
        r.category &&
        r.category.toLowerCase() === category.toLowerCase()
      );

      renderRecipes(filtered);
    });
  });
}

enableCategoryFiltering();

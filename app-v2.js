// app-v2.js
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
  db.collection("recipes")
    .get()
    .then(snapshot => {
      recipes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      recipes = recipes.map(r => ({
        ...r,
        name: typeof r.name === "string" ? r.name : ""
      }));

      renderRecipes(recipes);
      enableCategoryFiltering();
    })
    .catch(err => console.error("Error loading recipes:", err));
}

function renderRecipes(list) {
  const container = document.getElementById("recipe-list");
  if (!container) return;

  container.innerHTML = "";
  list.sort((a, b) => a.name.localeCompare(b.name));

  list.forEach(recipe => {
    const card = document.createElement("div");
    card.className = "recipe-card";

    if (recipe.category) {
      const catDiv = document.createElement("div");
      catDiv.className = "category-preview";
      catDiv.textContent = recipe.category;
      card.appendChild(catDiv);
    }

    const link = document.createElement("a");
    link.textContent = recipe.name;
    link.href = `recipe.html?id=${encodeURIComponent(recipe.id)}`;
    card.appendChild(link);

    container.appendChild(card);
  });
}

loadRecipes();

// -----------------------------
// SEARCH + DROPDOWN
// -----------------------------
const search = document.getElementById("search");
const searchBtn = document.getElementById("search-btn");
const searchResults = document.getElementById("search-results");

function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyMatch(text, query) {
  text = text.toLowerCase();
  query = query.toLowerCase();
  if (text.includes(query)) return true;
  return levenshteinDistance(text, query) <= 2;
}

function updateSearchDropdown(list) {
  if (!searchResults) return;

  searchResults.innerHTML = "";
  const query = search.value.toLowerCase().trim();

  if (!query) {
    searchResults.style.display = "none";
    return;
  }

  const matches = list.filter(r =>
    (r.name || "").toLowerCase().includes(query)
  );

  if (matches.length === 0) {
    searchResults.style.display = "none";
    return;
  }

  matches.slice(0, 8).forEach(recipe => {
    const item = document.createElement("div");
    item.textContent = recipe.name;
    item.addEventListener("click", () => {
      window.location.href = `recipe.html?id=${encodeURIComponent(recipe.id)}`;
    });
    searchResults.appendChild(item);
  });

  searchResults.style.display = "block";
}

function runSearch() {
  const query = search.value.toLowerCase().trim();

  if (!query) {
    renderRecipes(recipes);
    searchResults.style.display = "none";
    return;
  }

  const filtered = recipes.filter(recipe =>
    fuzzyMatch(recipe.name || "", query)
  );

  renderRecipes(filtered);
  updateSearchDropdown(filtered);
}

if (search) {
  search.addEventListener("input", runSearch);
  searchBtn?.addEventListener("click", runSearch);
}

// -----------------------------
// AZURE OCR (RAW BINARY)
// -----------------------------
async function runOCR(arrayBuffer) {
  try {
    const response = await fetch(
      "https://recipes-ocr-cpc7d8hbffahe0ad.canadacentral-01.azurewebsites.net/api/ocr",
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: arrayBuffer
      }
    );

    return await response.text();
  } catch (err) {
    console.error("Read v3 OCR error:", err);
    return "";
  }
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

    const ext = file.name.toLowerCase().split(".").pop() || "";

    if (ext === "txt") return readTextFile(file, name, category);
    if (ext === "pdf") return readPDF(file, name, category);
    if (ext === "docx") return readDocx(file, name, category);
    if (ext === "html" || ext === "htm") return readHTML(file, name, category);

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
// PDF → PNG → RAW BINARY OCR
// -----------------------------
async function readPDF(file, name, category) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error("Failed to create PNG blob"))),
        "image/png",
        1.0
      );
    });

    const pageText = await runOCR(pngBlob);
    fullText += "\n" + pageText;
  }

  processRecipeText(fullText, name, category);
}

// -----------------------------
// DOCX FILE
// -----------------------------
function readDocx(file, name, category) {
  const reader = new FileReader();
  reader.onload = async () => {
    const result = await mammoth.extractRawText({
      arrayBuffer: reader.result
    });
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
// IMAGE OCR
// -----------------------------
async function readImageOCR(fileList, name, category) {
  let fullText = "";

  for (const file of fileList) {
    const text = await runOCR(file);
    fullText += "\n" + text;
  }

  processRecipeText(fullText, name, category);
}

// -----------------------------
// UNIVERSAL OCR NORMALIZER
// -----------------------------
function normalizeOCRText(text) {
  // 1. Basic cleanup
  let lines = text
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\t+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // 2. Remove obvious non‑recipe chatter
  const chatterPatterns = [
    /^page\s*\d+/i,
    /^\d+\s*of\s*\d+/i,
    /^copyright/i,
    /^all rights reserved/i,
    /^www\./i,
    /^http/i,
    /^recipe by/i,
    /^serves\s*\d+/i,
    /^yield/i,
    /^makes/i,
    /^notes?:/i
  ];
  lines = lines.filter(l => !chatterPatterns.some(p => p.test(l)));

  // 3. Remove speaker names or dialogue (generic)
  const speakerPattern = /^[A-Z][a-z]+:/;
  lines = lines.filter(l => !speakerPattern.test(l));

  // 4. Merge broken ingredient lines
  const merged = [];
  for (let i = 0; i < lines.length; i++) {
    const curr = lines[i];
    const next = lines[i + 1] || "";

    const qty = /^(\d+|\d+\s?\/\s?\d+|\d+\.\d+|\d+\s?\d\/\d)/;
    const unit = /(cup|tsp|tbsp|teaspoon|tablespoon|oz|ounce|gram|kg|lb|ml|liter|pinch|dash|clove|can|package|stick|slice|egg)/i;

    const looksLikeQty = qty.test(curr);
    const nextLooksLikeIngredient = unit.test(next) || /^[a-z]/i.test(next);

    if (looksLikeQty && nextLooksLikeIngredient) {
      merged.push(curr + " " + next);
      i++;
    } else {
      merged.push(curr);
    }
  }
  lines = merged;

  // 5. Normalize section headers (generic)
  const knownSections = [
    "ingredients",
    "directions",
    "instructions",
    "method",
    "preparation",
    "prep",
    "cake",
    "syrup",
    "frosting",
    "topping",
    "filling",
    "dough",
    "batter",
    "glaze"
  ];

  lines = lines.map(l => {
    const lower = l.toLowerCase();
    if (knownSections.some(s => lower.includes(s))) {
      return "\n" + l.toUpperCase() + "\n";
    }
    return l;
  });

  // 6. Remove duplicate blank lines
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// -----------------------------
// OCR CLEANUP + PARSER
// -----------------------------
function processRecipeText(rawText, name, category) {
  // 0. Initial cleanup
  let text = rawText
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\t+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  text = text
    .replace(/\bPage\s*\d+\b/gi, "")
    .replace(/\b\d{1,3}\s*of\s*\d{1,3}\b/gi, "")
    .replace(/-{3,}/g, "")
    .trim();

  // 1. Normalize OCR text BEFORE parsing
  text = normalizeOCRText(text);

  // 2. Split into lines
  let lines = text
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const isHeader = (line, word) =>
    line.replace(/\s+/g, "").toLowerCase().includes(word);

  const subsectionLabels = [
    "cake",
    "syrup",
    "frosting",
    "topping",
    "filling",
    "dough",
    "batter",
    "glaze"
  ];

  let narrative = [];
  let ingredients = [];
  let directions = [];

  let mode = "narrative";

  // 3. Parse normalized text
  for (let line of lines) {
    const clean = line.trim();
    const lower = clean.toLowerCase();

    // Skip subsection labels entirely (no subsections in schema)
    if (subsectionLabels.includes(lower)) continue;

    // Switch modes
    if (isHeader(clean, "ingredient")) {
      mode = "ingredients";
      continue;
    }
    if (
      isHeader(clean, "direction") ||
      isHeader(clean, "instruction") ||
      isHeader(clean, "method")
    ) {
      mode = "directions";
      continue;
    }

    // Ingredient detection (flexible)
    const ingredientPattern =
      /^(\d+|\d+\s?\/\s?\d+|\d+\.\d+|\d+\s?\d\/\d|\(?\d+.*\)?)\s*[a-z]/i;

    if (mode === "ingredients" && ingredientPattern.test(clean)) {
      ingredients.push(clean);
      continue;
    }

    // Direction detection
    const stepPattern = /^(\d+[\).]|step\s?\d+)/i;

    if (mode === "directions" && (stepPattern.test(clean) || clean.length > 20)) {
      directions.push(clean);
      continue;
    }

    // Everything else = narrative
    narrative.push(clean);
  }

  // 4. Build recipe object
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

  // 5. Save to Firestore
  db.collection("recipes")
    .add(recipe)
    .then(() => alert("Recipe uploaded!"))
    .catch(err => {
      console.error("Error saving recipe:", err);
      alert("Error saving recipe. Check console.");
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

      const filtered = recipes.filter(
        r =>
          r.category &&
          r.category.toLowerCase() === category.toLowerCase()
      );

      renderRecipes(filtered);
    });
  });
}

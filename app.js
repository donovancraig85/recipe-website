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
  }).catch(err => {
    console.error("Error loading recipes:", err);
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

  const nameMatches = list.filter(r =>
    (r.name || "").toLowerCase().includes(query)
  );

  if (nameMatches.length === 0) {
    searchResults.style.display = "none";
    return;
  }

  nameMatches.slice(0, 8).forEach(recipe => {
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
    if (searchResults) searchResults.style.display = "none";
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
  searchBtn?.addEventListener("click", () => runSearch());
}

// -----------------------------
// AZURE OCR FUNCTION CALL
// -----------------------------
const OCR_ENDPOINT =
  "https://recipeocr.azurewebsites.net/api/ocr?code=Agld_zblbROeGZw-4AM1VcV1LIe3I6BYOyuiAxcFQgM3AzFuOrRlRw==";

async function azureOCR(body) {
  const response = await fetch(OCR_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    console.error("Azure OCR error:", response.status, response.statusText);
    return "";
  }

  const data = await response.json();
  return data.text || "";
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
// PDF → Azure OCR
// -----------------------------
async function readPDF(file, name, category) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.0 });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;

  const pngBase64 = canvas.toDataURL("image/png").split(",")[1];
  console.log("PNG length:", pngBase64?.length);

  const text = await azureOCR({ base64: pngBase64 });
  processRecipeText(text, name, category);
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
// IMAGE OCR → Azure OCR
// -----------------------------
async function readImageOCR(file, name, category) {
  const base64 = await fileToBase64(file);
  const text = await azureOCR({ base64 });
  processRecipeText(text, name, category);
}

// -----------------------------
// BASE64 HELPER
// -----------------------------
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// -----------------------------
// OCR CLEANUP + PARSER
// -----------------------------
function processRecipeText(rawText, name, category) {
  // -----------------------------
  // 1. BASIC NORMALIZATION
  // -----------------------------
  let text = rawText
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\t+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Remove common junk
  text = text
    .replace(/\bPage\s*\d+\b/gi, "")
    .replace(/\b\d{1,3}\s*of\s*\d{1,3}\b/gi, "") // "1 of 3"
    .replace(/-{3,}/g, "") // long dividers
    .trim();

  // -----------------------------
  // 2. SPLIT INTO LINES
  // -----------------------------
  let lines = text
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // -----------------------------
  // 3. SECTION DETECTION
  // -----------------------------
  const isHeader = (line, word) =>
    line.replace(/\s+/g, "").toLowerCase().includes(word);

  let narrative = [];
  let ingredients = [];
  let directions = [];

  let mode = "narrative";

  for (let line of lines) {
    const clean = line.trim();

    // Switch modes
    if (isHeader(clean, "ingredient")) {
      mode = "ingredients";
      continue;
    }
    if (isHeader(clean, "direction") || isHeader(clean, "instruction")) {
      mode = "directions";
      continue;
    }

    // -----------------------------
    // 4. INGREDIENT DETECTION
    // -----------------------------
    const ingredientPattern =
      /^(\d+|\d+\s?\/\s?\d+|\d+\.\d+)?\s*(cup|cups|teaspoon|teaspoons|tablespoon|tablespoons|tbsp|tsp|oz|ounce|ounces|can|cans|egg|eggs|ml|g|kg|lb|pound|pounds|stick|sticks|clove|cloves|pinch|dash)\b/i;

    if (mode === "ingredients" && ingredientPattern.test(clean)) {
      ingredients.push(clean);
      continue;
    }

    // -----------------------------
    // 5. STEP DETECTION
    // -----------------------------
    const stepPattern = /^(\d+[\).]|step\s?\d+)/i;

    if (mode === "directions" && (stepPattern.test(clean) || clean.length > 20)) {
      directions.push(clean);
      continue;
    }

    // -----------------------------
    // 6. DEFAULT → narrative
    // -----------------------------
    narrative.push(clean);
  }

  // -----------------------------
  // 7. SAVE TO FIRESTORE
  // -----------------------------
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
  }).catch(err => {
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

      const filtered = recipes.filter(r =>
        r.category &&
        r.category.toLowerCase() === category.toLowerCase()
      );

      renderRecipes(filtered);
    });
  });
}

enableCategoryFiltering();

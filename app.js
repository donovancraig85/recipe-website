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
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[•●▪■]/g, "")
    .replace(/\t+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/[^\S\r\n]+/g, " ")
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
// FUZZY MATCHING (NAME ONLY)
// -----------------------------
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

// -----------------------------
// SEARCH + LIVE DROPDOWN
// -----------------------------
const search = document.getElementById("search");
const searchBtn = document.getElementById("search-btn");
const searchResults = document.getElementById("search-results");

function updateSearchDropdown(list) {
  if (!searchResults) return;

  searchResults.innerHTML = "";

  const query = search.value.toLowerCase().trim();
  if (!query) {
    searchResults.style.display = "none";
    return;
  }

  const nameMatches = list.filter(r =>
    r.name.toLowerCase().includes(query)
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
  searchBtn?.addEventListener("click", () => runSearch());
}

// -----------------------------
// BULLETPROOF PARSER (WITH FIX)
// -----------------------------
function autoFormatRecipe(raw, name) {
  raw = cleanText(raw);

  raw = raw
    .replace(/\u00A0/g, " ")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\r/g, "");

  let lines = raw
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);

  let narrative = [];
  let ingredients = [];
  let directions = [];

  let servings = null;
  let prepTime = null;
  let cookTime = null;
  let totalTime = null;

  let mode = "narrative";

  for (let line of lines) {
    const lower = line.toLowerCase();
    const header = detectHeader(line);

    // SECTION HEADERS FIRST
    if (header === "ingredients") {
      mode = "ingredients";
      continue;
    }

    if (header === "directions" || header === "instructions" || header === "method") {
      mode = "directions";
      continue;
    }

    // METADATA
    if (lower.startsWith("yields") || lower.startsWith("yield")) {
      const match = lower.match(/(\d+)\s*serv/);
      if (match) servings = match[1];
      continue;
    }

    if (lower.startsWith("prep")) {
      const match = line.match(/prep[^0-9]*([\d\s\w]+)/i);
      if (match) prepTime = match[1].trim();
      continue;
    }

    if (lower.startsWith("cook")) {
      const match = line.match(/cook[^0-9]*([\d\s\w]+)/i);
      if (match) cookTime = match[1].trim();
      continue;
    }

    if (lower.startsWith("total")) {
      const match = line.match(/total[^0-9]*([\d\s\w]+)/i);
      if (match) totalTime = match[1].trim();
      continue;
    }

    if (/^\d+[\.\)\:]\s*/.test(line)) {
      const cleanedStep = line.replace(/^\d+[\.\)\:]\s*/, "").trim();
      directions.push(cleanedStep);
      mode = "directions";
      continue;
    }

    // INGREDIENT LINES
    if (mode === "ingredients") {
      ingredients.push(normalizeLine(line));
      continue;
    }

    // DIRECTIONS (non-numbered steps)
    if (mode === "directions") {
      directions.push(normalizeLine(line));
      continue;
    }

    // DEFAULT → NARRATIVE
    narrative.push(normalizeLine(line));
  }

  return {
    narrative,
    ingredients,
    directions,
    servings,
    prepTime,
    cookTime,
    totalTime
  };
}

// -----------------------------
// NORMALIZATION HELPERS
// -----------------------------
function normalizeLine(line) {
  return line
    .replace(/^[-•*]\s*/, "")
    .replace(/^\d+[\.\-\)\:]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectHeader(line) {
  const cleaned = line
    .normalize("NFKD")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, "")
    .replace(/[\u0000-\u001F\u007F-\u00A0]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

  if (cleaned === "ingredients") return "ingredients";
  if (cleaned === "ingredient") return "ingredients";
  if (cleaned === "directions") return "directions";
  if (cleaned === "instructions") return "instructions";
  if (cleaned === "method") return "method";

  return null;
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

  const cleanName = file.name.toLowerCase().split("?")[0];
  const ext = cleanName.split(".").pop();

  console.log("Detected file name:", file.name);
  console.log("Detected extension:", ext);

  if (ext === "txt") return readTextFile(file, name, category);
  if (ext.includes("pdf")) return readPDF(file, name, category);
  if (ext.includes("docx")) return readDocx(file, name, category);
  if (ext.includes("html") || ext.includes("htm")) return readHTML(file, name, category);
  if (["png", "jpg", "jpeg", "webp", "gif"].some(e => ext.includes(e)))
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
// PDF FILE
// -----------------------------
async function readPDF(file, name, category) {
  console.log("readPDF() STARTED");

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  console.log("PDF loaded. Pages:", pdf.numPages);

  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);

    // Render page to canvas
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Convert canvas to image blob
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    const imageFile = new File([blob], `page-${i}.png`, { type: "image/png" });

    console.log("Running OCR on page", i);

    // OCR the image
    const result = await Tesseract.recognize(imageFile, "eng");
    fullText += result.data.text + "\n";
  }

  console.log("OCR TEXT OUTPUT:", fullText);

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
// IMAGE OCR
// -----------------------------
function readImageOCR(file, name, category) {
  Tesseract.recognize(file, "eng").then(result => {
    processRecipeText(result.data.text, name, category);
  });
}

// -----------------------------
// PROCESS + SAVE FORMATTED RECIPE
// -----------------------------
function processRecipeText(text, name, category) {
  const normalize = str =>
    str
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/\s+/g, " ")            // collapse weird spacing
      .trim();

  const lines = text
    .split("\n")
    .map(normalize)
    .filter(l => l.length > 0);

  let narrative = [];
  let ingredients = [];
  let directions = [];

  let inIngredients = false;
  let inDirections = false;

  for (let raw of lines) {
    const line = normalize(raw);

    // Skip headers/footers
    if (line.includes("THREE GUYS")) continue;
    if (line.includes("DESSERTS")) continue;
    if (/^Page\s*\d+/i.test(line)) continue;

    // Detect ingredients section (very forgiving)
    if (line.replace(/[^A-Za-z]/g, "").toUpperCase().includes("INGREDIENTS")) {
      inIngredients = true;
      inDirections = false;
      continue;
    }

    // Detect directions (match "1.", "1 .", "1)")
    if (/^\d+\s*[\.\)]/.test(line)) {
      inDirections = true;
      inIngredients = false;
      directions.push(line);
      continue;
    }

    // Ingredient section headers (Cake, Syrup, Frosting)
    if (inIngredients && /^[A-Za-z ]+$/.test(line) && line.length < 40) {
      ingredients.push("— " + line + " —");
      continue;
    }

    // Ingredients: ANY line inside ingredient mode
    if (inIngredients) {
      ingredients.push(line);
      continue;
    }

    // Additional direction lines
    if (inDirections && /^\d+\s*[\.\)]/.test(line)) {
      directions.push(line);
      continue;
    }

    // Narrative (before ingredients)
    if (!inIngredients && !inDirections) {
      narrative.push(line);
    }
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
// CATEGORY SIDEBAR FILTERING
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
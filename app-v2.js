// ------------------------------------------------------
// GLOBALS
// ------------------------------------------------------
let recipes = [];

// ------------------------------------------------------
// BASIC TEXT CLEANER
// ------------------------------------------------------
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

// ------------------------------------------------------
// LOAD RECIPES FROM FIRESTORE
// ------------------------------------------------------
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

loadRecipes();

// ------------------------------------------------------
// RENDER RECIPES
// ------------------------------------------------------
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

// ------------------------------------------------------
// SEARCH SYSTEM
// ------------------------------------------------------
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

/* ------------------------------------------------------------
 MEDIUM-STRENGTH INGREDIENT DETECTOR
   ------------------------------------------------------------ */
function isIngredientLike(line) {
  const lower = line.toLowerCase().trim();

  if (!lower) return false;

  if (/^\d+([\/\s]\d+)?/.test(lower)) return true;

  if (/^[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/.test(lower)) return true;

  if (/^\(\d/.test(lower)) return true;

  if (/\d+\s?\d*\/\d*/.test(lower)) return true;

  const units = [
    "cup", "cups",
    "teaspoon", "teaspoons", "tsp",
    "tablespoon", "tablespoons", "tbsp",
    "ounce", "ounces", "oz",
    "pound", "pounds", "lb", "lbs",
    "gram", "grams", "g",
    "kilogram", "kilograms", "kg",
    "milliliter", "milliliters", "ml",
    "liter", "liters", "l",
    "pinch", "dash"
  ];
  if (units.some(u => lower.includes(u))) return true;

  // 6. Ingredient keywords (generic)
  const ingredientKeywords = [
    "can ",
    "package",
    "pkg",
    "clove",
    "cloves",
    "stick",
    "sticks",
    "slice",
    "slices",
    "fillet",
    "fillets",
    "breast",
    "breasts"
  ];
  if (ingredientKeywords.some(k => lower.includes(k))) return true;

  // 7. Lines that look like ingredients but lack quantity
  //    e.g. "salt", "vanilla extract", "baking powder"
  const commonIngredients = [
    "salt",
    "pepper",
    "extract",
    "powder",
    "flour",
    "sugar",
    "milk",
    "cream",
    "butter",
    "oil",
    "vinegar",
    "yeast",
    "baking",
    "corn syrup",
    "honey"
  ];
  if (commonIngredients.some(k => lower.includes(k))) return true;

  return false;
}

function isDirectionLike(line) {
  const lower = line.toLowerCase().trim();

  if (!lower) return false;

  // 1. Starts with a verb (most directions do)
  const cookingVerbs = [
    "add", "beat", "mix", "stir", "combine", "pour", "whisk", "fold",
    "bake", "cook", "heat", "boil", "simmer", "fry", "saute", "grill",
    "roast", "preheat", "knead", "blend", "spread", "grease", "measure",
    "cut", "slice", "chop", "mince", "peel", "crack", "separate",
    "transfer", "place", "arrange", "press", "cover", "uncover",
    "cool", "let", "allow", "serve"
  ];

  if (cookingVerbs.some(v => lower.startsWith(v + " "))) return true;

  // 2. Contains step numbers
  if (/^\d+[\.\):\-]/.test(lower)) return true;
  if (/^step\s*\d+/i.test(lower)) return true;

  // 3. Contains time or temperature
  if (/\bminutes?\b/.test(lower)) return true;
  if (/\bhours?\b/.test(lower)) return true;
  if (/\bdegrees?\b/.test(lower)) return true;
  if (/\b°F\b|\b°f\b|\b°c\b/.test(lower)) return true;

  // 4. Contains cookware or action phrases
  const cookware = [
    "bowl", "pan", "skillet", "oven", "dish", "pot",
    "mixer", "spatula", "whisk", "fork", "knife"
  ];
  if (cookware.some(w => lower.includes(w))) return true;

  // 5. Contains procedural phrases
  const procedural = [
    "until", "then", "next", "finally", "at this point",
    "in a separate", "in another", "in the meantime"
  ];
  if (procedural.some(p => lower.includes(p))) return true;

  return false;
}


/* ------------------------------------------------------------
CLASSIFY LINES
   ------------------------------------------------------------ */
function classifyLine(line) {
  const lower = line.toLowerCase().trim();

  if (isDirectionLike(line)) return "direction";

  if (isIngredientLike(line)) return "ingredient";

  if (lower.includes("directions")) return "directions-header";
  if (lower.includes("ingredients")) return "ingredients-header";

  if (/^[A-Za-z]+:/.test(line)) return "speaker";

  return "narrative";
}

/* ------------------------------------------------------------
 DETECT TWO-COLUMN LAYOUT
   ------------------------------------------------------------ */
function detectTwoColumnLayout(lines) {
  let sawIngredientsHeader = false;
  let ingredientBeforeHeader = false;
  let alternatingPattern = 0;

  for (let i = 0; i < lines.length; i++) {
    const type = classifyLine(lines[i]);

    if (type === "ingredients-header") {
      sawIngredientsHeader = true;
      continue;
    }

    if (!sawIngredientsHeader && type === "ingredient") {
      ingredientBeforeHeader = true;
    }

    if (i > 1) {
      const prev = classifyLine(lines[i - 1]);
      if (
        (prev === "narrative" && type === "ingredient") ||
        (prev === "ingredient" && type === "narrative")
      ) {
        alternatingPattern++;
      }
    }
  }

  return ingredientBeforeHeader || alternatingPattern >= 3;
}

/* ------------------------------------------------------------
SPLIT INTO TWO COLUMNS
   ------------------------------------------------------------ */
function splitColumns(lines) {
  const left = [];
  const right = [];
  let inDirections = false;

  for (const line of lines) {
    const type = classifyLine(line);

    if (type === "directions-header") {
      inDirections = true;
      continue;
    }

    if (inDirections) {
      left.push(line);
      continue;
    }

    if (type === "speaker" || type === "narrative") {
      left.push(line);
      continue;
    }

    if (type === "ingredient") {
      right.push(line);
      continue;
    }
  }

  return { left, right };
}

/* ------------------------------------------------------------
 REBUILD PAGE
   ------------------------------------------------------------ */
function rebuildPage(columns) {
  const narrative = [...columns.left];
  const ingredients = [...columns.right];
  const directions = [];

  let inDirections = false;

  for (const line of columns.left) {
    if (classifyLine(line) === "directions-header") {
      inDirections = true;
      continue;
    }
    if (inDirections) directions.push(line);
  }

  return { narrative, ingredients, directions };
}

/* ------------------------------------------------------------
IMPORTER
   ------------------------------------------------------------ */
function processRecipePipeline_v28(rawText, name, category) {
  let lines = rawText
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\t+/g, " ")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);

  lines = lines.filter(l => classifyLine(l) !== "garbage");

  lines = mergeBrokenQuantities(lines);

  lines = lines.map(l => normalizeUnits(normalizeFractions(l)));

  const isTwoColumn = detectTwoColumnLayout(lines);

  let narrative = [];
  let ingredients = [];
  let directions = [];

  if (isTwoColumn) {
    const columns = splitColumns(lines);
    const rebuilt = rebuildPage(columns);
    narrative = rebuilt.narrative;
    ingredients = rebuilt.ingredients;
    directions = rebuilt.directions;
  } else {
    narrative = lines;
  }

  directions = directions.map(d =>
    d.replace(/^\d+[:.)-]*\s*/, "").trim()
  );

  return {
    name,
    category,
    narrative,
    ingredients,
    directions,
    createdAt: new Date()
  };
}

/* ------------------------------------------------------------
WRAPPER 
   ------------------------------------------------------------ */
function processRecipePipeline(rawText, name, category) {
  return processRecipePipeline_v28(rawText, name, category);
}

// ------------------------------------------------------
// OCR ENGINE
// ------------------------------------------------------
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

// ------------------------------------------------------
// FILE UPLOAD HANDLER
// ------------------------------------------------------
const fileInput = document.getElementById("recipe-file");
const uploadbtn = document.getElementById("upload-btn");
const uploadName = document.getElementById("upload-name");
const uploadCategory = document.getElementById("upload-category");

if (uploadbtn) {
  uploadbtn.addEventListener("click", () => {
    const files = fileInput.files;
    const name = uploadName.value.trim();
    const category = uploadCategory.value.trim();

    if (!name) return alert("Please enter a recipe name.");
    if (!category) return alert("Please select a category.");
    if (!files.length) return alert("Please select a file first.");

    const ext = files[0].name.toLowerCase().split(".").pop() || "";

    if (ext === "txt") return readTextFile(files[0], name, category);
    if (ext === "pdf") return readPDF(files[0], name, category);
    if (ext === "docx") return readDocx(files[0], name, category);
    if (ext === "html" || ext === "htm") return readHTML(files[0], name, category);

    if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext))
      return readImageOCR(files, name, category);

    alert("Unsupported file type.");
  });
}

// ------------------------------------------------------
// TEXT FILE
// ------------------------------------------------------
function readTextFile(file, name, category) {
  const reader = new FileReader();
  reader.onload = () => handleImportedText(reader.result, name, category);
  reader.readAsText(file);
}

// ------------------------------------------------------
// PDF → PNG → OCR
// ------------------------------------------------------
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

  handleImportedText(fullText, name, category);
}

// ------------------------------------------------------
// DOCX FILE
// ------------------------------------------------------
function readDocx(file, name, category) {
  const reader = new FileReader();
  reader.onload = async () => {
    const result = await mammoth.extractRawText({
      arrayBuffer: reader.result
    });
    handleImportedText(result.value, name, category);
  };
  reader.readAsArrayBuffer(file);
}

// ------------------------------------------------------
// HTML FILE
// ------------------------------------------------------
function readHTML(file, name, category) {
  const reader = new FileReader();
  reader.onload = () => {
    const div = document.createElement("div");
    div.innerHTML = reader.result;
    handleImportedText(div.innerText, name, category);
  };
  reader.readAsText(file);
}

// ------------------------------------------------------
// MULTI‑IMAGE OCR
// ------------------------------------------------------
async function readImageOCR(fileList, name, category) {
  let fullText = "";

  for (const file of fileList) {
    const text = await runOCR(file);
    fullText += "\n" + text;
  }

  handleImportedText(fullText, name, category);
}

// ------------------------------------------------------
// v2.7.2 PIPELINE HELPERS (still used by v2.8)
// ------------------------------------------------------

// Normalize units BEFORE splitting
function normalizeUnits(line) {
  return line
    .replace(/\btea\b/i, "teaspoon")
    .replace(/\btable\b/i, "tablespoon")
    .replace(/\btsp\b/i, "teaspoon")
    .replace(/\btbsp\b/i, "tablespoon");
}

// Normalize fractions BEFORE splitting
function normalizeFractions(line) {
  return line
    .replace(/\b11\/4\b/g, "1 1/4")
    .replace(/\b11\/2\b/g, "1 1/2")
    .replace(/\b12\/3\b/g, "1 2/3")
    .replace(/\b13\/4\b/g, "1 3/4");
}

// Remove ingredient comments
function removeIngredientComments(line) {
  const triggers = [
    "delicious",
    "spoon",
    "ever had",
    "party mood",
    "up the",
    "you've"
  ];
  for (const t of triggers) {
    const idx = line.toLowerCase().indexOf(t);
    if (idx !== -1) return line.slice(0, idx).trim();
  }
  return line;
}

// Remove variation garbage
function stripVariations(line) {
  const keys = [
    "banana",
    "liqueur",
    "cuatro",
    "dulce",
    "variation",
    "many restaurants",
    "serve the cake in a bowl",
    "continued on next page",
    "tres leches cake (continuation)"
  ];
  for (const k of keys) {
    const idx = line.toLowerCase().indexOf(k);
    if (idx !== -1) return line.slice(0, idx).trim();
  }
  return line;
}

// Remove page numbers, headers, section labels
unction isGarbage(line) {
  const lower = line.toLowerCase().trim();

  if (!lower) return true;

  // Standalone numbers (page numbers)
  if (/^\d{1,4}$/.test(lower)) return true;

  // Page headers / footers
  if (/^page\s*\d+/.test(lower)) return true;
  if (/^\d+\s*of\s*\d+/.test(lower)) return true;

  // URLs, copyright, metadata
  if (/^www\./.test(lower)) return true;
  if (/^http/.test(lower)) return true;
  if (/copyright/i.test(lower)) return true;

  // Generic section headers (universal)
  const genericHeaders = [
    "narrative",
    "ingredients",
    "directions",
    "instructions",
    "method",
    "steps",
    "notes",
    "tips",
    "variations",
    "variation",
    "continued",
    "continued on next page",
    "serves",
    "yield",
    "desserts",
    "cake",
    "syrup",
    "frosting",
    "topping",
    "filling"
  ];
  if (genericHeaders.includes(lower)) return true;

  // All-caps multi-word lines (common OCR headers)
  if (/^[A-Z\s]{6,}$/.test(line) && line.split(" ").length > 1) return true;

  // Cookbook titles (generic rule: multi-word title case)
  if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+){2,}$/.test(line)) return true;

  return false;
}
// Merge broken quantity lines
function mergeBrokenQuantities(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const curr = lines[i];
    const next = lines[i + 1] || "";
    if (/^\d+$/.test(curr) && next.startsWith("(")) {
      out.push((curr + " " + next).trim());
      i++;
    } else {
      out.push(curr);
    }
  }
  return out;
}

// Split merged steps
function splitSteps(line) {
  const pattern = /(\bstep\s*\d+[:.)-]*|\b\d+[:.)-])/gi;
  const matches = [...line.matchAll(pattern)];
  if (matches.length < 2) return [line];

  const parts = [];
  let last = 0;
  for (let i = 1; i < matches.length; i++) {
    const start = matches[i].index;
    parts.push(line.slice(last, start).trim());
    last = start;
  }
  parts.push(line.slice(last).trim());
  return parts.filter(p => p.length > 0);
}

// Remove step numbers (formatter)
function removeStepNumber(line) {
  return line
    .replace(/^\s*step\s*\d+[:.)\-\—]*\s*/i, "")
    .replace(/^\s*\d+[:.)\-\—]*\s*/, "")
    .replace(/^[\.\)\:\-\—]+\s*/, "")
    .trim();
}

// Strict ingredient splitting
function splitIngredients(line) {
  const qty = /(\d+\s?\d*\/?\d*|\d+\.\d+|\(\d.*?\))/g;
  const matches = [...line.matchAll(qty)];
  if (matches.length < 2) return [line];

  const parts = [];
  let last = 0;
  for (let i = 1; i < matches.length; i++) {
    const start = matches[i].index;
    parts.push(line.slice(last, start).trim());
    last = start;
  }
  parts.push(line.slice(last).trim());
  return parts.filter(p => p.length > 0);
}

// ------------------------------------------------------
// NORMALIZE OCR TEXT
// ------------------------------------------------------
function normalizeOCR(text) {
  let lines = text
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\t+/g, " ")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);

  lines = lines.filter(l => !isGarbage(l));
  lines = mergeBrokenQuantities(lines);

  return lines;
}

// ------------------------------------------------------
// WRAPPER
// ------------------------------------------------------
function processRecipePipeline(rawText, name, category) {
  return processRecipePipeline_v28(rawText, name, category);
}

// ------------------------------------------------------
// HANDLE IMPORTED TEXT → SAVE TO FIRESTORE
// ------------------------------------------------------
function handleImportedText(rawText, name, category) {
  const recipe = processRecipePipeline(rawText, name, category);

  db.collection("recipes")
    .add(recipe)
    .then(() => alert("Recipe uploaded!"))
    .catch(err => {
      console.error("Error saving recipe:", err);
      alert("Error saving recipe. Check console.");
    });
}

// ------------------------------------------------------
// CATEGORY FILTERING
// ------------------------------------------------------
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

// ------------------------------------------------------
// RECIPE PAGE LOADER (recipe.html)
// ------------------------------------------------------
async function loadRecipePage() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) return;

  try {
    const doc = await db.collection("recipes").doc(id).get();
    if (!doc.exists) {
      document.getElementById("recipe-container").innerHTML =
        "<p>Recipe not found.</p>";
      return;
    }

    const recipe = doc.data();
    renderFullRecipe(recipe);
  } catch (err) {
    console.error("Error loading recipe:", err);
  }
}

// ------------------------------------------------------
// RENDER FULL RECIPE VIEW
// ------------------------------------------------------
function renderFullRecipe(recipe) {
  const container = document.getElementById("recipe-container");
  if (!container) return;

  container.innerHTML = "";

  const title = document.createElement("h1");
  title.textContent = recipe.name;
  container.appendChild(title);

  if (recipe.category) {
    const cat = document.createElement("div");
    cat.className = "recipe-category";
    cat.textContent = recipe.category;
    container.appendChild(cat);
  }

  // Narrative
  if (recipe.narrative && recipe.narrative.length > 0) {
    const narrativeDiv = document.createElement("div");
    narrativeDiv.className = "recipe-narrative";

    recipe.narrative.forEach(line => {
      const p = document.createElement("p");
      p.textContent = line;
      narrativeDiv.appendChild(p);
    });

    container.appendChild(narrativeDiv);
  }

  // Ingredients
  if (recipe.ingredients && recipe.ingredients.length > 0) {
    const ingHeader = document.createElement("h2");
    ingHeader.textContent = "Ingredients";
    container.appendChild(ingHeader);

    const ul = document.createElement("ul");
    recipe.ingredients.forEach(item => {
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }

  // Directions
  if (recipe.directions && recipe.directions.length > 0) {
    const dirHeader = document.createElement("h2");
    dirHeader.textContent = "Directions";
    container.appendChild(dirHeader);

    const ol = document.createElement("ol");
    recipe.directions.forEach(step => {
      const li = document.createElement("li");
      li.textContent = step;
      ol.appendChild(li);
    });
    container.appendChild(ol);
  }
}

// Auto-run on recipe.html
if (window.location.pathname.includes("recipe.html")) {
  loadRecipePage();
}

// ------------------------------------------------------
// UI HELPERS (OPTIONAL / PROJECT-SPECIFIC)
// ------------------------------------------------------

// Smooth scroll to top button (if present)
const scrollTopBtn = document.getElementById("scroll-top-btn");
if (scrollTopBtn) {
  scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", () => {
    if (window.scrollY > 300) {
      scrollTopBtn.style.display = "block";
    } else {
      scrollTopBtn.style.display = "none";
    }
  });
}

// Expand/collapse narrative 
document.addEventListener("click", e => {
  if (e.target.classList.contains("toggle-narrative")) {
    const block = document.querySelector(".recipe-narrative");
    if (block) block.classList.toggle("collapsed");
  }
});

// Expand/collapse ingredients 
document.addEventListener("click", e => {
  if (e.target.classList.contains("toggle-ingredients")) {
    const block = document.querySelector(".ingredients-list");
    if (block) block.classList.toggle("collapsed");
  }
});

// Expand/collapse directions 
document.addEventListener("click", e => {
  if (e.target.classList.contains("toggle-directions")) {
    const block = document.querySelector(".directions-list");
    if (block) block.classList.toggle("collapsed");
  }
});

// ------------------------------------------------------
// FINAL INITIALIZATION HOOKS
// ------------------------------------------------------

// Only run homepage logic if we're on index.html
if (window.location.pathname.includes("index.html") || window.location.pathname === "/") {
  // Ensure recipes load on homepage
  if (typeof loadRecipes === "function") {
    loadRecipes();
  }
}

// Only run recipe page logic if we're on recipe.html
if (window.location.pathname.includes("recipe.html")) {
  if (typeof loadRecipePage === "function") {
    loadRecipePage();
  }
}

// Ensure category filtering is active when category list exists
document.addEventListener("DOMContentLoaded", () => {
  const categoryList = document.getElementById("category-list");
  if (categoryList && typeof enableCategoryFiltering === "function") {
    enableCategoryFiltering();
  }
});

// Prevent errors if optional UI elements are missing
window.addEventListener("load", () => {
  // Scroll button safety
  const scrollTopBtn = document.getElementById("scroll-top-btn");
  if (scrollTopBtn) {
    scrollTopBtn.style.display = "none";
  }
});


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
// FUZZY MATCHING
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
// SEARCH + DROPDOWN
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
// PDF → OCR PIPELINE
// -----------------------------
async function readPDF(file, name, category) {
  console.log("readPDF() STARTED");

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  console.log("PDF loaded. Pages:", pdf.numPages);

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

    console.log("Running OCR on page", i);

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
// CLEAN OCR PARSER
// -----------------------------
function processRecipeText(text, name, category) {
  // 1. Remove obvious OCR garbage
  text = text
    .replace(/[=|~”“‘’•·]/g, " ")
    .replace(/[\u00A0]/g, " ")
    .replace(/[^a-zA-Z0-9.,:;()/%\- ]/g, " ") // remove stray glyphs
    .replace(/\s+/g, " ")
    .trim();

  // 2. Merge everything into full sentences before splitting
  let merged = text
    .replace(/(\w)\s+(\w)/g, "$1 $2") // normalize spacing
    .replace(/([a-z])([A-Z])/g, "$1. $2") // fix missing periods
    .replace(/(\d)\s+(\d)/g, "$1$2") // fix split numbers
    .replace(/\s{2,}/g, " ");

  // 3. Now split into real lines
  let lines = merged
    .split(/(?<=\.)\s+/) // split on sentence boundaries
    .map(l => l.trim())
    .filter(l => l.length > 0);

  let narrative = [];
  let ingredients = [];
  let directions = [];

  let mode = "narrative";

  for (let line of lines) {
    const upper = line.toUpperCase();

    // SECTION HEADERS
    if (upper.includes("INGREDIENTS")) {
      mode = "ingredients";
      continue;
    }
    if (upper.includes("DIRECTIONS") || upper.includes("INSTRUCTIONS")) {
      mode = "directions";
      continue;
    }

    // INGREDIENTS
    if (mode === "ingredients") {
      // detect real ingredient lines
      if (/\d/.test(line) || /(cup|teaspoon|tablespoon|can|egg|flour|milk|cream)/i.test(line)) {
        ingredients.push(line);
        continue;
      }
    }

    // DIRECTIONS
    if (mode === "directions") {
      directions.push(line);
      continue;
    }

    // NARRATIVE
    if (mode === "narrative") {
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

// -----------------------------
// GLOBALS
// -----------------------------
let recipes = [];

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
  container.innerHTML = "";

  list.forEach(recipe => {
    const card = document.createElement("div");
    card.className = "recipe-card";

    const link = document.createElement("a");
    link.textContent = recipe.name;
    link.href = `recipe.html?id=${encodeURIComponent(recipe.id)}`;

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
// SEARCH → DIRECT NAVIGATION
// -----------------------------
const search = document.getElementById("search");
const searchBtn = document.getElementById("search-btn");

function runSearch() {
  const query = search.value.toLowerCase();

  const filtered = recipes.filter(recipe => {
    const name = recipe.name || "";
    const titleLine =
      Array.isArray(recipe.directions) && recipe.directions.length > 0
        ? recipe.directions[0]
        : "";

    return fuzzyMatch(name, query) || fuzzyMatch(titleLine, query);
  });

  if (filtered.length === 1) {
    window.location.href = `recipe.html?id=${encodeURIComponent(filtered[0].id)}`;
    return;
  }

  renderRecipes(filtered);
}

search.addEventListener("input", runSearch);
searchBtn.addEventListener("click", () => {
  runSearch();
});

// -----------------------------
// AUTO FORMATTER (RELIABLE VERSION)
// -----------------------------
function autoFormatRecipe(raw, name) {
  let lines = raw
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    return { title: name, ingredients: [], directions: [] };
  }

  let ingredients = [];
  let directions = [];

  let inIngredients = false;
  let inDirections = false;

  for (let line of lines) {
    const lower = line.toLowerCase();

    if (lower.startsWith("ingredients")) {
      inIngredients = true;
      inDirections = false;
      continue;
    }

    if (lower.startsWith("directions") || lower.startsWith("instructions") || lower.startsWith("method")) {
      inIngredients = false;
      inDirections = true;
      continue;
    }

    if (inIngredients) {
      ingredients.push("• " + line.replace(/^[-•]\s*/, ""));
      continue;
    }

    if (inDirections) {
      directions.push(line);
      continue;
    }
  }

  // If no explicit sections found → fallback
  if (ingredients.length === 0 && directions.length === 0) {
    const ingredientKeywords = [
      "cup", "tsp", "tbsp", "teaspoon", "tablespoon",
      "oz", "ounce", "lb", "pound", "clove", "slice",
      "gram", "kg", "ml", "liter", "pinch"
    ];

    for (let line of lines) {
      const lower = line.toLowerCase();
      const looksLikeIngredient =
        ingredientKeywords.some(k => lower.includes(k)) ||
        /^[0-9]/.test(line) ||
        line.includes(",");

      if (looksLikeIngredient) {
        ingredients.push("• " + line.replace(/^[-•]\s*/, ""));
      } else {
        directions.push(line);
      }
    }
  }

  const numberedDirections = directions.map((step, i) => `${i + 1}. ${step}`);

  return {
    title: name,
    ingredients,
    directions: numberedDirections
  };
}

// -----------------------------
// UPLOAD HANDLING
// -----------------------------
const fileInput = document.getElementById("recipe-file");
const uploadbtn = document.getElementById("upload-btn");
const uploadName = document.getElementById("upload-name");

uploadbtn.addEventListener("click", () => {
  const file = fileInput.files[0];
  const name = uploadName.value.trim();

  if (!name) {
    alert("Please enter a recipe name.");
    return;
  }

  if (!file) {
    alert("Please select a file first.");
    return;
  }

  const extension = file.name.split(".").pop().toLowerCase();

  if (extension === "docx") {
    alert("DOCX files are not supported. Please upload a PDF or plain text file.");
    return;
  }

  if (extension === "pdf") {
    readPDF(file, name);
  } else {
    readTextFile(file, name);
  }
});

// -----------------------------
// READ TEXT FILE
// -----------------------------
function readTextFile(file, name) {
  const reader = new FileReader();

  reader.onload = () => {
    processRecipeText(reader.result, name);
  };

  reader.readAsText(file);
}

// -----------------------------
// READ PDF FILE
// -----------------------------
function readPDF(file, name) {
  const reader = new FileReader();

  reader.onload = async () => {
    try {
      const typedArray = new Uint8Array(reader.result);
      const pdf = await pdfjsLib.getDocument(typedArray).promise;

      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        fullText += strings.join("\n") + "\n";
      }

      processRecipeText(fullText, name);
    } catch (err) {
      console.error("PDF READ ERROR:", err);
      alert("Could not read PDF. Please try a different file.");
    }
  };

  reader.readAsArrayBuffer(file);
}

// -----------------------------
// PROCESS + SAVE FORMATTED RECIPE
// -----------------------------
function processRecipeText(text, name) {
  const formatted = autoFormatRecipe(text, name);

  const newRecipe = {
    name,
    ingredients: formatted.ingredients,
    directions: [formatted.title, ...formatted.directions]
  };

  db.collection("recipes").doc(name).set(newRecipe)
    .then(() => {
      alert("Recipe uploaded successfully!");
      uploadName.value = "";
      fileInput.value = "";

      recipes.push({ id: name, ...newRecipe });
      renderRecipes(recipes);
    })
    .catch(err => {
      console.error("Error uploading recipe:", err);
      alert("Error uploading recipe. Check console for details.");
    });
}

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

  const reader = new FileReader();

  reader.onload = () => {
    const text = reader.result;

    // New format:
    // Line 1: ingredients (comma separated)
    // Line 2+: directions (one per line)
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

    const ingredients = (lines[0] || "")
      .split(",")
      .map(i => i.trim())
      .filter(i => i.length > 0);

    const directions = lines.slice(1);

    if (ingredients.length === 0) {
      alert("File format incorrect. First line must contain ingredients.");
      return;
    }

    const newRecipe = {
      name,
      ingredients,
      directions
    };

    db.collection("recipes").add(newRecipe)
      .then(() => {
        alert("Recipe uploaded successfully!");
        uploadName.value = "";
        fileInput.value = "";
        loadRecipes();
      })
      .catch(err => {
        console.error("Error uploading recipe:", err);
        alert("Error uploading recipe. Check console for details.");
      });
  };

  reader.readAsText(file);
});
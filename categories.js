document.addEventListener("DOMContentLoaded", () => {
  // Read ?cat= from URL
  const params = new URLSearchParams(window.location.search);
  const category = params.get("cat");

  // If category is missing or null, avoid crashing
  if (!category || typeof category !== "string") {
    renderRecipes([]); 
    return;
  }

  // Set page title
  const titleEl = document.getElementById("category-title");
  if (titleEl) {
    titleEl.textContent = category;
  }

  // Realtime listener for recipes
  db.collection("recipes").onSnapshot(snapshot => {
    const recipes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const filtered = recipes.filter(r => {
      const cat = r.category;

      // Skip null, undefined, non-strings
      if (typeof cat !== "string") return false;

      return (
        cat.trim().toLowerCase() ===
        category.trim().toLowerCase()
      );
    });

    renderRecipes(filtered);
  });
});

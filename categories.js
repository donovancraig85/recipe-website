document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("cat");

  document.getElementById("category-title").textContent = category;

  db.collection("recipes").onSnapshot(snapshot => {
    const recipes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const filtered = recipes.filter(r =>
      r.category &&
      r.category.trim().toLowerCase() === category.trim().toLowerCase()
    );

    renderRecipes(filtered);
  });
});

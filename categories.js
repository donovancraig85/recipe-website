// categories.js
// Makes each sidebar category item clickable

function activateCategoryList() {
  const items = document.querySelectorAll("#category-list li");

  items.forEach(item => {
    const cat = item.dataset.cat;
    if (!cat) return;

    item.style.cursor = "pointer";

    item.addEventListener("click", () => {
      window.location.href = `category.html?cat=${encodeURIComponent(cat)}`;
    });
  });
}

document.addEventListener("DOMContentLoaded", activateCategoryList);

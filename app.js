const SHEET_URL =
  "PASTE_YOUR_PUBLISHED_GOOGLE_SHEET_CSV_URL_HERE";

const grid = document.getElementById("bash-grid");

fetch(SHEET_URL)
  .then(r => r.text())
  .then(text => {
    const rows = text.split("\n").slice(1);
    grid.innerHTML = rows.map(r => {
      const [name, photo] = r.split(",");
      if (!name) return "";
      return `
        <div class="bash-card">
          <img class="bash-photo" src="${photo}" />
          <h3 style="padding:10px">${name}</h3>
        </div>
      `;
    }).join("");
  })
  .catch(err => {
    console.error(err);
    grid.innerHTML = "<p>Could not load fighters.</p>";
  });


const fs = require("fs");
const path = require("path");

const username = process.env.GITHUB_USERNAME || "uPedroLima11";
const token = process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error("GITHUB_TOKEN não encontrado.");
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function github(url) {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `GitHub API ${response.status}: ${await response.text()}`
    );
  }

  return response;
}

async function getAllPages(url) {
  const results = [];

  for (let page = 1; ; page++) {
    const separator = url.includes("?") ? "&" : "?";

    const response = await github(
      `${url}${separator}per_page=100&page=${page}`
    );

    const data = await response.json();

    if (!Array.isArray(data)) {
      return data;
    }

    results.push(...data);

    if (data.length < 100) {
      break;
    }
  }

  return results;
}

async function countSearch(query) {
  const response = await github(
    `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=1`
  );

  const data = await response.json();
  return data.total_count || 0;
}

function escapeXML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function shortName(name, max = 42) {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 3)}...`;
}

async function main() {
  console.log(`Gerando estatísticas para ${username}...`);

  const repos = await getAllPages(
    `https://api.github.com/users/${username}/repos?type=owner&sort=updated`
  );

  const ownRepos = repos.filter(
    (repo) => !repo.fork && !repo.archived
  );

  console.log(`${ownRepos.length} repositórios encontrados.`);

  let totalCommits = 0;
  let mostActiveRepo = null;
  let mostActiveCommits = 0;

  for (const repo of ownRepos) {
    try {
      const commits = await getAllPages(
        `https://api.github.com/repos/${username}/${repo.name}/commits?author=${username}`
      );

      const count = commits.length;

      totalCommits += count;

      console.log(`${repo.name}: ${count} commits`);

      if (count > mostActiveCommits) {
        mostActiveCommits = count;
        mostActiveRepo = repo;
      }
    } catch (error) {
      console.warn(
        `${repo.name}: não foi possível contar commits (${error.message})`
      );
    }
  }

  const pullRequests = await countSearch(
    `type:pr author:${username}`
  );

  const repoCount = ownRepos.length;

  const activeRepoName = mostActiveRepo
    ? shortName(mostActiveRepo.name)
    : "Nenhum repositório";

  const activeRepoUrl = mostActiveRepo
    ? mostActiveRepo.html_url
    : `https://github.com/${username}`;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg"
     width="800"
     height="250"
     viewBox="0 0 800 250"
     role="img"
     aria-label="GitHub Stats de Pedro Lima">

  <style>
    .card {
      fill: #0d1117;
      stroke: #30363d;
      stroke-width: 1;
    }

    .title {
      fill: #f0f6fc;
      font: 600 21px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }

    .number {
      fill: #58a6ff;
      font: 700 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }

    .label {
      fill: #8b949e;
      font: 500 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }

    .repoTitle {
      fill: #f0f6fc;
      font: 600 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }

    .repo {
      fill: #58a6ff;
      font: 600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }

    .repoCount {
      fill: #8b949e;
      font: 500 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }

    .divider {
      stroke: #30363d;
      stroke-width: 1;
    }
  </style>

  <rect
    class="card"
    x="0.5"
    y="0.5"
    width="799"
    height="249"
    rx="10"
  />

  <text
    class="title"
    x="400"
    y="38"
    text-anchor="middle"
  >GitHub Activity</text>

  <line
    class="divider"
    x1="40"
    y1="59"
    x2="760"
    y2="59"
  />

  <text
    class="number"
    x="150"
    y="108"
    text-anchor="middle"
  >${totalCommits}</text>

  <text
    class="label"
    x="150"
    y="133"
    text-anchor="middle"
  >Commits</text>

  <text
    class="number"
    x="400"
    y="108"
    text-anchor="middle"
  >${repoCount}</text>

  <text
    class="label"
    x="400"
    y="133"
    text-anchor="middle"
  >Repositórios</text>

  <text
    class="number"
    x="650"
    y="108"
    text-anchor="middle"
  >${pullRequests}</text>

  <text
    class="label"
    x="650"
    y="133"
    text-anchor="middle"
  >Pull Requests</text>

  <line
    class="divider"
    x1="40"
    y1="158"
    x2="760"
    y2="158"
  />

  <text
    class="repoTitle"
    x="40"
    y="190"
  >Repositório mais ativo</text>

  <a href="${escapeXML(activeRepoUrl)}">
    <text
      class="repo"
      x="40"
      y="221"
    >${escapeXML(activeRepoName)}</text>
  </a>

  <text
    class="repoCount"
    x="760"
    y="221"
    text-anchor="end"
  >${mostActiveCommits} commits</text>

</svg>
`.trim();

  const outputDirectory = path.join(
    process.cwd(),
    "images"
  );

  fs.mkdirSync(outputDirectory, {
    recursive: true,
  });

  fs.writeFileSync(
    path.join(outputDirectory, "github-stats.svg"),
    svg
  );

  console.log("");
  console.log("=== RESULTADO ===");
  console.log(`Commits: ${totalCommits}`);
  console.log(`Repositórios: ${repoCount}`);
  console.log(`Pull Requests: ${pullRequests}`);
  console.log(
    `Repositório mais ativo: ${
      mostActiveRepo?.name || "N/A"
    } (${mostActiveCommits} commits)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

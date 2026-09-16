const fs = require("node:fs");
const path = require("node:path");

const username = process.env.GITHUB_USERNAME || "uPedroLima11";
const token = process.env.STATS_TOKEN;

if (!token) {
  throw new Error(
    "STATS_TOKEN não encontrado. Adicione um PAT classic com permissão repo."
  );
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": `${username}-profile-stats`,
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

  for (let page = 1; ; page += 1) {
    const separator = url.includes("?") ? "&" : "?";

    const response = await github(
      `${url}${separator}per_page=100&page=${page}`
    );

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error(`Resposta inesperada para ${url}`);
    }

    results.push(...data);

    if (data.length < 100) {
      return results;
    }
  }
}

function lastPageFromLink(linkHeader) {
  if (!linkHeader) return null;

  for (const part of linkHeader.split(",")) {
    if (!part.includes('rel="last"')) continue;

    const match = part.match(/[?&]page=(\d+)/);

    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

async function countCommits(repo) {
  const url = new URL(
    `https://api.github.com/repos/${repo.owner.login}/${repo.name}/commits`
  );

  url.searchParams.set("author", username);
  url.searchParams.set("per_page", "1");

  const response = await fetch(url, { headers });

  if (response.status === 409) {
    return 0;
  }

  if (!response.ok) {
    throw new Error(
      `GitHub API ${response.status}: ${await response.text()}`
    );
  }

  const commits = await response.json();

  if (!Array.isArray(commits) || commits.length === 0) {
    return 0;
  }

  return lastPageFromLink(response.headers.get("link")) || commits.length;
}

async function countPullRequests() {
  const query = encodeURIComponent(`type:pr author:${username}`);

  const response = await github(
    `https://api.github.com/search/issues?q=${query}&per_page=1`
  );

  const data = await response.json();

  return data.total_count || 0;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function shorten(value, maxLength = 38) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function renderRepositoryRow(item, index) {
  const y = 198 + index * 38;
  const name = escapeXml(shorten(item.repo.name));
  const url = escapeXml(item.repo.html_url);
  const privacyIcon = item.repo.private ? "🔒 " : "";

  return `
  <text class="position" x="42" y="${y}">${index + 1}.</text>
  <a href="${url}">
    <text class="repo" x="72" y="${y}">${privacyIcon}${name}</text>
  </a>
  <text class="repo-count" x="758" y="${y}" text-anchor="end">${item.count} commits</text>`;
}

function renderSvg(stats) {
  const repositoryRows = stats.topRepositories
    .map(renderRepositoryRow)
    .join("");

  const description = stats.topRepositories
    .map(
      (item, index) =>
        `${index + 1}: ${item.repo.name}, ${item.count} commits`
    )
    .join("; ");

  return `<svg xmlns="http://www.w3.org/2000/svg"
  width="800"
  height="305"
  viewBox="0 0 800 305"
  role="img"
  aria-labelledby="title description">

  <title id="title">GitHub Stats de Pedro Lima</title>

  <desc id="description">
    ${stats.totalCommits} commits,
    ${stats.repoCount} repositórios,
    ${stats.pullRequests} pull requests.
    Repositórios mais ativos: ${escapeXml(description)}.
  </desc>

  <style>
    .card {
      fill: #0d1117;
      stroke: #30363d;
    }

    .title {
      fill: #f0f6fc;
      font: 600 20px -apple-system, BlinkMacSystemFont, "Segoe UI",
        Helvetica, Arial, sans-serif;
    }

    .number {
      fill: #58a6ff;
      font: 700 29px -apple-system, BlinkMacSystemFont, "Segoe UI",
        Helvetica, Arial, sans-serif;
    }

    .label,
    .section-title {
      fill: #8b949e;
      font: 500 13px -apple-system, BlinkMacSystemFont, "Segoe UI",
        Helvetica, Arial, sans-serif;
    }

    .position {
      fill: #8b949e;
      font: 600 15px -apple-system, BlinkMacSystemFont, "Segoe UI",
        Helvetica, Arial, sans-serif;
    }

    .repo {
      fill: #58a6ff;
      font: 600 16px -apple-system, BlinkMacSystemFont, "Segoe UI",
        Helvetica, Arial, sans-serif;
    }

    .repo-count {
      fill: #c9d1d9;
      font: 500 14px -apple-system, BlinkMacSystemFont, "Segoe UI",
        Helvetica, Arial, sans-serif;
    }

    .divider {
      stroke: #30363d;
    }
  </style>

  <rect
    class="card"
    x="0.5"
    y="0.5"
    width="799"
    height="304"
    rx="10"
  />

  <text class="title" x="400" y="34" text-anchor="middle">
    GitHub Activity
  </text>

  <line class="divider" x1="40" y1="51" x2="760" y2="51"/>

  <text class="number" x="150" y="94" text-anchor="middle">
    ${stats.totalCommits}
  </text>

  <text class="label" x="150" y="118" text-anchor="middle">
    Commits
  </text>

  <text class="number" x="400" y="94" text-anchor="middle">
    ${stats.repoCount}
  </text>

  <text class="label" x="400" y="118" text-anchor="middle">
    Repositórios
  </text>

  <text class="number" x="650" y="94" text-anchor="middle">
    ${stats.pullRequests}
  </text>

  <text class="label" x="650" y="118" text-anchor="middle">
    Pull Requests
  </text>

  <line class="divider" x1="40" y1="137" x2="760" y2="137"/>

  <text class="section-title" x="42" y="164">
    Top 3 repositórios mais ativos
  </text>

  ${repositoryRows}
</svg>
`;
}

async function main() {
  console.log(`Gerando estatísticas públicas e privadas de ${username}...`);

  const repositories = await getAllPages(
    "https://api.github.com/user/repos" +
      "?visibility=all" +
      "&affiliation=owner,collaborator" +
      "&sort=updated"
  );

  const uniqueRepositories = [
    ...new Map(
      repositories.map((repo) => [repo.full_name.toLowerCase(), repo])
    ).values(),
  ];

  /*
   * O número exibido no perfil conta os repositórios pertencentes ao Pedro.
   * Repositórios de colaboradores, como quadra_adm, participam do Top 3,
   * mas não aumentam o número "Repositórios".
   */
  const ownedRepositories = uniqueRepositories.filter(
    (repo) =>
      repo.owner.login.toLowerCase() === username.toLowerCase()
  );

  const repositoriesToAnalyze = uniqueRepositories.filter(
    (repo) => !repo.archived
  );

  const commitCounts = [];

  for (const repo of repositoriesToAnalyze) {
    try {
      const count = await countCommits(repo);

      commitCounts.push({
        repo,
        count,
      });

      console.log(
        `${repo.full_name}: ${count} commits${repo.private ? " (privado)" : ""}`
      );
    } catch (error) {
      console.warn(
        `${repo.full_name}: contagem ignorada (${error.message})`
      );
    }
  }

  if (commitCounts.length !== repositoriesToAnalyze.length) {
    throw new Error(
      `Contagem incompleta: ${commitCounts.length} de ` +
        `${repositoriesToAnalyze.length} repositórios. ` +
        "O SVG anterior foi preservado."
    );
  }

  commitCounts.sort(
    (a, b) =>
      b.count - a.count ||
      a.repo.full_name.localeCompare(b.repo.full_name)
  );

  const topRepositories = commitCounts
    .filter((item) => item.count > 0)
    .slice(0, 3);

  if (topRepositories.length === 0) {
    throw new Error("Nenhum commit foi encontrado.");
  }

  const stats = {
    totalCommits: commitCounts.reduce(
      (total, item) => total + item.count,
      0
    ),
    repoCount: ownedRepositories.length,
    pullRequests: await countPullRequests(),
    topRepositories,
  };

  const output = path.join(
    process.cwd(),
    "images",
    "github-stats.svg"
  );

  fs.mkdirSync(path.dirname(output), {
    recursive: true,
  });

  fs.writeFileSync(
    output,
    renderSvg(stats),
    "utf8"
  );

  console.log("GitHub Stats gerado com sucesso:", {
    totalCommits: stats.totalCommits,
    repoCount: stats.repoCount,
    pullRequests: stats.pullRequests,
    topRepositories: stats.topRepositories.map((item) => ({
      repository: item.repo.full_name,
      private: item.repo.private,
      commits: item.count,
    })),
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

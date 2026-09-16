const fs = require("node:fs");
const path = require("node:path");

const username = process.env.GITHUB_USERNAME || "uPedroLima11";
const token = process.env.GITHUB_TOKEN;

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": `${username}-profile-stats`,
};

async function github(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }
  return response;
}

async function getAllPages(url) {
  const results = [];
  for (let page = 1; ; page += 1) {
    const separator = url.includes("?") ? "&" : "?";
    const response = await github(`${url}${separator}per_page=100&page=${page}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(`Resposta inesperada para ${url}`);
    results.push(...data);
    if (data.length < 100) return results;
  }
}

function lastPageFromLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    if (!part.includes('rel="last"')) continue;
    const match = part.match(/[?&]page=(\d+)/);
    if (match) return Number(match[1]);
  }
  return null;
}

async function countCommits(repo) {
  const url = new URL(`https://api.github.com/repos/${repo.owner.login}/${repo.name}/commits`);
  url.searchParams.set("author", username);
  url.searchParams.set("per_page", "1");
  const response = await fetch(url, { headers });
  if (response.status === 409) return 0;
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }
  const commits = await response.json();
  if (!Array.isArray(commits) || commits.length === 0) return 0;
  return lastPageFromLink(response.headers.get("link")) || commits.length;
}

async function countPullRequests() {
  const query = encodeURIComponent(`type:pr author:${username}`);
  const response = await github(`https://api.github.com/search/issues?q=${query}&per_page=1`);
  const data = await response.json();
  return data.total_count || 0;
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function shorten(value, maxLength = 42) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function renderSvg(stats) {
  const repoName = escapeXml(shorten(stats.mostActiveRepo.name));
  const repoUrl = escapeXml(stats.mostActiveRepo.html_url);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="220" viewBox="0 0 800 220" role="img" aria-labelledby="title description">
  <title id="title">GitHub Stats de Pedro Lima</title>
  <desc id="description">${stats.totalCommits} commits em repositórios públicos próprios, ${stats.repoCount} repositórios públicos, ${stats.pullRequests} pull requests e repositório mais ativo ${repoName}, com ${stats.mostActiveCommits} commits.</desc>
  <style>
    .card { fill: #0d1117; stroke: #30363d; }
    .title { fill: #f0f6fc; font: 600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .number { fill: #58a6ff; font: 700 29px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .label, .repo-title { fill: #8b949e; font: 500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .repo { fill: #58a6ff; font: 600 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .repo-count { fill: #c9d1d9; font: 500 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .divider { stroke: #30363d; }
  </style>
  <rect class="card" x="0.5" y="0.5" width="799" height="219" rx="10"/>
  <text class="title" x="400" y="34" text-anchor="middle">GitHub Activity</text>
  <line class="divider" x1="40" y1="51" x2="760" y2="51"/>
  <text class="number" x="150" y="94" text-anchor="middle">${stats.totalCommits}</text>
  <text class="label" x="150" y="118" text-anchor="middle">Commits</text>
  <text class="number" x="400" y="94" text-anchor="middle">${stats.repoCount}</text>
  <text class="label" x="400" y="118" text-anchor="middle">Repositórios</text>
  <text class="number" x="650" y="94" text-anchor="middle">${stats.pullRequests}</text>
  <text class="label" x="650" y="118" text-anchor="middle">Pull Requests</text>
  <line class="divider" x1="40" y1="137" x2="760" y2="137"/>
  <text class="repo-title" x="40" y="165">Repositório mais ativo</text>
  <a href="${repoUrl}"><text class="repo" x="40" y="194">${repoName}</text></a>
  <text class="repo-count" x="760" y="194" text-anchor="end">${stats.mostActiveCommits} commits</text>
</svg>\n`;
}

async function main() {
  if (!token) throw new Error("GITHUB_TOKEN não encontrado.");
  console.log(`Gerando estatísticas públicas de ${username}...`);
  const repos = await getAllPages(`https://api.github.com/users/${username}/repos?type=owner&sort=updated`);
  const ownRepos = repos.filter((repo) => !repo.fork && !repo.archived);
  const commitCounts = [];

  for (const repo of ownRepos) {
    try {
      const count = await countCommits(repo);
      commitCounts.push({ repo, count });
      console.log(`${repo.name}: ${count} commits`);
    } catch (error) {
      console.warn(`${repo.name}: contagem ignorada (${error.message})`);
    }
  }

  if (commitCounts.length !== ownRepos.length) {
    throw new Error(`Contagem incompleta: ${commitCounts.length} de ${ownRepos.length} repositórios. O SVG anterior foi preservado.`);
  }

  commitCounts.sort((a, b) => b.count - a.count || a.repo.name.localeCompare(b.repo.name));
  const mostActive = commitCounts[0];
  if (!mostActive) throw new Error("Nenhum repositório público próprio foi encontrado.");

  const stats = {
    totalCommits: commitCounts.reduce((total, item) => total + item.count, 0),
    repoCount: ownRepos.length,
    pullRequests: await countPullRequests(),
    mostActiveRepo: mostActive.repo,
    mostActiveCommits: mostActive.count,
  };
  const output = path.join(process.cwd(), "images", "github-stats.svg");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, renderSvg(stats), "utf8");
  console.log("GitHub Stats gerado com sucesso:", stats);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { renderSvg };

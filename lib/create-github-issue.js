require(`./load-env-file.js`);

const Octokit = require(`@octokit/rest`);

/**
 * @param {String} title The issue heading.
 * @param {String} body Further text describing the issue (may include markdown and newlines).
 * @param {Array.<String>|null} [labels=[]] Array of label names the created issue should be tagged with.
 * @returns {Promise.<String, Error>} A promise that resolves to the issue URL, or rejects with an error.
 */
module.exports = async function createIssue(title, body, labels = []) {
  const repository = process.env.NODE_ENV === `production` ? `open-fixture-library` : `ofl-test`;

  const userToken = process.env.GITHUB_USER_TOKEN;
  if (userToken === undefined) {
    console.error(`.env file does not contain GITHUB_USER_TOKEN variable`);
    throw new Error(`GitHub user token was not set`);
  }

  const githubClient = new Octokit({
    auth: `token ${userToken}`
  });

  const result = await githubClient.issues.create({
    owner: `OpenLightingProject`,
    repo: repository,
    title: title,
    body: body,
    labels: labels
  });

  return result.data.html_url;
};
